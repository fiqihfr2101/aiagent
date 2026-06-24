from temporalio import activity
import asyncio
import httpx
from app.infrastructure.hermes_adapter import HermesAdapter
from app.infrastructure.memory_manager import MemoryManager
import os

class AgentActivities:
    def __init__(self):
        self.memory_manager = MemoryManager()
        # In a real scenario, we might want to initialize adapters per agent/model
        self.hermes = HermesAdapter()
        self.api_url = os.getenv("BACKEND_INTERNAL_URL", "http://localhost:8000")

    async def _log_to_api(self, agent_id: str, level: str, message: str):
        """Sends logs back to the main FastAPI app to be broadcasted via WebSockets."""
        try:
            async with httpx.AsyncClient() as client:
                await client.post(f"{self.api_url}/log", json={
                    "agent_name": agent_id.upper(),
                    "level": level,
                    "message": message
                })
        except Exception as e:
            print(f"Failed to send log to API: {e}")

    @activity.def
    async def process_hermes_task(self, task_data: dict) -> dict:
        agent_id = task_data.get("agent_id")
        prompt = task_data.get("title")
        
        async def log_callback(msg):
            await self._log_to_api(agent_id, "INFO", msg)
        
        print(f"Agent {agent_id} starting Hermes task: {prompt}")
        await log_callback(f"Initializing task: {prompt}")
        
        try:
            response = await self.hermes.run_task(prompt, on_log_callback=log_callback)
            return {
                "status": "completed",
                "agent_id": agent_id,
                "output": response
            }
        except Exception as e:
            await self._log_to_api(agent_id, "ERROR", f"Task execution failed: {str(e)}")
            return {
                "status": "failed",
                "agent_id": agent_id,
                "error": str(e)
            }

    @activity.def
    async def save_task_to_memory(self, result: dict) -> bool:
        if result.get("status") == "completed":
            agent_id = result.get("agent_id")
            output = result.get("output")
            
            await self.memory_manager.add_memory(
                agent_id=agent_id,
                mem_type="fact",
                title=f"Completed Task Result",
                body=output
            )
            return True
        return False
