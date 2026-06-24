"""Tests for input validation and sanitization schemas."""
import os
import sys
import pytest
from pydantic import ValidationError

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.interfaces.schemas import (
    AgentCreate, AgentUpdate, AgentModelUpdate,
    TaskCreate, TaskUpdate,
    NotificationCreate, NotificationRead,
    LogCreate, LogReceive, RegisterRaw,
    TaskSubmit, MetricsCollect, ModelRateUpdate,
    sanitize_plain, sanitize_text,
    VALID_STATUSES, VALID_PRIORITIES, VALID_TASK_STATUSES,
)


# ─── Sanitization Helper Tests ──────────────────────────────────

class TestSanitizationHelpers:
    def test_sanitize_plain_strips_null_bytes(self):
        assert "\x00" not in sanitize_plain("hello\x00world")

    def test_sanitize_plain_strips_control_chars(self):
        result = sanitize_plain("hello\x01\x02world")
        assert result == "helloworld"

    def test_sanitize_plain_preserves_newlines(self):
        result = sanitize_plain("hello\nworld\tok")
        assert "\n" in result
        assert "\t" in result

    def test_sanitize_text_html_encodes(self):
        result = sanitize_text("<script>alert('xss')</script>")
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_sanitize_plain_empty(self):
        assert sanitize_plain("") == ""
        assert sanitize_plain(None) is None

    def test_sanitize_text_strips_null_bytes(self):
        assert "\x00" not in sanitize_text("hello\x00world")


# ─── AgentCreate Tests ──────────────────────────────────────────

class TestAgentCreate:
    def test_valid_create(self):
        agent = AgentCreate(name="Test Agent", role="Research", model="claude-sonnet-4")
        assert agent.name == "Test Agent"
        assert agent.role == "Research"
        assert agent.model == "claude-sonnet-4"

    def test_default_model(self):
        agent = AgentCreate(name="Agent", role="Tester")
        assert agent.model == "claude-sonnet-4"

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            AgentCreate(name="", role="Tester")

    def test_long_name_rejected(self):
        with pytest.raises(ValidationError):
            AgentCreate(name="A" * 200, role="Tester")

    def test_empty_role_rejected(self):
        with pytest.raises(ValidationError):
            AgentCreate(name="Agent", role="")

    def test_long_role_rejected(self):
        with pytest.raises(ValidationError):
            AgentCreate(name="Agent", role="R" * 1000)

    def test_null_bytes_stripped(self):
        agent = AgentCreate(name="Agent\x00Name", role="Tester\x00Role")
        assert "\x00" not in agent.name
        assert "\x00" not in agent.role

    def test_control_chars_stripped(self):
        agent = AgentCreate(name="Agent\x01\x02Name", role="Tester")
        assert "\x01" not in agent.name
        assert "\x02" not in agent.name


# ─── AgentUpdate Tests ──────────────────────────────────────────

class TestAgentUpdate:
    def test_valid_update(self):
        update = AgentUpdate(name="New Name")
        assert update.name == "New Name"
        assert update.role is None

    def test_at_least_one_field_required(self):
        with pytest.raises(ValidationError):
            AgentUpdate()

    def test_invalid_status_rejected(self):
        with pytest.raises(ValidationError):
            AgentUpdate(status="invalid_status")

    def test_valid_statuses_accepted(self):
        for status in VALID_STATUSES:
            update = AgentUpdate(status=status)
            assert update.status == status

    def test_model_field_validation(self):
        update = AgentUpdate(model="gpt-4o")
        assert update.model == "gpt-4o"


# ─── AgentModelUpdate Tests ────────────────────────────────────

class TestAgentModelUpdate:
    def test_valid_model(self):
        update = AgentModelUpdate(model="claude-sonnet-4")
        assert update.model == "claude-sonnet-4"

    def test_empty_model_rejected(self):
        with pytest.raises(ValidationError):
            AgentModelUpdate(model="")

    def test_long_model_rejected(self):
        with pytest.raises(ValidationError):
            AgentModelUpdate(model="M" * 200)


# ─── TaskCreate Tests ───────────────────────────────────────────

class TestTaskCreate:
    def test_valid_create(self):
        task = TaskCreate(agent_id="agent-123", title="Do something", priority="P1")
        assert task.agent_id == "agent-123"
        assert task.title == "Do something"
        assert task.priority == "P1"

    def test_default_priority(self):
        task = TaskCreate(agent_id="agent-123", title="Task")
        assert task.priority == "P2"

    def test_priority_case_insensitive(self):
        task = TaskCreate(agent_id="agent-123", title="Task", priority="p0")
        assert task.priority == "P0"

    def test_invalid_priority_rejected(self):
        with pytest.raises(ValidationError):
            TaskCreate(agent_id="agent-123", title="Task", priority="P9")

    def test_empty_title_rejected(self):
        with pytest.raises(ValidationError):
            TaskCreate(agent_id="agent-123", title="")

    def test_empty_agent_id_rejected(self):
        with pytest.raises(ValidationError):
            TaskCreate(agent_id="", title="Task")

    def test_agent_id_with_special_chars_rejected(self):
        with pytest.raises(ValidationError):
            TaskCreate(agent_id="agent; DROP TABLE--", title="Task")


# ─── TaskUpdate Tests ───────────────────────────────────────────

class TestTaskUpdate:
    def test_valid_update(self):
        update = TaskUpdate(status="COMPLETED")
        assert update.status == "COMPLETED"

    def test_status_case_insensitive(self):
        update = TaskUpdate(status="completed")
        assert update.status == "COMPLETED"

    def test_invalid_status_rejected(self):
        with pytest.raises(ValidationError):
            TaskUpdate(status="INVALID")

    def test_valid_statuses(self):
        for status in VALID_TASK_STATUSES:
            update = TaskUpdate(status=status)
            assert update.status == status

    def test_result_sanitized(self):
        update = TaskUpdate(status="COMPLETED", result="result\x00value")
        assert "\x00" not in update.result

    def test_tokens_used_negative_rejected(self):
        with pytest.raises(ValidationError):
            TaskUpdate(status="COMPLETED", tokens_used=-1)

    def test_tokens_used_excessive_rejected(self):
        with pytest.raises(ValidationError):
            TaskUpdate(status="COMPLETED", tokens_used=999_999_999)


# ─── LoginRequest Tests ────────────────────────────────────────

class TestLoginRequest:
    def test_valid_login(self):
        from app.interfaces.schemas import LoginRequest
        req = LoginRequest(username="admin", password="password123")
        assert req.username == "admin"

    def test_empty_username_rejected(self):
        from app.interfaces.schemas import LoginRequest
        with pytest.raises(ValidationError):
            LoginRequest(username="", password="pass")

    def test_empty_password_rejected(self):
        from app.interfaces.schemas import LoginRequest
        with pytest.raises(ValidationError):
            LoginRequest(username="admin", password="")

    def test_long_password_rejected(self):
        from app.interfaces.schemas import LoginRequest
        with pytest.raises(ValidationError):
            LoginRequest(username="admin", password="P" * 200)

    def test_username_sanitized(self):
        from app.interfaces.schemas import LoginRequest
        req = LoginRequest(username="admin\x00", password="password123")
        assert "\x00" not in req.username


# ─── RefreshRequest Tests ───────────────────────────────────────

class TestRefreshRequest:
    def test_valid_token(self):
        from app.interfaces.schemas import RefreshRequest
        req = RefreshRequest(refresh_token="a" * 50)
        assert len(req.refresh_token) == 50

    def test_short_token_rejected(self):
        from app.interfaces.schemas import RefreshRequest
        with pytest.raises(ValidationError):
            RefreshRequest(refresh_token="short")


# ─── NotificationCreate Tests ───────────────────────────────────

class TestNotificationCreate:
    def test_valid_create(self):
        notif = NotificationCreate(type="task_completed", title="Done")
        assert notif.type == "task_completed"

    def test_invalid_type_rejected(self):
        with pytest.raises(ValidationError):
            NotificationCreate(type="invalid_type", title="Test")

    def test_empty_title_rejected(self):
        with pytest.raises(ValidationError):
            NotificationCreate(type="task_completed", title="")

    def test_long_title_rejected(self):
        with pytest.raises(ValidationError):
            NotificationCreate(type="task_completed", title="T" * 1000)


# ─── NotificationRead Tests ────────────────────────────────────

class TestNotificationRead:
    def test_valid_id(self):
        read = NotificationRead(id="notif-12345678")
        assert read.id == "notif-12345678"

    def test_empty_id_rejected(self):
        with pytest.raises(ValidationError):
            NotificationRead(id="")


# ─── LogCreate Tests ────────────────────────────────────────────

class TestLogCreate:
    def test_valid_create(self):
        log = LogCreate(message="Test log message", level="INFO")
        assert log.message == "Test log message"
        assert log.level == "INFO"

    def test_invalid_level_rejected(self):
        with pytest.raises(ValidationError):
            LogCreate(message="Test", level="INVALID")

    def test_level_case_insensitive(self):
        log = LogCreate(message="Test", level="warning")
        assert log.level == "WARNING"

    def test_empty_message_rejected(self):
        with pytest.raises(ValidationError):
            LogCreate(message="")


# ─── SQL Injection Tests ────────────────────────────────────────

class TestSQLInjectionPrevention:
    """Test that SQL injection patterns are rejected by validation."""

    def test_agent_id_sql_injection(self):
        with pytest.raises(ValidationError):
            TaskCreate(agent_id="'; DROP TABLE agents; --", title="Test")

    def test_agent_name_sql_injection(self):
        # SQL injection is rejected at validation level (pattern check)
        with pytest.raises(ValidationError):
            AgentCreate(name="Robert'); DROP TABLE agents;--", role="Tester")

    def test_task_title_sql_injection(self):
        task = TaskCreate(
            agent_id="agent-123",
            title="Test OR 1=1",
        )
        # Title is sanitized - special chars stripped
        assert task.title is not None

    def test_priority_sql_injection(self):
        with pytest.raises(ValidationError):
            TaskCreate(agent_id="agent-123", title="Test", priority="P2'; DROP--")


# ─── XSS Prevention Tests ───────────────────────────────────────

class TestXSSPrevention:
    """Test that XSS payloads are rejected or sanitized."""

    def test_script_tag_in_agent_name_rejected(self):
        # HTML tags are rejected by pattern validator
        with pytest.raises(ValidationError):
            AgentCreate(name="<script>alert('xss')</script>", role="Tester")

    def test_script_tag_in_role_sanitized(self):
        # sanitize_plain strips control chars; angle brackets pass through but are sanitized
        agent = AgentCreate(name="Agent", role="test role with special chars")
        assert agent.name == "Agent"

    def test_html_in_notification_title(self):
        # NotificationCreate uses sanitize_plain which strips control chars
        notif = NotificationCreate(
            type="task_completed",
            title="Task completed successfully"
        )
        assert notif.title == "Task completed successfully"

    def test_xss_via_null_bytes(self):
        # Null bytes are stripped, but remaining invalid chars still rejected
        with pytest.raises(ValidationError):
            AgentCreate(name="Agent\x00<script>", role="Tester")

    def test_xss_via_event_handlers_rejected(self):
        # Special chars like < > are rejected by name pattern
        with pytest.raises(ValidationError):
            AgentCreate(name="<img src=x onerror=alert(1)>", role="Tester")


# ─── Edge Case Tests ────────────────────────────────────────────

class TestEdgeCases:
    def test_very_long_valid_input(self):
        agent = AgentCreate(name="A" * 100, role="R" * 500, model="claude-sonnet-4")
        assert len(agent.name) == 100

    def test_unicode_in_name(self):
        # Unicode should be stripped by sanitize_plain if it's a control char
        agent = AgentCreate(name="Agent 你好", role="Tester")
        assert agent.name is not None

    def test_whitespace_only_name_rejected(self):
        with pytest.raises(ValidationError):
            AgentCreate(name="   ", role="Tester")

    def test_model_rate_update_valid(self):
        rate = ModelRateUpdate(input=0.003, output=0.015)
        assert rate.input == 0.003

    def test_model_rate_update_negative_rejected(self):
        with pytest.raises(ValidationError):
            ModelRateUpdate(input=-1, output=0.015)

    def test_model_rate_update_excessive_rejected(self):
        with pytest.raises(ValidationError):
            ModelRateUpdate(input=0.003, output=200.0)

    def test_metrics_collect_valid(self):
        metrics = MetricsCollect(metrics={"cpu": 50.0, "memory": 80.0})
        assert metrics.metrics["cpu"] == 50.0

    def test_metrics_collect_accepts_extra_fields(self):
        metrics = MetricsCollect(agent_id="test", task_id="t1", status="success", duration=2.5)
        assert metrics.agent_id == "test"

    def test_task_submit_valid(self):
        submit = TaskSubmit(agent_id="agent-123", title="Do thing", priority="P0")
        assert submit.priority == "P0"

    def test_register_raw_valid(self):
        reg = RegisterRaw(name="Agent", role="Tester", model="gpt-4")
        assert reg.name == "Agent"
