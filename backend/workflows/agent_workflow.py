from datetime import timedelta
from temporalio import workflow
from typing import Any, Optional

# Import activities (we will define them later)
with workflow.unsafe.imports_passed_through():
    from activities.agent_activities import AgentActivities


@workflow.defn
class AgentTaskWorkflow:
    """Task dispatch workflow with progress signals: QUEUED → RUNNING → COMPLETED/FAILED."""

    def __init__(self):
        self._status = "QUEUED"
        self._result: Optional[dict] = None

    @workflow.signal
    async def cancel_task(self):
        """Signal to cancel/stop the running task."""
        self._status = "STOPPED"

    @workflow.query
    def get_status(self) -> str:
        """Query current task status."""
        return self._status

    @workflow.run
    async def run(self, task_data: dict) -> dict:
        self._status = "RUNNING"
        agent_id = task_data.get("agent_id")
        task_id = task_data.get("task_id")

        # Report RUNNING status via API (which broadcasts to WebSocket)
        try:
            await workflow.execute_activity(
                AgentActivities.report_task_status,
                {"task_id": task_id, "status": "RUNNING", "agent_id": agent_id},
                start_to_close_timeout=timedelta(seconds=30),
            )
        except Exception:
            pass

        # Check if cancelled before starting
        if self._status == "STOPPED":
            await self._finalize(task_id, "STOPPED", agent_id)
            return {"status": "stopped", "task_id": task_id}

        # Step 1: Call Hermes Agent to process (Activity)
        try:
            result = await workflow.execute_activity(
                AgentActivities.process_hermes_task,
                task_data,
                start_to_close_timeout=timedelta(minutes=5),
            )
        except Exception as e:
            self._status = "FAILED"
            await self._finalize(task_id, "FAILED", agent_id, error=str(e))
            return {"status": "failed", "task_id": task_id, "error": str(e)}

        # Check if cancelled after processing
        if self._status == "STOPPED":
            await self._finalize(task_id, "STOPPED", agent_id)
            return {"status": "stopped", "task_id": task_id}

        # Step 2: Record result to memory (Activity)
        try:
            await workflow.execute_activity(
                AgentActivities.save_task_to_memory,
                result,
                start_to_close_timeout=timedelta(minutes=1),
            )
        except Exception:
            pass

        # Step 3: Report COMPLETED
        self._status = "COMPLETED"
        await self._finalize(task_id, "COMPLETED", agent_id, result=result)

        return result

    async def _finalize(self, task_id: str, status: str, agent_id: str, result=None, error=None):
        """Report final task status via activity."""
        try:
            await workflow.execute_activity(
                AgentActivities.report_task_status,
                {
                    "task_id": task_id,
                    "status": status,
                    "agent_id": agent_id,
                    "result": result,
                    "error": error,
                },
                start_to_close_timeout=timedelta(seconds=30),
            )
        except Exception:
            pass
