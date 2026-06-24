import asyncio
import json
import uuid
import datetime
from typing import Optional

from app.infrastructure.metrics_collector import MetricsCollector


class HermesEngine:
    def __init__(self, broadcast_callback, metrics_collector: Optional[MetricsCollector] = None):
        self.broadcast_callback = broadcast_callback
        self.metrics = metrics_collector or MetricsCollector()
        self.agents = [
            {"id": "jarvis", "name": "JARVIS", "role": "Squad Lead", "status": "active", "task": "Coordinating agent fleet tasks", "seen": "just now", "uptime": "99.8%", "hb": "2s", "color": "#00D4AA"},
            {"id": "architect", "name": "ARCHITECT", "role": "Strategist", "status": "active", "task": "Architect fleet check started", "seen": "just now", "uptime": "99.4%", "hb": "3s", "color": "#6366F1"},
        ]
        self.tasks = []
        self.logs = []

    async def register_agent(self, name, role, model):
        """Simulate Hermes agent spawning."""
        agent_id = name.lower().replace(" ", "_")
        new_agent = {
            "id": agent_id,
            "name": name.upper(),
            "role": role,
            "status": "active",
            "task": f"Initializing with model {model}...",
            "seen": "just now",
            "uptime": "100%",
            "hb": "1s",
            "color": "#00D4AA"
        }
        self.agents.append(new_agent)

        # Register with metrics collector
        await self.metrics.register_agent(agent_id, name.upper())

        await self.log("SYSTEM", "INFO", f"Registered new agent: {name.upper()} ({role})")
        await self.sync_fleet()
        return new_agent

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
                # Update metrics last-seen
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
