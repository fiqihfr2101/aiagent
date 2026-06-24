"""
Agent-to-Agent Message Bus for H.E.R.M.E.S. AI Agent Orchestrator.

Provides Redis Pub/Sub messaging with SQLite persistence, supporting
direct messages, broadcast, and delegation between agents.
"""

import sqlite3
import json
import uuid
import datetime
import asyncio
import logging
from enum import Enum
from typing import Optional, List, Dict, Any

from .db_pool import get_pool

logger = logging.getLogger("hermes.message_bus")


class MessageType(str, Enum):
    """Supported message types for inter-agent communication."""
    DIRECT = "direct"
    BROADCAST = "broadcast"
    DELEGATION = "delegation"


class MessageBus:
    """
    Agent-to-agent message bus with:
    - SQLite persistence for message history
    - In-memory queue for offline agents
    - Redis Pub/Sub support (optional, falls back to local)
    - Message types: direct, broadcast, delegation
    """

    def __init__(self, db_path: str = "hermes_agents.db", redis_client=None):
        self.db_path = db_path
        self._pool = get_pool(db_path)
        self._redis = redis_client
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}  # agent_id -> [queues]
        self._offline_queues: Dict[str, List[Dict[str, Any]]] = {}  # agent_id -> [messages]
        self._init_db()

    def _init_db(self):
        with self._pool.connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    from_agent_id TEXT NOT NULL,
                    to_agent_id TEXT,
                    subject TEXT NOT NULL DEFAULT '',
                    body TEXT NOT NULL DEFAULT '',
                    metadata TEXT,
                    read INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_to_agent
                ON messages(to_agent_id, created_at DESC)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_from_agent
                ON messages(from_agent_id, created_at DESC)
            """)
            conn.commit()

    # ─── Send Message ────────────────────────────────────────────

    def send(
        self,
        from_agent_id: str,
        to_agent_id: Optional[str],
        msg_type: str,
        subject: str = "",
        body: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Send a message. Returns the persisted message dict.

        Args:
            from_agent_id: Sender agent ID
            to_agent_id: Recipient agent ID (None for broadcast)
            msg_type: 'direct', 'broadcast', or 'delegation'
            subject: Message subject line
            body: Message body
            metadata: Optional JSON metadata (e.g. delegated_task info)
        """
        if msg_type not in [t.value for t in MessageType]:
            raise ValueError(f"Invalid message type: {msg_type}")

        msg_id = f"msg-{uuid.uuid4().hex[:8]}"
        now = datetime.datetime.now().isoformat()

        with self._pool.connection() as conn:
            conn.execute(
                """INSERT INTO messages
                   (id, type, from_agent_id, to_agent_id, subject, body, metadata, read, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)""",
                (msg_id, msg_type, from_agent_id, to_agent_id, subject, body,
                 json.dumps(metadata) if metadata else None, now),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()

        msg = self._row_to_dict(row)

        # Deliver via in-memory subscribers
        self._deliver_to_subscribers(msg)

        # Queue for offline agent if direct/delegation
        if to_agent_id and msg_type in ("direct", "delegation"):
            self._queue_for_offline(to_agent_id, msg)

        logger.info("Message sent: %s → %s [%s] %s", from_agent_id, to_agent_id or "ALL", msg_type, subject)
        return msg

    # ─── Get Messages ────────────────────────────────────────────

    def get_messages(
        self,
        agent_id: str,
        msg_type: Optional[str] = None,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Get messages for an agent (sent to them or broadcast)."""
        with self._pool.connection() as conn:
            where = "WHERE (to_agent_id = ? OR to_agent_id IS NULL OR from_agent_id = ?)"
            params: list = [agent_id, agent_id]

            if msg_type:
                where += " AND type = ?"
                params.append(msg_type)
            if unread_only:
                where += " AND read = 0 AND to_agent_id = ?"
                params.append(agent_id)

            count_params = list(params)
            count = conn.execute(f"SELECT COUNT(*) FROM messages {where}", count_params).fetchone()[0]

            rows = conn.execute(
                f"SELECT * FROM messages {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()

            return {
                "messages": [self._row_to_dict(r) for r in rows],
                "total": count,
                "limit": limit,
                "offset": offset,
            }

    def get_thread(self, agent_a: str, agent_b: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get conversation thread between two agents."""
        with self._pool.connection() as conn:
            rows = conn.execute(
                """SELECT * FROM messages
                   WHERE (from_agent_id = ? AND to_agent_id = ?)
                      OR (from_agent_id = ? AND to_agent_id = ?)
                   ORDER BY created_at DESC LIMIT ?""",
                (agent_a, agent_b, agent_b, agent_a, limit),
            ).fetchall()
            return [self._row_to_dict(r) for r in rows]

    def mark_read(self, msg_id: str) -> bool:
        """Mark a message as read."""
        with self._pool.connection() as conn:
            cursor = conn.execute("UPDATE messages SET read = 1 WHERE id = ?", (msg_id,))
            conn.commit()
            return cursor.rowcount > 0

    def mark_all_read(self, agent_id: str) -> int:
        """Mark all messages to an agent as read."""
        with self._pool.connection() as conn:
            cursor = conn.execute(
                "UPDATE messages SET read = 1 WHERE to_agent_id = ? AND read = 0",
                (agent_id,),
            )
            conn.commit()
            return cursor.rowcount

    def get_unread_count(self, agent_id: str) -> int:
        """Get count of unread messages for an agent."""
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM messages WHERE to_agent_id = ? AND read = 0",
                (agent_id,),
            ).fetchone()
            return row[0]

    def get_conversations(self, agent_id: str) -> List[Dict[str, Any]]:
        """Get list of unique agents this agent has conversed with."""
        with self._pool.connection() as conn:
            rows = conn.execute(
                """SELECT DISTINCT
                     CASE WHEN from_agent_id = ? THEN to_agent_id ELSE from_agent_id END as other_agent,
                     MAX(created_at) as last_message_at,
                     COUNT(*) as message_count
                   FROM messages
                   WHERE from_agent_id = ? OR to_agent_id = ?
                   GROUP BY other_agent
                   ORDER BY last_message_at DESC""",
                (agent_id, agent_id, agent_id),
            ).fetchall()
            return [
                {"agent_id": r[0], "last_message_at": r[1], "message_count": r[2]}
                for r in rows if r[0] is not None
            ]

    # ─── Real-time Delivery ──────────────────────────────────────

    def subscribe(self, agent_id: str) -> asyncio.Queue:
        """Subscribe to messages for an agent. Returns an asyncio.Queue."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subscribers.setdefault(agent_id, []).append(queue)
        return queue

    def unsubscribe(self, agent_id: str, queue: asyncio.Queue):
        """Unsubscribe a queue from an agent's messages."""
        queues = self._subscribers.get(agent_id, [])
        if queue in queues:
            queues.remove(queue)

    def _deliver_to_subscribers(self, msg: Dict[str, Any]):
        """Push message to all in-memory subscribers."""
        targets = set()
        if msg.get("to_agent_id"):
            targets.add(msg["to_agent_id"])
        # Broadcast goes to all subscribers
        if msg["type"] == "broadcast":
            targets = set(self._subscribers.keys())

        for agent_id in targets:
            for queue in self._subscribers.get(agent_id, []):
                try:
                    queue.put_nowait(msg)
                except asyncio.QueueFull:
                    try:
                        queue.get_nowait()
                        queue.put_nowait(msg)
                    except Exception:
                        pass

    def _queue_for_offline(self, agent_id: str, msg: Dict[str, Any]):
        """Queue message for offline agent delivery."""
        queue = self._offline_queues.setdefault(agent_id, [])
        if len(queue) >= 100:
            queue.pop(0)
        queue.append(msg)

    def flush_offline_queue(self, agent_id: str) -> List[Dict[str, Any]]:
        """Flush and return queued messages for an agent (call on agent connect)."""
        return self._offline_queues.pop(agent_id, [])

    # ─── Helpers ─────────────────────────────────────────────────

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        metadata = None
        if d.get("metadata"):
            try:
                metadata = json.loads(d["metadata"])
            except Exception:
                metadata = None
        return {
            "id": d["id"],
            "type": d["type"],
            "from_agent_id": d["from_agent_id"],
            "to_agent_id": d.get("to_agent_id"),
            "subject": d.get("subject", ""),
            "body": d.get("body", ""),
            "metadata": metadata,
            "read": bool(d["read"]),
            "created_at": d["created_at"],
        }
