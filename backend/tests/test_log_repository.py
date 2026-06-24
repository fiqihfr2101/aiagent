"""Unit tests for LogRepository."""
import pytest
from app.infrastructure.log_repository import LogRepository


class TestLogRepositoryCreate:
    """Test log creation."""

    def test_create_log_returns_dict(self, log_repo):
        log = log_repo.create("Test message")
        assert isinstance(log, dict)

    def test_create_log_has_required_fields(self, log_repo):
        log = log_repo.create("Test message")
        assert "id" in log
        assert "message" in log
        assert "level" in log
        assert "timestamp" in log

    def test_create_log_default_level(self, log_repo):
        log = log_repo.create("Info message")
        assert log["level"] == "INFO"

    def test_create_log_custom_level(self, log_repo):
        log = log_repo.create("Error message", level="ERROR")
        assert log["level"] == "ERROR"

    def test_create_log_level_uppercased(self, log_repo):
        log = log_repo.create("Lowercase", level="info")
        assert log["level"] == "INFO"

    def test_create_log_with_task_id(self, log_repo):
        log = log_repo.create("Task log", task_id="task-123")
        assert log["task_id"] == "task-123"

    def test_create_log_with_agent_id(self, log_repo):
        log = log_repo.create("Agent log", agent_id="agent-456")
        assert log["agent_id"] == "agent-456"

    def test_create_log_with_request_id(self, log_repo):
        log = log_repo.create("Request log", request_id="req-789")
        assert log["request_id"] == "req-789"

    def test_create_log_id_format(self, log_repo):
        log = log_repo.create("Format test")
        assert log["id"].startswith("log-")

    def test_create_log_unique_ids(self, log_repo):
        l1 = log_repo.create("Log 1")
        l2 = log_repo.create("Log 2")
        assert l1["id"] != l2["id"]


class TestLogRepositoryRead:
    """Test log read operations."""

    def test_get_all_empty(self, log_repo):
        result = log_repo.get_all()
        assert result["logs"] == []
        assert result["total"] == 0

    def test_get_all_returns_paginated(self, log_repo):
        for i in range(5):
            log_repo.create(f"Log {i}")
        result = log_repo.get_all(limit=2)
        assert len(result["logs"]) == 2
        assert result["total"] == 5

    def test_get_all_filter_by_task_id(self, log_repo):
        log_repo.create("Task log", task_id="task-1")
        log_repo.create("Other log", task_id="task-2")
        result = log_repo.get_all(task_id="task-1")
        assert result["total"] == 1

    def test_get_all_filter_by_agent_id(self, log_repo):
        log_repo.create("Agent log", agent_id="agent-1")
        log_repo.create("Other log", agent_id="agent-2")
        result = log_repo.get_all(agent_id="agent-1")
        assert result["total"] == 1

    def test_get_all_filter_by_level(self, log_repo):
        log_repo.create("Info", level="INFO")
        log_repo.create("Error", level="ERROR")
        log_repo.create("Debug", level="DEBUG")
        result = log_repo.get_all(level="ERROR")
        assert result["total"] == 1

    def test_get_by_id_found(self, log_repo):
        log = log_repo.create("Findable")
        found = log_repo.get_by_id(log["id"])
        assert found is not None
        assert found["message"] == "Findable"

    def test_get_by_id_not_found(self, log_repo):
        assert log_repo.get_by_id("nonexistent") is None

    def test_get_for_task(self, log_repo):
        log_repo.create("Log A", task_id="task-x")
        log_repo.create("Log B", task_id="task-x")
        log_repo.create("Log C", task_id="task-y")
        result = log_repo.get_for_task("task-x")
        assert len(result) == 2

    def test_get_for_task_limit(self, log_repo):
        for i in range(10):
            log_repo.create(f"Log {i}", task_id="task-limited")
        result = log_repo.get_for_task("task-limited", limit=3)
        assert len(result) == 3


class TestLogRepositoryDelete:
    """Test log deletion."""

    def test_delete_existing(self, log_repo):
        log = log_repo.create("Deletable")
        assert log_repo.delete(log["id"]) is True
        assert log_repo.get_by_id(log["id"]) is None

    def test_delete_nonexistent(self, log_repo):
        assert log_repo.delete("nonexistent") is False

    def test_delete_for_task(self, log_repo):
        log_repo.create("L1", task_id="task-del")
        log_repo.create("L2", task_id="task-del")
        log_repo.create("L3", task_id="task-other")
        count = log_repo.delete_for_task("task-del")
        assert count == 2
        result = log_repo.get_all(task_id="task-del")
        assert result["total"] == 0
        result2 = log_repo.get_all(task_id="task-other")
        assert result2["total"] == 1


class TestLogRepositoryEdgeCases:
    """Test edge cases."""

    def test_task_id_none_by_default(self, log_repo):
        log = log_repo.create("No task")
        assert log["task_id"] is None

    def test_agent_id_none_by_default(self, log_repo):
        log = log_repo.create("No agent")
        assert log["agent_id"] is None

    def test_request_id_none_by_default(self, log_repo):
        log = log_repo.create("No request")
        assert log["request_id"] is None

    def test_logs_ordered_by_timestamp_desc(self, log_repo):
        log_repo.create("First")
        log_repo.create("Second")
        log_repo.create("Third")
        result = log_repo.get_all()
        # Most recent first
        assert result["logs"][0]["message"] == "Third"
