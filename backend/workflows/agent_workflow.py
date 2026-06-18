from datetime import timedelta
from temporalio import workflow
from typing import Any

# Import activities (we will define them later)
with workflow.unsafe.imports_passed_through():
    from activities.agent_activities import AgentActivities

@workflow.def
class AgentTaskWorkflow:
    @workflow.run
    async def run(self, task_data: dict) -> dict:
        # Step 1: Initialize Task
        # Step 2: Call Hermes Agent to process (Activity)
        result = await workflow.execute_activity(
            AgentActivities.process_hermes_task,
            task_data,
            start_to_close_timeout=timedelta(minutes=5),
        )
        
        # Step 3: Record result to memory (Activity)
        await workflow.execute_activity(
            AgentActivities.save_task_to_memory,
            result,
            start_to_close_timeout=timedelta(minutes=1),
        )
        
        return result
