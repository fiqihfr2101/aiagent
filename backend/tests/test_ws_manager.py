"""Unit tests for WebSocketManager."""
import pytest
import json
import asyncio
from unittest.mock import AsyncMock, MagicMock
from app.infrastructure.ws_manager import WebSocketManager, WSClient, CHANNELS


class TestWSManagerChannels:
    """Test channel constants."""

    def test_channels_defined(self):
        assert "agents" in CHANNELS
        assert "tasks" in CHANNELS
        assert "metrics" in CHANNELS
        assert "logs" in CHANNELS
        assert "notifications" in CHANNELS
        assert "system" in CHANNELS

    def test_channels_count(self):
        assert len(CHANNELS) == 7


class TestWSClient:
    """Test WSClient dataclass."""

    def test_ws_client_defaults(self):
        mock_ws = MagicMock()
        client = WSClient(ws=mock_ws, client_id="test-1")
        assert client.client_id == "test-1"
        assert "system" in client.channels

    def test_ws_client_lag(self):
        mock_ws = MagicMock()
        client = WSClient(ws=mock_ws, client_id="test-1")
        assert client.lag < 1.0


class TestWebSocketManager:
    """Test WebSocketManager operations."""

    def test_initial_state(self):
        mgr = WebSocketManager()
        assert mgr.connection_count == 0

    def test_get_stats(self):
        mgr = WebSocketManager()
        stats = mgr.get_stats()
        assert "total_connections" in stats
        assert "channels" in stats
        assert stats["total_connections"] == 0

    def test_subscribe_unknown_client(self):
        mgr = WebSocketManager()
        mgr.subscribe("nonexistent", ["agents"])  # Should not raise

    def test_unsubscribe_unknown_client(self):
        mgr = WebSocketManager()
        mgr.unsubscribe("nonexistent", ["agents"])

    def test_handle_pong_unknown_client(self):
        mgr = WebSocketManager()
        mgr.handle_pong("nonexistent")  # Should not raise


class TestWebSocketManagerWithMockClients:
    """Test with mocked WebSocket clients."""

    @pytest.fixture
    def mock_ws(self):
        ws = AsyncMock()
        ws.accept = AsyncMock()
        ws.send_text = AsyncMock()
        ws.send_json = AsyncMock()
        ws.close = AsyncMock()
        ws.receive_text = AsyncMock()
        return ws

    @pytest.mark.asyncio
    async def test_connect_creates_client(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        cid = await mgr.connect(mock_ws, "client-1")
        assert cid == "client-1"
        assert mgr.connection_count == 1
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_disconnect_removes_client(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        assert mgr.connection_count == 1
        await mgr.disconnect("client-1")
        assert mgr.connection_count == 0
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_subscribe_channels(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        mgr.subscribe("client-1", ["agents", "tasks"])
        client = mgr._clients["client-1"]
        assert "agents" in client.channels
        assert "tasks" in client.channels
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_unsubscribe_channels(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        mgr.subscribe("client-1", ["agents", "tasks"])
        mgr.unsubscribe("client-1", ["agents"])
        client = mgr._clients["client-1"]
        assert "agents" not in client.channels
        assert "tasks" in client.channels
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_subscribe_invalid_channel(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        mgr.subscribe("client-1", ["invalid_channel", "agents"])
        client = mgr._clients["client-1"]
        assert "invalid_channel" not in client.channels
        assert "agents" in client.channels
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_broadcast_to_all(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        await asyncio.sleep(0.05)
        await mgr.broadcast(json.dumps({"type": "test"}))
        await asyncio.sleep(0.1)
        mock_ws.send_text.assert_called()
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_broadcast_to_channel(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        mgr.subscribe("client-1", ["agents"])
        await asyncio.sleep(0.05)
        await mgr.broadcast(json.dumps({"type": "test"}), channel="agents")
        await asyncio.sleep(0.1)
        mock_ws.send_text.assert_called()
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_broadcast_skips_unsubscribed(self):
        mgr = WebSocketManager()
        await mgr.start()
        ws1 = AsyncMock()
        ws1.send_text = AsyncMock()
        ws1.close = AsyncMock()
        ws1.accept = AsyncMock()
        ws2 = AsyncMock()
        ws2.send_text = AsyncMock()
        ws2.close = AsyncMock()
        ws2.accept = AsyncMock()
        await mgr.connect(ws1, "c1")
        await mgr.connect(ws2, "c2")
        mgr.subscribe("c1", ["agents"])
        await asyncio.sleep(0.05)
        await mgr.broadcast(json.dumps({"type": "test"}), channel="agents")
        await asyncio.sleep(0.1)
        ws1.send_text.assert_called()
        ws2.send_text.assert_not_called()
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_send_personal(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        await asyncio.sleep(0.05)
        await mgr.send_personal("client-1", json.dumps({"type": "personal"}))
        await asyncio.sleep(0.1)
        mock_ws.send_text.assert_called()
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_send_personal_unknown_client(self):
        mgr = WebSocketManager()
        await mgr.send_personal("nonexistent", "msg")

    @pytest.mark.asyncio
    async def test_batch_broadcast_single(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        await asyncio.sleep(0.05)
        await mgr.batch_broadcast([json.dumps({"type": "single"})])
        await asyncio.sleep(0.1)
        mock_ws.send_text.assert_called()
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_batch_broadcast_multiple(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        await asyncio.sleep(0.05)
        msgs = [
            json.dumps({"type": "msg1"}),
            json.dumps({"type": "msg2"}),
        ]
        await mgr.batch_broadcast(msgs)
        await asyncio.sleep(0.1)
        mock_ws.send_text.assert_called()
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_batch_broadcast_empty(self):
        mgr = WebSocketManager()
        await mgr.batch_broadcast([])

    @pytest.mark.asyncio
    async def test_handle_pong(self, mock_ws):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.connect(mock_ws, "client-1")
        import time
        old_pong = mgr._clients["client-1"].last_pong
        time.sleep(0.01)
        mgr.handle_pong("client-1")
        assert mgr._clients["client-1"].last_pong >= old_pong
        await mgr.stop()


class TestWebSocketManagerLifecycle:
    """Test manager lifecycle."""

    @pytest.mark.asyncio
    async def test_start_stop(self):
        mgr = WebSocketManager()
        await mgr.start()
        assert mgr._running is True
        await mgr.stop()
        assert mgr._running is False

    @pytest.mark.asyncio
    async def test_double_start(self):
        mgr = WebSocketManager()
        await mgr.start()
        await mgr.start()
        await mgr.stop()

    @pytest.mark.asyncio
    async def test_stats_with_connections(self):
        mgr = WebSocketManager()
        ws1 = AsyncMock()
        ws1.accept = AsyncMock()
        ws1.send_text = AsyncMock()
        ws1.close = AsyncMock()
        await mgr.start()
        await mgr.connect(ws1, "c1")
        mgr.subscribe("c1", ["agents", "metrics"])
        stats = mgr.get_stats()
        assert stats["total_connections"] == 1
        assert stats["channels"]["agents"] == 1
        assert stats["channels"]["metrics"] == 1
        await mgr.stop()
