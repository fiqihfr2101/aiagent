"""Unit tests for TaskRepository."""
import pytest
from app.infrastructure.task_repository import TaskRepository


class TestTaskRepositoryCreate:
    """Test task creation."""

    def test_create_task_returns_dict(self, task_repo, sample_agent):
        task = task_repo.create(sample_agent["id"], "Test Task", "P1")
        assert isinstance(task, dict)

    def test_create_task_has_required_fields(self, task_repo, sample_agent):
        task = task_repo.create(sample_agent["id"], "Test Task", "P1")
        assert "id" in task
        assert "agent_id" in task
        assert "title" in task
        assert "priority" in task
        assert "status" in task
        assert "created_at" in task

    def test_create_task_default_priority(self, task_repo, sample_agent):
        task = task_repo.create(sample_agent["id"], "Default Priority")
        assert task["priority"] == "P2"

    def test_create_task_priority_uppercased(self, task_repo, sample_agent):
        task = task_repo.create(sample_agent["id"], "Lower Priority", "p3")
        assert task["priority"] == "P3"

    def test_create_task_default_status_queued(self, task_repo, sample_agent):
        task = task_repo.create(sample_agent["id"], "Queued Task")
        assert task["status"] == "QUEUED"

    def test_create_task_id_format(self, task_repo, sample_agent):
        task = task_repo.create(sample_agent["id"], "Format Task")
        assert task["id"].startswith("task-")

    def test_create_task_unique_ids(self, task_repo, sample_agent):
        t1 = task_repo.create(sample_agent["id"], "Task 1")
        t2 = task_repo.create(sample_agent["id"], "Task 2")
        assert t1["id"] != t2["id"]


class TestTaskRepositoryRead:
    """Test task read operations."""

    def test_get_all_empty(self, task_repo):
        assert task_repo.get_all() == []

    def test_get_all_returns_all(self, task_repo, sample_agent):
        task_repo.create(sample_agent["id"], "Task 1")
        task_repo.create(sample_agent["id"], "Task 2")
        assert len(task_repo.get_all()) == 2

    def test_get_all_filter_by_agent_id(self, task_repo, sample_agent):
        task_repo.create(sample_agent["id"], "Task A")
        task_repo.create("other-agent", "Task B")
        filtered = task_repo.get_all(agent_id=sample_agent["id"])
        assert len(filtered) == 1
        assert filtered[0]["title"] == "Task A"

    def test_get_all_filter_by_status(self, task_repo, sample_agent):
        t = task_repo.create(sample_agent["id"], "Task")
        task_repo.update_status(t["id"], "RUNNING")
        task_repo.create(sample_agent["id"], "Queued Task")
        running = task_repo.get_all(status="RUNNING")
        assert len(running) == 1

    def test_get_by_id_found(self, task_repo, sample_task):
        found = task_repo.get_by_id(sample_task["id"])
        assert found is not None
        assert found["title"] == sample_task["title"]

    def test_get_by_id_not_found(self, task_repo):
        assert task_repo.get_by_id("nonexistent") is None


class TestTaskRepositoryUpdate:
    """Test task status updates."""

    def test_update_status_to_running(self, task_repo, sample_task):
        updated = task_repo.update_status(sample_task["id"], "RUNNING")
        assert updated["status"] == "RUNNING"
        assert updated["started_at"] is not None

    def test_update_status_to_completed(self, task_repo, sample_task):
        task_repo.update_status(sample_task["id"], "RUNNING")
        updated = task_repo.update_status(
            sample_task["id"], "COMPLETED", result="done", tokens_used=1000
        )
        assert updated["status"] == "COMPLETED"
        assert updated["completed_at"] is not None
        assert updated["result"] == "done"
        assert updated["tokens_used"] == 1000

    def test_update_status_to_failed(self, task_repo, sample_task):
        task_repo.update_status(sample_task["id"], "RUNNING")
        updated = task_repo.update_status(sample_task["id"], "FAILED")
        assert updated["status"] == "FAILED"
        assert updated["completed_at"] is not None

    def test_update_status_to_stopped(self, task_repo, sample_task):
        task_repo.update_status(sample_task["id"], "RUNNING")
        updated = task_repo.update_status(sample_task["id"], "STOPPED")
        assert updated["status"] == "STOPPED"
        assert updated["completed_at"] is not None

    def test_update_status_uppercases(self, task_repo, sample_task):
        updated = task_repo.update_status(sample_task["id"], "running")
        assert updated["status"] == "RUNNING"

    def test_update_status_nonexistent(self, task_repo):
        result = task_repo.update_status("nonexistent", "RUNNING")
        assert result is None

    def test_duration_calculated(self, task_repo, sample_task):
        task_repo.update_status(sample_task["id"], "RUNNING")
        import time
        time.sleep(0.1)
        updated = task_repo.update_status(sample_task["id"], "COMPLETED")
        assert updated["duration"] is not None
        assert updated["duration"] >= 0


class TestTaskRepositoryHistory:
    """Test task history pagination."""

    def test_history_returns_dict(self, task_repo, sample_agent):
        result = task_repo.get_history()
        assert isinstance(result, dict)
        assert "tasks" in result
        assert "total" in result
        assert "page" in result
        assert "page_size" in result
        assert "total_pages" in result

    def test_history_pagination(self, task_repo, sample_agent):
        for i in range(5):
            task_repo.create(sample_agent["id"], f"Task {i}")
        page1 = task_repo.get_history(page=1, page_size=2)
        assert len(page1["tasks"]) == 2
        assert page1["total"] == 5
        assert page1["total_pages"] == 3

    def test_history_filter_by_agent(self, task_repo, sample_agent):
        task_repo.create(sample_agent["id"], "Task A")
        task_repo.create("other", "Task B")
        result = task_repo.get_history(agent_id=sample_agent["id"])
        assert result["total"] == 1

    def test_history_filter_by_status(self, task_repo, sample_agent):
        t = task_repo.create(sample_agent["id"], "Task")
        task_repo.update_status(t["id"], "RUNNING")
        task_repo.create(sample_agent["id"], "Queued")
        result = task_repo.get_history(status="RUNNING")
        assert result["total"] == 1


class TestTaskRepositoryActiveCounts:
    """Test active task counting."""

    def test_active_count_empty(self, task_repo):
        assert task_repo.get_active_task_count("agent-1") == 0

    def test_active_count_queued(self, task_repo, sample_agent):
        task_repo.create(sample_agent["id"], "Queued Task")
        assert task_repo.get_active_task_count(sample_agent["id"]) == 1

    def test_active_count_running(self, task_repo, sample_agent):
        t = task_repo.create(sample_agent["id"], "Running Task")
        task_repo.update_status(t["id"], "RUNNING")
        assert task_repo.get_active_task_count(sample_agent["id"]) == 1

    def test_active_count_excludes_completed(self, task_repo, sample_agent):
        t = task_repo.create(sample_agent["id"], "Completed Task")
        task_repo.update_status(t["id"], "RUNNING")
        task_repo.update_status(t["id"], "COMPLETED")
        assert task_repo.get_active_task_count(sample_agent["id"]) == 0

    def test_active_count_mixed(self, task_repo, sample_agent):
        task_repo.create(sample_agent["id"], "Queued")
        t2 = task_repo.create(sample_agent["id"], "Will Complete")
        task_repo.update_status(t2["id"], "RUNNING")
        task_repo.update_status(t2["id"], "COMPLETED")
        t3 = task_repo.create(sample_agent["id"], "Running")
        task_repo.update_status(t3["id"], "RUNNING")
        assert task_repo.get_active_task_count(sample_agent["id"]) == 2

    def test_all_active_counts(self, task_repo, sample_agent):
        task_repo.create(sample_agent["id"], "T1")
        task_repo.create("other-agent", "T2")
        counts = task_repo.get_all_active_task_counts()
        assert counts.get(sample_agent["id"]) == 1
        assert counts.get("other-agent") == 1


class TestTaskRepositoryEdgeCases:
    """Test edge cases."""

    def test_result_none_by_default(self, task_repo, sample_agent):
        task = task_repo.create(sample_agent["id"], "No Result")
        assert task["result"] is None

    def test_tokens_used_zero_by_default(self, task_repo, sample_agent):
        task = task_repo.create(sample_agent["id"], "No Tokens")
        assert task["tokens_used"] == 0

    def test_workflow_id_none_by_default(self, task_repo, sample_agent):
        task = task_repo.create(sample_agent["id"], "No Workflow")
        assert task["workflow_id"] is None
