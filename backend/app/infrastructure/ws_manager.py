"""
WebSocket Connection Manager with channel/room support, message queuing,
connection pooling, batch messaging, and heartbeat management.
"""
import asyncio
import json
import time
import logging
from dataclasses import dataclass, field
from typing import Optional
from fastapi import WebSocket

logger = logging.getLogger("hermes.ws")

# Available channels
CHANNELS = {"agents", "tasks", "metrics", "logs", "notifications", "system"}


@dataclass
class WSClient:
    """Represents a connected WebSocket client."""
    ws: WebSocket
    client_id: str
    channels: set = field(default_factory=lambda: {"system"})  # subscribed channels
    connected_at: float = field(default_factory=time.time)
    last_pong: float = field(default_factory=time.time)
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=500))
    send_task: Optional[asyncio.Task] = None

    @property
    def lag(self) -> float:
        return time.time() - self.last_pong


class WebSocketManager:
    """
    Production-grade WebSocket manager with:
    - Channel/room subscriptions (agents, tasks, metrics, logs, notifications, system)
    - Per-client message queuing (drops oldest on overflow)
    - Message batching (aggregates N messages or waits T ms)
    - Heartbeat / pong tracking
    - Broadcast to channel or all
    """

    def __init__(
        self,
        heartbeat_interval: float = 15.0,
        pong_timeout: float = 60.0,
        batch_interval: float = 0.05,  # 50ms batch window
        batch_max: int = 20,
    ):
        self._clients: dict[str, WSClient] = {}
        self._heartbeat_interval = heartbeat_interval
        self._pong_timeout = pong_timeout
        self._batch_interval = batch_interval
        self._batch_max = batch_max
        self._running = False
        self._heartbeat_task: Optional[asyncio.Task] = None

    # ── Lifecycle ──────────────────────────────────────────────

    async def start(self):
        """Start the heartbeat loop."""
        if self._running:
            return
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        logger.info("WSManager started (heartbeat=%ss)", self._heartbeat_interval)

    async def stop(self):
        """Shut down gracefully."""
        self._running = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
        for client in list(self._clients.values()):
            await self._remove_client(client.client_id)

    # ── Connect / Disconnect ──────────────────────────────────

    async def connect(self, websocket: WebSocket, client_id: str | None = None) -> str:
        await websocket.accept()
        cid = client_id or f"ws-{id(websocket):x}"
        client = WSClient(ws=websocket, client_id=cid)
        self._clients[cid] = client
        # Start per-client sender task
        client.send_task = asyncio.create_task(self._client_sender(client))
        logger.info("Client connected: %s (total=%d)", cid, len(self._clients))
        return cid

    async def disconnect(self, client_id: str):
        await self._remove_client(client_id)

    async def _remove_client(self, client_id: str):
        client = self._clients.pop(client_id, None)
        if not client:
            return
        if client.send_task:
            client.send_task.cancel()
        try:
            await client.ws.close()
        except Exception:
            pass
        logger.info("Client disconnected: %s (total=%d)", client_id, len(self._clients))

    # ── Channel Subscriptions ──────────────────────────────────

    def subscribe(self, client_id: str, channels: list[str]):
        client = self._clients.get(client_id)
        if not client:
            return
        for ch in channels:
            if ch in CHANNELS:
                client.channels.add(ch)

    def unsubscribe(self, client_id: str, channels: list[str]):
        client = self._clients.get(client_id)
        if not client:
            return
        for ch in channels:
            client.channels.discard(ch)

    # ── Sending ────────────────────────────────────────────────

    async def broadcast(self, message: str, channel: str | None = None):
        """
        Broadcast a message. If channel is set, only clients subscribed to that
        channel receive it. Otherwise, all clients receive it.
        """
        for client in list(self._clients.values()):
            if channel and channel not in client.channels:
                continue
            try:
                client.queue.put_nowait(message)
            except asyncio.QueueFull:
                # Drop oldest to make room
                try:
                    client.queue.get_nowait()
                    client.queue.put_nowait(message)
                except Exception:
                    pass

    async def send_personal(self, client_id: str, message: str):
        client = self._clients.get(client_id)
        if not client:
            return
        try:
            client.queue.put_nowait(message)
        except asyncio.QueueFull:
            try:
                client.queue.get_nowait()
                client.queue.put_nowait(message)
            except Exception:
                pass

    async def batch_broadcast(self, messages: list[str], channel: str | None = None):
        """Send multiple messages as a single JSON array to reduce WS frames."""
        if not messages:
            return
        if len(messages) == 1:
            await self.broadcast(messages[0], channel=channel)
            return
        batch_payload = json.dumps({"type": "batch", "messages": [json.loads(m) for m in messages]})
        await self.broadcast(batch_payload, channel=channel)

    # ── Per-client sender (drains queue, batches) ─────────────

    async def _client_sender(self, client: WSClient):
        """Drains the client's queue and sends messages, batching when possible."""
        try:
            while True:
                msg = await client.queue.get()
                batch = [msg]
                # Try to grab more messages within the batch window
                deadline = time.time() + self._batch_interval
                while len(batch) < self._batch_max:
                    remaining = deadline - time.time()
                    if remaining <= 0:
                        break
                    try:
                        extra = await asyncio.wait_for(client.queue.get(), timeout=remaining)
                        batch.append(extra)
                    except (asyncio.TimeoutError, asyncio.QueueEmpty):
                        break

                if len(batch) == 1:
                    await client.ws.send_text(batch[0])
                else:
                    payload = json.dumps({"type": "batch", "messages": [json.loads(m) for m in batch]})
                    await client.ws.send_text(payload)
        except (asyncio.CancelledError, Exception):
            pass

    # ── Heartbeat ──────────────────────────────────────────────

    async def _heartbeat_loop(self):
        while self._running:
            await asyncio.sleep(self._heartbeat_interval)
            now = time.time()
            stale = []
            for cid, client in self._clients.items():
                # Send ping
                try:
                    await client.ws.send_json({"type": "ping", "ts": now})
                except Exception:
                    stale.append(cid)
                    continue
                # Check pong timeout
                if now - client.last_pong > self._pong_timeout:
                    stale.append(cid)
            for cid in stale:
                logger.warning("Removing stale client: %s", cid)
                await self._remove_client(cid)

    def handle_pong(self, client_id: str):
        client = self._clients.get(client_id)
        if client:
            client.last_pong = time.time()

    # ── Stats ──────────────────────────────────────────────────

    @property
    def connection_count(self) -> int:
        return len(self._clients)

    def get_stats(self) -> dict:
        return {
            "total_connections": len(self._clients),
            "channels": {ch: sum(1 for c in self._clients.values() if ch in c.channels) for ch in CHANNELS},
        }


# Singleton
ws_manager = WebSocketManager()
