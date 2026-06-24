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

    async def _update_task_status(self, task_id: str, status: str, result: str = None, tokens_used: int = None):
        """Update task status in DB via internal API."""
        try:
            async with httpx.AsyncClient() as client:
                payload = {"status": status}
                if result:
                    payload["result"] = result
                if tokens_used is not None:
                    payload["tokens_used"] = tokens_used
                await client.post(f"{self.api_url}/tasks/{task_id}/status", json=payload)
        except Exception as e:
            print(f"Failed to update task status: {e}")

    @activity.defn
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

    @activity.defn
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

    @activity.defn
    async def report_task_status(self, data: dict) -> bool:
        """Report task status change to the main API, which updates DB and broadcasts via WebSocket."""
        task_id = data.get("task_id")
        status = data.get("status")
        result = data.get("result")
        error = data.get("error")

        result_str = None
        if result:
            import json
            result_str = json.dumps(result) if isinstance(result, dict) else str(result)
        elif error:
            result_str = str(error)

        await self._update_task_status(task_id, status, result=result_str)
        return True
