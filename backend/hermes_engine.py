import asyncio
import json
import uuid
import datetime
from typing import Optional

from app.infrastructure.metrics_collector import MetricsCollector
from app.infrastructure.agent_repository_pg import AgentRepository
from app.infrastructure.message_bus import MessageBus


class HermesEngine:
    def __init__(self, broadcast_callback, metrics_collector: Optional[MetricsCollector] = None, task_repo=None):
        self.broadcast_callback = broadcast_callback
        self.metrics = metrics_collector or MetricsCollector()
        self.repo = AgentRepository()
        self.agents = []
        self.tasks = []
        self.logs = []
        self.task_repo = task_repo
        self.message_bus = MessageBus()
        self._last_activity: dict[str, float] = {}  # agent_id -> last activity timestamp

    async def initialize(self):
        """Load agents from DB, seed defaults if empty."""
        existing = self.repo.get_all()
        if existing:
            self.agents = existing
        else:
            # Seed default agents (idle by default, no tasks assigned)
            self.repo.create("JARVIS", "Squad Lead", "claude-sonnet-4", "idle", "#00D4AA")
            self.repo.create("ARCHITECT", "Strategist", "gpt-4o", "idle", "#6366F1")
            self.agents = self.repo.get_all()

    async def register_agent(self, name, role, model):
        """Register a new agent with persistence."""
        agent = self.repo.create(name.upper(), role, model)
        # Enrich with display fields
        agent["seen"] = "just now"
        agent["uptime"] = "100%"
        agent["hb"] = "1s"
        self.agents = self.repo.get_all()

        await self.metrics.register_agent(agent["id"], agent["name"])
        await self.log("SYSTEM", "INFO", f"Registered new agent: {name.upper()} ({role})")
        await self.sync_fleet()
        return agent

    async def update_agent(self, agent_id: str, **kwargs):
        """Update agent config in DB and sync."""
        agent = self.repo.update(agent_id, **kwargs)
        if agent:
            self.agents = self.repo.get_all()
            await self.sync_fleet()
        return agent

    async def delete_agent(self, agent_id: str) -> bool:
        """Delete an agent."""
        result = self.repo.delete(agent_id)
        if result:
            self.agents = self.repo.get_all()
            await self.sync_fleet()
        return result

    def get_agent(self, agent_id: str):
        """Get agent by ID."""
        return self.repo.get_by_id(agent_id)

    def get_agents(self):
        """Get all agents."""
        return self.agents

    async def set_agent_status(self, agent_id: str, status: str):
        """Update agent status in DB and sync fleet."""
        # Track activity timestamp for sleeping detection
        if status == "active":
            self._last_activity[agent_id] = asyncio.get_event_loop().time()
        self.repo.update_status(agent_id, status)
        self.agents = self.repo.get_all()
        await self.sync_fleet()

    async def sync_fleet(self):
        """Broadcast fleet update to all connected clients."""
        await self.broadcast_callback(json.dumps({
            "type": "fleet_update",
            "agents": self.agents,
        }))

    async def log(self, agent_name: str, level: str, message: str):
        """Log a message."""
        log_entry = {
            "timestamp": datetime.datetime.now().isoformat(),
            "agent": agent_name,
            "level": level,
            "message": message,
        }
        self.logs.append(log_entry)
        # Keep only last 1000 logs
        if len(self.logs) > 1000:
            self.logs = self.logs[-1000:]

    async def heartbeat(self):
        """Send heartbeat to all agents, mark idle agents as sleeping after timeout."""
        SLEEPING_TIMEOUT = 300  # 5 minutes
        while True:
            await asyncio.sleep(10)  # Check every 10 seconds
            now = asyncio.get_event_loop().time()
            for agent in self.agents:
                agent_id = agent["id"]
                status = agent.get("status", "idle")

                # If agent is idle and hasn't had activity for 5+ min → sleeping
                if status == "idle":
                    last = self._last_activity.get(agent_id, 0)
                    if last > 0 and (now - last) > SLEEPING_TIMEOUT:
                        self.repo.update_status(agent_id, "sleeping")
                        agent["status"] = "sleeping"

                # Update display heartbeat fields
                if status == "active":
                    agent["hb"] = "1s"
                    agent["seen"] = "just now"
                elif status == "idle":
                    agent["hb"] = "10s"
                    agent["seen"] = "recently"
                elif status == "sleeping":
                    agent["hb"] = ">5m"
                    agent["seen"] = "a while ago"

    async def start_mock_activity(self):
        """Start mock activity for demo purposes."""
        # This method is called during startup but does nothing in production
        pass
