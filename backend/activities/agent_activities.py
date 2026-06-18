from temporalio import activity
import asyncio
from app.infrastructure.hermes_adapter import HermesAdapter
from app.infrastructure.memory_manager import MemoryManager
import os

class AgentActivities:
    def __init__(self):
        self.memory_manager = MemoryManager()
        # In a real scenario, we might want to initialize adapters per agent/model
        self.hermes = HermesAdapter()

    @activity.def
    async def process_hermes_task(self, task_data: dict) -> dict:
        agent_id = task_data.get("agent_id")
        prompt = task_data.get("title")
        
        print(f"Agent {agent_id} starting Hermes task: {prompt}")
        
        # In a production app, we would use a callback to stream logs to WebSocket
        # For now, we'll just run the task and return the final response
        try:
            response = await self.hermes.run_task(prompt)
            return {
                "status": "completed",
                "agent_id": agent_id,
                "output": response
            }
        except Exception as e:
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
