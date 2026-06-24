import sqlite3
import uuid
import datetime
from typing import Optional, List, Dict, Any

from .db_pool import get_pool


class LogRepository:
    """SQLite-backed log storage with CRUD operations and filters."""

    def __init__(self, db_path: str = "hermes_agents.db"):
        self.db_path = db_path
        self._pool = get_pool(db_path)
        self._init_db()

    def _init_db(self):
        with self._pool.connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS task_logs (
                    id TEXT PRIMARY KEY,
                    task_id TEXT,
                    agent_id TEXT,
                    level TEXT NOT NULL DEFAULT 'INFO',
                    message TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    request_id TEXT
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_task_logs_agent_id ON task_logs(agent_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_task_logs_level ON task_logs(level)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_task_logs_timestamp ON task_logs(timestamp)
            """)
            conn.commit()

    def create(
        self,
        message: str,
        level: str = "INFO",
        task_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new log entry."""
        log_id = f"log-{uuid.uuid4().hex[:12]}"
        now = datetime.datetime.now().isoformat()
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO task_logs (id, task_id, agent_id, level, message, timestamp, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (log_id, task_id, agent_id, level.upper(), message, now, request_id),
            )
            conn.commit()
            return self._row_to_dict(
                conn.execute("SELECT * FROM task_logs WHERE id = ?", (log_id,)).fetchone()
            )

    def get_by_id(self, log_id: str) -> Optional[Dict[str, Any]]:
        """Get log entry by ID."""
        with self._pool.connection() as conn:
            row = conn.execute("SELECT * FROM task_logs WHERE id = ?", (log_id,)).fetchone()
            return self._row_to_dict(row) if row else None

    def get_all(
        self,
        task_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        level: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Get logs with optional filters, pagination."""
        with self._pool.connection() as conn:
            where = "WHERE 1=1"
            params: list = []
            if task_id:
                where += " AND task_id = ?"
                params.append(task_id)
            if agent_id:
                where += " AND agent_id = ?"
                params.append(agent_id)
            if level:
                where += " AND level = ?"
                params.append(level.upper())

            count = conn.execute(f"SELECT COUNT(*) FROM task_logs {where}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM task_logs {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()

            return {
                "logs": [self._row_to_dict(row) for row in rows],
                "total": count,
                "limit": limit,
                "offset": offset,
            }

    def get_for_task(self, task_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all logs for a specific task, ordered by timestamp."""
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM task_logs WHERE task_id = ? ORDER BY timestamp ASC LIMIT ?",
                (task_id, limit),
            ).fetchall()
            return [self._row_to_dict(row) for row in rows]

    def delete(self, log_id: str) -> bool:
        """Delete a log entry."""
        with self._pool.connection() as conn:
            cursor = conn.execute("DELETE FROM task_logs WHERE id = ?", (log_id,))
            conn.commit()
            return cursor.rowcount > 0

    def delete_for_task(self, task_id: str) -> int:
        """Delete all logs for a task."""
        with self._pool.connection() as conn:
            cursor = conn.execute("DELETE FROM task_logs WHERE task_id = ?", (task_id,))
            conn.commit()
            return cursor.rowcount

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        return {
            "id": d["id"],
            "task_id": d.get("task_id"),
            "agent_id": d.get("agent_id"),
            "level": d["level"],
            "message": d["message"],
            "timestamp": d["timestamp"],
            "request_id": d.get("request_id"),
        }
