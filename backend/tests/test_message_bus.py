"""Tests for Agent-to-Agent Message Bus."""
import pytest
import json
from app.infrastructure.message_bus import MessageBus, MessageType


@pytest.fixture
def message_bus(tmp_path):
    """Create a fresh MessageBus with temp DB."""
    db_path = str(tmp_path / "test_messages.db")
    return MessageBus(db_path=db_path)


class TestMessageBusSend:
    def test_send_direct_message(self, message_bus):
        msg = message_bus.send(
            from_agent_id="agent-1",
            to_agent_id="agent-2",
            msg_type="direct",
            subject="Hello",
            body="World",
        )
        assert msg["type"] == "direct"
        assert msg["from_agent_id"] == "agent-1"
        assert msg["to_agent_id"] == "agent-2"
        assert msg["subject"] == "Hello"
        assert msg["body"] == "World"
        assert msg["read"] is False
        assert "id" in msg
        assert "created_at" in msg

    def test_send_broadcast_message(self, message_bus):
        msg = message_bus.send(
            from_agent_id="agent-1",
            to_agent_id=None,
            msg_type="broadcast",
            subject="Announcement",
            body="Hello everyone",
        )
        assert msg["type"] == "broadcast"
        assert msg["to_agent_id"] is None

    def test_send_delegation_message(self, message_bus):
        msg = message_bus.send(
            from_agent_id="agent-1",
            to_agent_id="agent-2",
            msg_type="delegation",
            subject="Do this task",
            body="Please complete...",
            metadata={"task_id": "task-123", "priority": "high"},
        )
        assert msg["type"] == "delegation"
        assert msg["metadata"]["task_id"] == "task-123"
        assert msg["metadata"]["priority"] == "high"

    def test_send_invalid_type_raises(self, message_bus):
        with pytest.raises(ValueError, match="Invalid message type"):
            message_bus.send(
                from_agent_id="agent-1",
                to_agent_id="agent-2",
                msg_type="invalid_type",
            )


class TestMessageBusRetrieve:
    def test_get_messages_for_agent(self, message_bus):
        message_bus.send("a1", "a2", "direct", "Sub1", "Body1")
        message_bus.send("a2", "a1", "direct", "Sub2", "Body2")
        message_bus.send("a1", "a3", "direct", "Sub3", "Body3")

        result = message_bus.get_messages("a2")
        assert result["total"] >= 1  # At least the one addressed to a2
        ids = [m["id"] for m in result["messages"]]
        # Messages addressed to a2 or from a2
        for m in result["messages"]:
            assert m["to_agent_id"] == "a2" or m["from_agent_id"] == "a2"

    def test_get_messages_with_type_filter(self, message_bus):
        message_bus.send("a1", "a2", "direct", "Direct msg", "body")
        message_bus.send("a1", None, "broadcast", "Broadcast msg", "body")

        result = message_bus.get_messages("a2", msg_type="direct")
        for m in result["messages"]:
            assert m["type"] == "direct"

    def test_get_thread(self, message_bus):
        message_bus.send("a1", "a2", "direct", "Hi", "from a1")
        message_bus.send("a2", "a1", "direct", "Re: Hi", "from a2")
        message_bus.send("a1", "a3", "direct", "Other", "different thread")

        thread = message_bus.get_thread("a1", "a2")
        assert len(thread) == 2
        for msg in thread:
            assert msg["from_agent_id"] in ("a1", "a2")
            assert msg["to_agent_id"] in ("a1", "a2")

    def test_get_conversations(self, message_bus):
        message_bus.send("a1", "a2", "direct", "msg1", "body")
        message_bus.send("a1", "a3", "direct", "msg2", "body")
        message_bus.send("a2", "a1", "direct", "msg3", "body")

        convos = message_bus.get_conversations("a1")
        assert len(convos) == 2
        agent_ids = [c["agent_id"] for c in convos]
        assert "a2" in agent_ids
        assert "a3" in agent_ids


class TestMessageBusReadStatus:
    def test_mark_read(self, message_bus):
        msg = message_bus.send("a1", "a2", "direct", "Sub", "Body")
        assert msg["read"] is False

        success = message_bus.mark_read(msg["id"])
        assert success is True

        result = message_bus.get_messages("a2", unread_only=True)
        # Should not be in unread list anymore
        unread_ids = [m["id"] for m in result["messages"]]
        assert msg["id"] not in unread_ids

    def test_mark_all_read(self, message_bus):
        message_bus.send("a1", "a2", "direct", "Sub1", "Body1")
        message_bus.send("a1", "a2", "direct", "Sub2", "Body2")
        message_bus.send("a1", "a2", "direct", "Sub3", "Body3")

        count = message_bus.mark_all_read("a2")
        assert count == 3

        result = message_bus.get_messages("a2", unread_only=True)
        assert result["total"] == 0

    def test_unread_count(self, message_bus):
        message_bus.send("a1", "a2", "direct", "Sub1", "Body1")
        message_bus.send("a1", "a2", "direct", "Sub2", "Body2")
        message_bus.send("a1", "a3", "direct", "Sub3", "Body3")

        assert message_bus.get_unread_count("a2") == 2
        assert message_bus.get_unread_count("a3") == 1


class TestMessageBusOfflineQueue:
    def test_offline_queue(self, message_bus):
        message_bus.send("a1", "a2", "direct", "Sub1", "Body1")
        message_bus.send("a1", "a2", "direct", "Sub2", "Body2")

        queued = message_bus.flush_offline_queue("a2")
        assert len(queued) == 2

        # Queue should be empty after flush
        queued2 = message_bus.flush_offline_queue("a2")
        assert len(queued2) == 0


class TestMessageTypes:
    def test_message_type_enum(self):
        assert MessageType.DIRECT == "direct"
        assert MessageType.BROADCAST == "broadcast"
        assert MessageType.DELEGATION == "delegation"
