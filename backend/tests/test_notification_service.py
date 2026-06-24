"""Unit tests for NotificationService."""
import pytest
import json
from app.infrastructure.notification_service import (
    NotificationService,
    NOTIFICATION_TYPES,
    NOTIFICATION_ICONS,
    NOTIFICATION_COLORS,
)


class TestNotificationConstants:
    """Test notification type constants."""

    def test_notification_types_defined(self):
        assert len(NOTIFICATION_TYPES) > 0
        assert "task_completed" in NOTIFICATION_TYPES
        assert "task_failed" in NOTIFICATION_TYPES
        assert "agent_registered" in NOTIFICATION_TYPES

    def test_notification_icons_defined(self):
        assert "task_completed" in NOTIFICATION_ICONS
        assert NOTIFICATION_ICONS["task_completed"] == "✅"

    def test_notification_colors_defined(self):
        assert "task_completed" in NOTIFICATION_COLORS
        assert NOTIFICATION_COLORS["task_completed"] == "green"


class TestNotificationCreate:
    """Test notification creation."""

    def test_create_returns_dict(self, notification_svc):
        result = notification_svc.create("task_completed", "Title", "Desc")
        assert isinstance(result, dict)

    def test_create_has_required_fields(self, notification_svc):
        result = notification_svc.create("task_completed", "Title", "Desc")
        assert "id" in result
        assert "type" in result
        assert "title" in result
        assert "description" in result
        assert "read" in result
        assert "created_at" in result

    def test_create_default_unread(self, notification_svc):
        result = notification_svc.create("task_completed", "Title")
        assert result["read"] is False

    def test_create_with_data(self, notification_svc):
        data = {"task_id": "t1", "cost": 0.05}
        result = notification_svc.create("cost_alert", "Cost", "data test", data)
        assert result["data"] == data

    def test_create_without_data(self, notification_svc):
        result = notification_svc.create("task_completed", "No Data")
        assert result["data"] is None

    def test_create_id_format(self, notification_svc):
        result = notification_svc.create("task_completed", "Format")
        assert result["id"].startswith("notif-")

    def test_create_has_icon(self, notification_svc):
        result = notification_svc.create("task_completed", "Icon Test")
        assert result["icon"] == "✅"

    def test_create_has_color(self, notification_svc):
        result = notification_svc.create("task_failed", "Color Test")
        assert result["color"] == "red"

    def test_create_unknown_type_icon(self, notification_svc):
        result = notification_svc.create("unknown_type", "Unknown")
        assert result["icon"] == "🔔"

    def test_create_unknown_type_color(self, notification_svc):
        result = notification_svc.create("unknown_type", "Unknown")
        assert result["color"] == "blue"


class TestNotificationRead:
    """Test notification read operations."""

    def test_get_all_empty(self, notification_svc):
        result = notification_svc.get_all()
        assert result["notifications"] == []
        assert result["total"] == 0

    def test_get_all_returns_paginated(self, notification_svc):
        for i in range(5):
            notification_svc.create("task_completed", f"Notif {i}")
        result = notification_svc.get_all(page_size=2)
        assert len(result["notifications"]) == 2
        assert result["total"] == 5

    def test_get_all_unread_only(self, notification_svc):
        n1 = notification_svc.create("task_completed", "Unread")
        n2 = notification_svc.create("task_completed", "Read")
        notification_svc.mark_read(n2["id"])
        result = notification_svc.get_all(unread_only=True)
        assert result["total"] == 1

    def test_get_by_id_found(self, notification_svc, sample_notification):
        found = notification_svc.get_by_id(sample_notification["id"])
        assert found is not None
        assert found["title"] == sample_notification["title"]

    def test_get_by_id_not_found(self, notification_svc):
        assert notification_svc.get_by_id("nonexistent") is None

    def test_unread_count(self, notification_svc):
        notification_svc.create("task_completed", "N1")
        notification_svc.create("task_completed", "N2")
        assert notification_svc.get_unread_count() == 2

    def test_unread_count_after_mark_read(self, notification_svc):
        n1 = notification_svc.create("task_completed", "N1")
        notification_svc.create("task_completed", "N2")
        notification_svc.mark_read(n1["id"])
        assert notification_svc.get_unread_count() == 1


class TestNotificationUpdate:
    """Test notification updates."""

    def test_mark_read(self, notification_svc, sample_notification):
        result = notification_svc.mark_read(sample_notification["id"])
        assert result is not None
        assert result["read"] is True

    def test_mark_read_nonexistent(self, notification_svc):
        result = notification_svc.mark_read("nonexistent")
        assert result is None

    def test_mark_all_read(self, notification_svc):
        notification_svc.create("task_completed", "N1")
        notification_svc.create("task_completed", "N2")
        notification_svc.create("task_completed", "N3")
        count = notification_svc.mark_all_read()
        assert count == 3
        assert notification_svc.get_unread_count() == 0


class TestNotificationDelete:
    """Test notification deletion."""

    def test_delete_existing(self, notification_svc, sample_notification):
        assert notification_svc.delete(sample_notification["id"]) is True
        assert notification_svc.get_by_id(sample_notification["id"]) is None

    def test_delete_nonexistent(self, notification_svc):
        assert notification_svc.delete("nonexistent") is False


class TestTelegramFormatting:
    """Test Telegram message formatting."""

    def test_format_task_completed(self, notification_svc):
        msg = notification_svc.format_task_telegram(
            task_title="Test Task",
            agent_name="JARVIS",
            status="COMPLETED",
            duration=5.2,
            tokens_used=1500,
            cost=0.0234,
        )
        assert "✅" in msg
        assert "Test Task" in msg
        assert "JARVIS" in msg
        assert "5.2s" in msg
        assert "1,500" in msg
        assert "$0.0234" in msg

    def test_format_task_failed(self, notification_svc):
        msg = notification_svc.format_task_telegram(
            task_title="Failed Task",
            agent_name="BOT",
            status="FAILED",
        )
        assert "❌" in msg

    def test_format_task_stopped(self, notification_svc):
        msg = notification_svc.format_task_telegram(
            task_title="Stopped Task",
            agent_name="BOT",
            status="STOPPED",
        )
        assert "⚠️" in msg

    def test_format_without_optional_fields(self, notification_svc):
        msg = notification_svc.format_task_telegram(
            task_title="Simple",
            agent_name="BOT",
            status="COMPLETED",
        )
        assert "Simple" in msg
        assert "Duration" not in msg
        assert "Tokens" not in msg
        assert "Cost" not in msg
