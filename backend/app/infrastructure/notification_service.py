"""Notification Service for H.E.R.M.E.S. AI Agent Orchestrator.

Stores notifications in SQLite, provides CRUD operations,
and supports Telegram push notifications.
"""

import sqlite3
import uuid
import datetime
import asyncio
import os
from typing import Optional, List, Dict, Any


# Notification type constants
NOTIFICATION_TYPES = [
    "task_completed",
    "task_failed",
    "task_stopped",
    "agent_registered",
    "cost_alert",
]

# Icon/emoji mapping for notification types
NOTIFICATION_ICONS = {
    "task_completed": "✅",
    "task_failed": "❌",
    "task_stopped": "⚠️",
    "agent_registered": "🆕",
    "cost_alert": "💰",
}

# Color mapping for toast notifications
NOTIFICATION_COLORS = {
    "task_completed": "green",
    "task_failed": "red",
    "task_stopped": "amber",
    "agent_registered": "blue",
    "cost_alert": "amber",
}


class NotificationService:
    """SQLite-backed notification storage with CRUD and Telegram push."""

    def __init__(self, db_path: str = "hermes_agents.db"):
        self.db_path = db_path
        self._telegram_token: Optional[str] = os.getenv("TELEGRAM_BOT_TOKEN")
        self._telegram_chat_id: Optional[str] = os.getenv("TELEGRAM_CHAT_ID")
        self._dashboard_url: str = os.getenv("DASHBOARD_URL", "http://localhost:3000")
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        conn = self._get_conn()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    read INTEGER NOT NULL DEFAULT 0,
                    data TEXT,
                    created_at TEXT NOT NULL
                )
            """)
            conn.commit()
        finally:
            conn.close()

    # ─── CRUD ──────────────────────────────────────────────────────

    def create(
        self,
        notification_type: str,
        title: str,
        description: str = "",
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a new notification."""
        notif_id = f"notif-{uuid.uuid4().hex[:8]}"
        now = datetime.datetime.now().isoformat()
        conn = self._get_conn()
        try:
            conn.execute(
                "INSERT INTO notifications (id, type, title, description, read, data, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
                (notif_id, notification_type, title, description, self._serialize_data(data), now),
            )
            conn.commit()
            return self._row_to_dict(
                conn.execute("SELECT * FROM notifications WHERE id = ?", (notif_id,)).fetchone()
            )
        finally:
            conn.close()

    def get_all(
        self, page: int = 1, page_size: int = 50, unread_only: bool = False
    ) -> Dict[str, Any]:
        """Get paginated notifications."""
        conn = self._get_conn()
        try:
            where = "WHERE 1=1"
            params: list = []
            if unread_only:
                where += " AND read = 0"

            count = conn.execute(f"SELECT COUNT(*) FROM notifications {where}", params).fetchone()[0]
            offset = (page - 1) * page_size
            rows = conn.execute(
                f"SELECT * FROM notifications {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                params + [page_size, offset],
            ).fetchall()

            return {
                "notifications": [self._row_to_dict(r) for r in rows],
                "total": count,
                "page": page,
                "page_size": page_size,
                "total_pages": max((count + page_size - 1) // page_size, 1),
                "unread_count": self._unread_count(),
            }
        finally:
            conn.close()

    def get_by_id(self, notif_id: str) -> Optional[Dict[str, Any]]:
        """Get notification by ID."""
        conn = self._get_conn()
        try:
            row = conn.execute("SELECT * FROM notifications WHERE id = ?", (notif_id,)).fetchone()
            return self._row_to_dict(row) if row else None
        finally:
            conn.close()

    def mark_read(self, notif_id: str) -> Optional[Dict[str, Any]]:
        """Mark a single notification as read."""
        conn = self._get_conn()
        try:
            conn.execute("UPDATE notifications SET read = 1 WHERE id = ?", (notif_id,))
            conn.commit()
            return self.get_by_id(notif_id)
        finally:
            conn.close()

    def mark_all_read(self) -> int:
        """Mark all notifications as read. Returns count updated."""
        conn = self._get_conn()
        try:
            cursor = conn.execute("UPDATE notifications SET read = 1 WHERE read = 0")
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()

    def delete(self, notif_id: str) -> bool:
        """Delete a notification by ID."""
        conn = self._get_conn()
        try:
            cursor = conn.execute("DELETE FROM notifications WHERE id = ?", (notif_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def get_unread_count(self) -> int:
        """Get count of unread notifications."""
        return self._unread_count()

    # ─── Telegram Push ─────────────────────────────────────────────

    async def send_telegram(self, message: str) -> bool:
        """Send a message via Telegram bot. Returns True on success."""
        if not self._telegram_token or not self._telegram_chat_id:
            return False
        try:
            import httpx
            url = f"https://api.telegram.org/bot{self._telegram_token}/sendMessage"
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json={
                    "chat_id": self._telegram_chat_id,
                    "text": message,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                })
                return resp.status_code == 200
        except Exception as e:
            print(f"Telegram notification failed: {e}")
            return False

    def format_task_telegram(
        self,
        task_title: str,
        agent_name: str,
        status: str,
        duration: Optional[float] = None,
        tokens_used: int = 0,
        cost: float = 0.0,
    ) -> str:
        """Format a task notification for Telegram."""
        icon = "✅" if status == "COMPLETED" else "❌" if status == "FAILED" else "⚠️"
        lines = [
            f"{icon} <b>Task {status.title()}</b>",
            f"",
            f"📋 <b>{task_title}</b>",
            f"🤖 Agent: {agent_name}",
        ]
        if duration is not None:
            lines.append(f"⏱ Duration: {duration:.1f}s")
        if tokens_used > 0:
            lines.append(f"🔤 Tokens: {tokens_used:,}")
        if cost > 0:
            lines.append(f"💰 Cost: ${cost:.4f}")
        lines.append(f"")
        lines.append(f"🔗 <a href=\"{self._dashboard_url}\">Open Dashboard</a>")
        return "\n".join(lines)

    # ─── Helpers ───────────────────────────────────────────────────

    def _unread_count(self) -> int:
        conn = self._get_conn()
        try:
            row = conn.execute("SELECT COUNT(*) FROM notifications WHERE read = 0").fetchone()
            return row[0]
        finally:
            conn.close()

    @staticmethod
    def _serialize_data(data: Optional[Dict[str, Any]]) -> Optional[str]:
        if data is None:
            return None
        import json
        return json.dumps(data)

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        import json
        d = dict(row)
        data = None
        if d.get("data"):
            try:
                data = json.loads(d["data"])
            except Exception:
                data = None
        return {
            "id": d["id"],
            "type": d["type"],
            "title": d["title"],
            "description": d.get("description", ""),
            "read": bool(d["read"]),
            "data": data,
            "created_at": d["created_at"],
            "icon": NOTIFICATION_ICONS.get(d["type"], "🔔"),
            "color": NOTIFICATION_COLORS.get(d["type"], "blue"),
        }
