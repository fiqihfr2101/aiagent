import sqlite3
import uuid
import datetime
from typing import Optional, List, Dict, Any
import logging

from .db_pool import get_pool

logger = logging.getLogger(__name__)


class TaskRepository:
    """SQLite-backed task storage with CRUD operations and filters."""

    def __init__(self, db_path: str = "hermes_agents.db", log_repo=None):
        self.db_path = db_path
        self._pool = get_pool(db_path)
        self._log_repo = log_repo
        self._init_db()

    def _init_db(self):
        with self._pool.connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    priority TEXT NOT NULL DEFAULT 'P2',
                    status TEXT NOT NULL DEFAULT 'QUEUED',
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    result TEXT,
                    tokens_used INTEGER DEFAULT 0,
                    workflow_id TEXT
                )
            """)
            conn.commit()

    def create(self, agent_id: str, title: str, priority: str = "P2", workflow_id: str = None) -> Dict[str, Any]:
        """Create a new task."""
        task_id = f"task-{uuid.uuid4().hex[:8]}"
        now = datetime.datetime.now().isoformat()
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO tasks (id, agent_id, title, priority, status, created_at, workflow_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (task_id, agent_id, title, priority.upper(), "QUEUED", now, workflow_id)
            )
            conn.commit()
            task = self._row_to_dict(conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
            self._add_log(task_id, agent_id, "INFO", f"Task created: {title} (priority: {priority.upper()})")
            logger.info("Task created: %s [%s] agent=%s", title, task_id, agent_id)
            return task

    def get_all(self, agent_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """List tasks with optional filters."""
        with self._pool.connection() as conn:
            query = "SELECT * FROM tasks WHERE 1=1"
            params = []
            if agent_id:
                query += " AND agent_id = ?"
                params.append(agent_id)
            if status:
                query += " AND status = ?"
                params.append(status.upper())
            query += " ORDER BY created_at DESC"
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_dict(row) for row in rows]

    def get_by_id(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task by ID."""
        with self._pool.connection() as conn:
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            return self._row_to_dict(row) if row else None

    def update_status(self, task_id: str, status: str, result: str = None, tokens_used: int = None) -> Optional[Dict[str, Any]]:
        """Update task status with optional result and token count."""
        now = datetime.datetime.now().isoformat()
        with self._pool.connection() as conn:
            updates = {"status": status.upper()}
            if status.upper() == "RUNNING":
                updates["started_at"] = now
            if status.upper() in ("COMPLETED", "FAILED", "STOPPED"):
                updates["completed_at"] = now
            if result is not None:
                updates["result"] = result
            if tokens_used is not None:
                updates["tokens_used"] = tokens_used

            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values()) + [task_id]
            conn.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
            conn.commit()
            updated = self.get_by_id(task_id)
            if updated:
                self._add_log(task_id, updated.get("agent_id"), "INFO", f"Task status → {status.upper()}")
                logger.info("Task %s status → %s", task_id, status.upper())
            return updated

    def get_history(self, page: int = 1, page_size: int = 20, agent_id: Optional[str] = None, status: Optional[str] = None) -> Dict[str, Any]:
        """Get paginated task history."""
        with self._pool.connection() as conn:
            where = "WHERE 1=1"
            params = []
            if agent_id:
                where += " AND agent_id = ?"
                params.append(agent_id)
            if status:
                where += " AND status = ?"
                params.append(status.upper())

            count = conn.execute(f"SELECT COUNT(*) FROM tasks {where}", params).fetchone()[0]
            offset = (page - 1) * page_size
            rows = conn.execute(
                f"SELECT * FROM tasks {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                params + [page_size, offset]
            ).fetchall()

            return {
                "tasks": [self._row_to_dict(row) for row in rows],
                "total": count,
                "page": page,
                "page_size": page_size,
                "total_pages": (count + page_size - 1) // page_size if count > 0 else 1,
            }

    def get_active_task_count(self, agent_id: str) -> int:
        """Get count of active (QUEUED + RUNNING) tasks for an agent."""
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM tasks WHERE agent_id = ? AND status IN ('QUEUED', 'RUNNING')",
                (agent_id,)
            ).fetchone()
            return row[0]

    def get_all_active_task_counts(self) -> Dict[str, int]:
        """Get active task counts for all agents."""
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT agent_id, COUNT(*) FROM tasks WHERE status IN ('QUEUED', 'RUNNING') GROUP BY agent_id"
            ).fetchall()
            return {row[0]: row[1] for row in rows}

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        # Calculate duration if both started and completed exist
        duration = None
        if d.get("started_at") and d.get("completed_at"):
            try:
                start = datetime.datetime.fromisoformat(d["started_at"])
                end = datetime.datetime.fromisoformat(d["completed_at"])
                duration = round((end - start).total_seconds(), 2)
            except Exception:
                pass

        return {
            "id": d["id"],
            "agent_id": d["agent_id"],
            "title": d["title"],
            "priority": d["priority"],
            "status": d["status"],
            "created_at": d["created_at"],
            "started_at": d.get("started_at"),
            "completed_at": d.get("completed_at"),
            "duration": duration,
            "result": d.get("result"),
            "tokens_used": d.get("tokens_used", 0),
            "workflow_id": d.get("workflow_id"),
        }

    def _add_log(self, task_id: str, agent_id: str, level: str, message: str):
        """Add a log entry for this task if a log repository is configured."""
        if self._log_repo:
            try:
                self._log_repo.create(message=message, level=level, task_id=task_id, agent_id=agent_id)
            except Exception as e:
                logger.warning("Failed to write task log: %s", e)
