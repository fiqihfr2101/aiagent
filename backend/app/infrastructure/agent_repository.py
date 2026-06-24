import sqlite3
import uuid
import datetime
from typing import Optional, List, Dict, Any

# Valid models that can be assigned to agents
VALID_MODELS = {
    "gpt-4",
    "gpt-4-turbo",
    "gpt-4o",
    "gpt-3.5-turbo",
    "claude-sonnet-4",
    "claude-opus-4",
    "claude-3.5-sonnet",
    "claude-3-haiku",
    "kimi-k2",
}


class AgentRepository:
    """SQLite-backed agent storage with CRUD operations."""

    def __init__(self, db_path: str = "hermes_agents.db"):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        conn = self._get_conn()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS agents (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    model TEXT NOT NULL DEFAULT 'claude-sonnet-4',
                    status TEXT NOT NULL DEFAULT 'active',
                    task TEXT DEFAULT 'Idle',
                    color TEXT DEFAULT '#00D4AA',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.commit()
        finally:
            conn.close()

    def create(self, name: str, role: str, model: str = "claude-sonnet-4", status: str = "active", color: str = "#00D4AA") -> Dict[str, Any]:
        agent_id = name.lower().replace(" ", "_") + "_" + uuid.uuid4().hex[:6]
        now = datetime.datetime.now().isoformat()
        conn = self._get_conn()
        try:
            conn.execute(
                "INSERT INTO agents (id, name, role, model, status, task, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (agent_id, name, role, model, status, f"Initializing with model {model}...", color, now, now)
            )
            conn.commit()
            return self._row_to_dict(conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone())
        finally:
            conn.close()

    def get_all(self) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        try:
            rows = conn.execute("SELECT * FROM agents ORDER BY created_at DESC").fetchall()
            return [self._row_to_dict(row) for row in rows]
        finally:
            conn.close()

    def get_by_id(self, agent_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        try:
            row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
            return self._row_to_dict(row) if row else None
        finally:
            conn.close()

    def update(self, agent_id: str, **kwargs) -> Optional[Dict[str, Any]]:
        allowed = {"name", "role", "model", "status", "task", "color"}
        updates = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
        if not updates:
            return self.get_by_id(agent_id)

        # Validate model if being updated
        if "model" in updates and updates["model"] not in VALID_MODELS:
            raise ValueError(f"Invalid model: {updates['model']}. Valid models: {', '.join(sorted(VALID_MODELS))}")

        updates["updated_at"] = datetime.datetime.now().isoformat()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [agent_id]

        conn = self._get_conn()
        try:
            conn.execute(f"UPDATE agents SET {set_clause} WHERE id = ?", values)
            conn.commit()
            return self.get_by_id(agent_id)
        finally:
            conn.close()

    def update_model(self, agent_id: str, model: str) -> Optional[Dict[str, Any]]:
        return self.update(agent_id, model=model)

    def delete(self, agent_id: str) -> bool:
        conn = self._get_conn()
        try:
            cursor = conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        return {
            "id": d["id"],
            "name": d["name"],
            "role": d["role"],
            "model": d["model"],
            "status": d["status"],
            "task": d["task"] or "Idle",
            "seen": "just now",
            "uptime": "100%",
            "hb": "1s",
            "color": d["color"] or "#00D4AA",
            "created_at": d["created_at"],
            "updated_at": d["updated_at"],
        }
