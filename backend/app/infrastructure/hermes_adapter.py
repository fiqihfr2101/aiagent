import os
from hermes_agent import AIAgent
from typing import Optional, List
import asyncio

class HermesAdapter:
    def __init__(self, model: str = "anthropic/claude-3-5-sonnet", enabled_toolsets: Optional[List[str]] = None):
        self.model = model
        self.enabled_toolsets = enabled_toolsets or ["web_search", "filesystem", "terminal"]
        
    async def run_task(self, prompt: str, on_log_callback=None):
        """
        Runs a task using the Hermes AIAgent.
        on_log_callback: function to handle streaming logs/output
        """
        # Initialize agent
        # Note: In a production environment, you'd manage sessions better.
        agent = AIAgent(
            model=self.model,
            quiet_mode=True,
            skip_memory=False, # Let Hermes use its local SQLite for skill learning
            skip_context_files=True
        )

        if on_log_callback:
            await on_log_callback(f"SYSTEM: Initializing Hermes Agent with model {self.model}...")

        # Since Hermes AIAgent.chat is synchronous, we run it in a thread to keep FastAPI/Temporal async
        loop = asyncio.get_event_loop()
        try:
            response = await loop.run_in_executor(None, agent.chat, prompt)
            
            if on_log_callback:
                await on_log_callback(f"HERMES: Task completed. Response received.")
            
            return response
        except Exception as e:
            if on_log_callback:
                await on_log_callback(f"ERROR: Hermes execution failed: {str(e)}")
            raise e
