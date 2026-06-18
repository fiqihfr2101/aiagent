import asyncio
import json
import uuid

class HermesEngine:
    def __init__(self, broadcast_callback):
        self.broadcast_callback = broadcast_callback
        self.agents = [
            {"id": "jarvis", "name": "JARVIS", "role": "Squad Lead", "status": "active", "task": "Coordinating agent fleet tasks", "seen": "just now", "uptime": "99.8%", "hb": "2s", "color": "#00D4AA"},
            {"id": "architect", "name": "ARCHITECT", "role": "Strategist", "status": "active", "task": "Architect fleet check started", "seen": "just now", "uptime": "99.4%", "hb": "3s", "color": "#6366F1"},
        ]
        self.tasks = []
        self.logs = []

    async def register_agent(self, name, role, model):
        """Simulate Hermes agent spawning."""
        new_agent = {
            "id": name.lower().replace(" ", "_"),
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
        await self.log("SYSTEM", "INFO", f"Registered new agent: {name.upper()} ({role})")
        await self.sync_fleet()
        return new_agent

    async def log(self, agent_name, level, message):
        import datetime
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
