import asyncio
from temporalio.client import Client
from temporalio.worker import Worker
import os

from workflows.agent_workflow import AgentTaskWorkflow
from activities.agent_activities import AgentActivities

async def main():
    # Connect to Temporal server
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    client = await Client.connect(temporal_address)

    # Initialize activities
    activities = AgentActivities()

    # Run the worker
    worker = Worker(
        client,
        task_queue="hermes-task-queue",
        workflows=[AgentTaskWorkflow],
        activities=[
            activities.process_hermes_task,
            activities.save_task_to_memory,
        ],
    )
    
    print(f"Temporal Worker started on {temporal_address}...")
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
