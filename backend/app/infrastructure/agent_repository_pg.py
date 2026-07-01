"""PostgreSQL-backed agent storage with CRUD operations."""

import uuid
import datetime
import logging
from typing import Optional, List, Dict, Any

from .pg_pool import get_pool

logger = logging.getLogger(__name__)

# Valid models that can be assigned to agents (OpenCode Go models)
VALID_MODELS = {
    # MiniMax
    "minimax-m3",
    "minimax-m2.7",
    "minimax-m2.5",
    # Kimi
    "kimi-k2.7-code",
    "kimi-k2.6",
    "kimi-k2.5",
    # GLM
    "glm-5.2",
    "glm-5.1",
    "glm-5",
    # DeepSeek
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    # Qwen
    "qwen3.7-max",
    "qwen3.7-plus",
    "qwen3.6-plus",
    "qwen3.5-plus",
    # Mimo
    "mimo-v2-pro",
    "mimo-v2-omni",
    "mimo-v2.5-pro",
    "mimo-v2.5",
    # Other
    "hy3-preview",
}


class AgentRepository:
    """PostgreSQL-backed agent storage with CRUD operations."""
    
    def __init__(self, dsn: Optional[str] = None):
        self._pool = get_pool(dsn)
        self._init_db()
    
    def _init_db(self):
        """Create the agents table if it doesn't exist (idempotent)."""
        query = """
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
        """
        try:
            with self._pool.cursor() as cursor:
                cursor.execute(query)
            logger.info("Agents table ensured in PostgreSQL")
        except Exception as e:
            logger.warning("Could not create agents table (may already exist): %s", e)
        
        # Migration: reset all agents stuck in 'active' to 'idle'
        try:
            with self._pool.cursor() as cursor:
                cursor.execute("UPDATE agents SET status = 'idle' WHERE status = 'active'")
                if cursor.rowcount > 0:
                    logger.info("Migration: reset %d agents from 'active' to 'idle'", cursor.rowcount)
        except Exception as e:
            logger.warning("Could not run status migration: %s", e)
    
    def _row_to_dict(self, row) -> Dict[str, Any]:
        """Convert a PostgreSQL row to a dictionary."""
        if row is None:
            return None
        d = dict(row)
        return {
            "id": d["id"],
            "name": d["name"],
            "role": d["role"],
            "model": d["model"],
            "status": d["status"],
            "task": d.get("task") or "Idle",
            "seen": "just now",
            "uptime": "100%",
            "hb": "1s",
            "color": d.get("color") or "#00D4AA",
            "created_at": d["created_at"],
            "updated_at": d["updated_at"],
        }
    
    def create(self, name: str, role: str, model: str = "claude-sonnet-4", 
               status: str = "idle", color: str = "#00D4AA") -> Dict[str, Any]:
        """Create a new agent."""
        agent_id = name.lower().replace(" ", "_") + "_" + uuid.uuid4().hex[:6]
        now = datetime.datetime.now().isoformat()
        
        logger.info("SQL QUERY: INSERT INTO agents (name=%s, role=%s, model=%s)", name, role, model)
        
        query = """
            INSERT INTO agents (id, name, role, model, status, task, color, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """
        params = (agent_id, name, role, model, status, "Idle", color, now, now)
        
        with self._pool.cursor() as cursor:
            cursor.execute(query, params)
            row = cursor.fetchone()
            return self._row_to_dict(row)
    
    def get_all(self) -> List[Dict[str, Any]]:
        """Get all agents."""
        query = "SELECT * FROM agents ORDER BY created_at DESC"
        with self._pool.cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
    
    def get_by_id(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get an agent by ID."""
        query = "SELECT * FROM agents WHERE id = %s"
        with self._pool.cursor() as cursor:
            cursor.execute(query, (agent_id,))
            row = cursor.fetchone()
            return self._row_to_dict(row)
    
    def update(self, agent_id: str, **kwargs) -> Optional[Dict[str, Any]]:
        """Update an agent."""
        if not kwargs:
            return self.get_by_id(agent_id)
        
        # Validate model if provided
        if "model" in kwargs and kwargs["model"] not in VALID_MODELS:
            raise ValueError(f"Invalid model: {kwargs['model']}. Valid models: {', '.join(sorted(VALID_MODELS))}")
        
        # Build UPDATE query dynamically
        set_clauses = []
        params = []
        for key, value in kwargs.items():
            if key in ("name", "role", "model", "status", "task", "color"):
                set_clauses.append(f"{key} = %s")
                params.append(value)
        
        if not set_clauses:
            return self.get_by_id(agent_id)
        
        # Add updated_at
        set_clauses.append("updated_at = %s")
        params.append(datetime.datetime.now().isoformat())
        
        # Add agent_id
        params.append(agent_id)
        
        query = f"UPDATE agents SET {', '.join(set_clauses)} WHERE id = %s RETURNING *"
        
        with self._pool.cursor() as cursor:
            cursor.execute(query, tuple(params))
            row = cursor.fetchone()
            return self._row_to_dict(row)
    
    def delete(self, agent_id: str) -> bool:
        """Delete an agent."""
        query = "DELETE FROM agents WHERE id = %s"
        with self._pool.cursor() as cursor:
            cursor.execute(query, (agent_id,))
            return cursor.rowcount > 0
    
    def update_status(self, agent_id: str, status: str) -> Optional[Dict[str, Any]]:
        """Update agent status (idle, active, sleeping, offline)."""
        query = """
            UPDATE agents SET status = %s, updated_at = %s WHERE id = %s RETURNING *
        """
        now = datetime.datetime.now().isoformat()
        with self._pool.cursor() as cursor:
            cursor.execute(query, (status, now, agent_id))
            row = cursor.fetchone()
            return self._row_to_dict(row) if row else None
    
    def get_status(self, agent_id: str) -> Optional[str]:
        """Get agent status."""
        query = "SELECT status FROM agents WHERE id = %s"
        with self._pool.cursor() as cursor:
            cursor.execute(query, (agent_id,))
            row = cursor.fetchone()
            return row["status"] if row else None
    
    def count(self) -> int:
        """Get the number of agents."""
        query = "SELECT COUNT(*) FROM agents"
        with self._pool.cursor() as cursor:
            cursor.execute(query)
            row = cursor.fetchone()
            return row["count"] if row else 0
