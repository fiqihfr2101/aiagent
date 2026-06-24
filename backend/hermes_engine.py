import asyncio
import json
import uuid
import datetime
from typing import Optional

from app.infrastructure.metrics_collector import MetricsCollector
from app.infrastructure.agent_repository import AgentRepository


class HermesEngine:
    def __init__(self, broadcast_callback, metrics_collector: Optional[MetricsCollector] = None):
        self.broadcast_callback = broadcast_callback
        self.metrics = metrics_collector or MetricsCollector()
        self.repo = AgentRepository()
        self.agents = []
        self.tasks = []
        self.logs = []

    async def initialize(self):
        """Load agents from DB, seed defaults if empty."""
        existing = self.repo.get_all()
        if existing:
            self.agents = existing
        else:
            # Seed default agents
            self.repo.create("JARVIS", "Squad Lead", "claude-sonnet-4", "active", "#00D4AA")
            self.repo.create("ARCHITECT", "Strategist", "gpt-4o", "active", "#6366F1")
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
            await self.log("SYSTEM", "INFO", f"Updated agent: {agent['name']}")
            await self.sync_fleet()
        return agent

    async def update_agent_model(self, agent_id: str, model: str):
        """Update agent's model."""
        return await self.update_agent(agent_id, model=model)

    async def delete_agent(self, agent_id: str) -> bool:
        """Delete agent from DB and sync."""
        agent = self.repo.get_by_id(agent_id)
        if not agent:
            return False
        name = agent["name"]
        self.repo.delete(agent_id)
        self.agents = self.repo.get_all()
        await self.log("SYSTEM", "INFO", f"Removed agent: {name}")
        await self.sync_fleet()
        return True

    def get_agents(self):
        """Return current agents from DB."""
        self.agents = self.repo.get_all()
        return self.agents

    def get_agent(self, agent_id: str):
        """Get single agent by ID."""
        return self.repo.get_by_id(agent_id)

    async def log(self, agent_name, level, message):
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        log_entry = [ts, agent_name, level, message]
        self.logs.append(log_entry)
        await self.broadcast_callback(json.dumps({
            "type": "log",
            "data": log_entry
        }))

    async def sync_fleet(self):
        await self.broadcast_callback(json.dumps({
            "type": "fleet_update",
            "agents": self.agents
        }))

    async def start_mock_activity(self):
        """Simulate random agent activity."""
        while True:
            await asyncio.sleep(10)
            if self.agents:
                import random
                agent = random.choice(self.agents)
                await self.log(agent["name"], "INFO", f"Processing heartbeat for node {agent['id']}")
                await self.metrics.update_agent_seen(agent["id"])

    async def submit_task(self, agent_id: str, title: str, priority: str = "medium"):
        """Submit a task and track it via metrics."""
        task_id = f"task-{agent_id}-{uuid.uuid4().hex[:8]}"
        task = {
            "id": task_id,
            "agent_id": agent_id,
            "title": title,
            "priority": priority,
            "status": "pending",
            "created_at": datetime.datetime.now().isoformat(),
        }
        self.tasks.append(task)
        await self.metrics.start_task(task_id, agent_id)
        await self.log("SYSTEM", "INFO", f"Task submitted: {title} → {agent_id}")
        return task

    async def stop_task(self, task_id: str):
        """Stop a task — update status in DB and log."""
        from app.infrastructure.task_repository import TaskRepository
        repo = TaskRepository()
        task = repo.get_by_id(task_id)
        if task:
            repo.update_status(task_id, "STOPPED")
            await self.log("SYSTEM", "INFO", f"Task stopped: {task['title']} (cleanup performed)")
        return task

    async def complete_task(self, task_id: str, success: bool = True, duration: float = 0.0, token_usage: int = 0):
        """Mark a task as completed and update metrics."""
        for task in self.tasks:
            if task["id"] == task_id:
                task["status"] = "success" if success else "failed"
                break
        await self.metrics.complete_task(task_id, success, duration, token_usage)
        await self.metrics.record_task_completion(
            agent_id=task_id.split("-")[1] if "-" in task_id else "unknown",
            success=success,
            duration=duration,
            token_usage=token_usage,
        )
        await self.log("SYSTEM", "INFO", f"Task {task_id} completed: {'success' if success else 'failed'}")
