"""CDC (Change Data Capture) Poller.

Polls the change_log table for new entries and broadcasts them
to connected SSE clients via asyncio queues.

Architecture:
    DB → Triggers → change_log → CDCPoller → SSE → Clients
"""

import asyncio
import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional

from .pg_pool import get_pool

logger = logging.getLogger(__name__)


class CDCPoller:
    """Polls change_log table and broadcasts changes to subscribers."""

    def __init__(self, poll_interval: float = 0.2):
        self._pool = get_pool()
        self._last_seq: int = 0
        self._poll_interval = poll_interval
        self._subscribers: List[asyncio.Queue] = []
        self._lock = threading.Lock()
        self._running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._change_log_exists: bool = False

    def initialize(self):
        """Initialize the poller — read the current max seq from change_log."""
        try:
            result = self._pool.execute(
                "SELECT COALESCE(MAX(seq), 0) AS max_seq FROM change_log"
            )
            if result:
                self._last_seq = result[0]["max_seq"]
            logger.info("CDC Poller initialized, last seq: %d", self._last_seq)
            self._change_log_exists = True
        except Exception as e:
            logger.warning(
                "CDC Poller init failed (change_log table may not exist): %s. "
                "CDC events will not be streamed until the table is created. "
                "Run scripts/create-cdc-tables.sql to set up CDC.", e
            )
            self._last_seq = 0
            self._change_log_exists = False

    def subscribe(self) -> asyncio.Queue:
        """Subscribe to CDC events. Returns an asyncio.Queue that receives events."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        with self._lock:
            self._subscribers.append(queue)
        logger.debug("CDC subscriber added (total=%d)", len(self._subscribers))
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        """Remove a subscriber queue."""
        with self._lock:
            if queue in self._subscribers:
                self._subscribers.remove(queue)
        logger.debug("CDC subscriber removed (total=%d)", len(self._subscribers))

    def _broadcast(self, event: Dict[str, Any]):
        """Put event into all subscriber queues (non-blocking, drops on full)."""
        with self._lock:
            subscribers = list(self._subscribers)

        for queue in subscribers:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("CDC subscriber queue full, dropping event seq=%s", event.get("seq"))

    def poll_once(self) -> List[Dict[str, Any]]:
        """Poll for new changes since last_seq. Returns list of events."""
        try:
            result = self._pool.execute(
                """
                SELECT seq, table_name, row_id, operation,
                       old_data, new_data, created_at
                FROM change_log
                WHERE seq > %s
                ORDER BY seq ASC
                LIMIT 200
                """,
                (self._last_seq,),
            )
        except Exception as e:
            logger.error("CDC poll query error: %s", e)
            return []

        if not result:
            return []

        events = []
        for row in result:
            event = {
                "seq": row["seq"],
                "table": row["table_name"],
                "row_id": row["row_id"],
                "operation": row["operation"],
                "old_data": row["old_data"],
                "new_data": row["new_data"],
                "timestamp": row["created_at"].isoformat() if row["created_at"] else None,
            }
            self._last_seq = row["seq"]
            events.append(event)

        return events

    async def _poll_loop(self):
        """Async polling loop — runs as a background task."""
        logger.info("CDC poller loop started (interval=%.2fs)", self._poll_interval)
        while self._running:
            try:
                events = await asyncio.get_event_loop().run_in_executor(
                    None, self.poll_once
                )
                for event in events:
                    self._broadcast(event)
            except Exception as e:
                logger.error("CDC poller error: %s", e)
            await asyncio.sleep(self._poll_interval)
        logger.info("CDC poller loop stopped")

    async def start(self):
        """Start the CDC poller as a background asyncio task."""
        self._running = True
        self._loop = asyncio.get_event_loop()
        self.initialize()
        asyncio.create_task(self._poll_loop())
        logger.info("CDC Poller started")

    async def stop(self):
        """Stop the CDC poller."""
        self._running = False
        logger.info("CDC Poller stopping...")


# Global singleton
_cdc_poller: Optional[CDCPoller] = None


def get_cdc_poller() -> CDCPoller:
    """Get or create the global CDC poller instance."""
    global _cdc_poller
    if _cdc_poller is None:
        _cdc_poller = CDCPoller()
    return _cdc_poller
