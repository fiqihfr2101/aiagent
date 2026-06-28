import asyncio
from temporalio.client import Client
from temporalio.worker import Worker
import os

from workflows.agent_workflow import AgentTaskWorkflow
from activities.agent_activities import AgentActivities

async def main():
    # Connect to Temporal server with retry
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "localhost:7233")
    
    max_retries = 30
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            print(f"Connecting to Temporal at {temporal_address} (attempt {attempt + 1}/{max_retries})...")
            client = await Client.connect(temporal_address)
            print(f"Connected to Temporal successfully!")
            break
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"Failed to connect: {e}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
            else:
                print(f"Failed to connect after {max_retries} attempts: {e}")
                raise

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
            activities.report_task_status,
        ],
    )
    
    print(f"Temporal Worker started on {temporal_address}...")
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
