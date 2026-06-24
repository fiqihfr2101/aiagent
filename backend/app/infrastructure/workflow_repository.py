"""
SQLite-backed workflow storage with CRUD operations and version history.
"""

import sqlite3
import json
import uuid
import datetime
import logging
from typing import Optional, List, Dict, Any

from .db_pool import get_pool

logger = logging.getLogger(__name__)


class WorkflowRepository:
    """SQLite-backed workflow definition storage."""

    def __init__(self, db_path: str = "hermes_agents.db"):
        self.db_path = db_path
        self._pool = get_pool(db_path)
        self._init_db()

    def _init_db(self):
        with self._pool.connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS workflows (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    nodes TEXT NOT NULL,
                    edges TEXT NOT NULL,
                    viewport TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS workflow_versions (
                    id TEXT PRIMARY KEY,
                    workflow_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    nodes TEXT NOT NULL,
                    edges TEXT NOT NULL,
                    viewport TEXT,
                    saved_at TEXT NOT NULL,
                    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
                )
            """)
            conn.commit()

    def create(self, name: str, nodes: List[Dict], edges: List[Dict], viewport: Optional[Dict] = None) -> Dict[str, Any]:
        """Create a new workflow."""
        wf_id = f"wf-{uuid.uuid4().hex[:8]}"
        now = datetime.datetime.now().isoformat()
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO workflows (id, name, nodes, edges, viewport, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (wf_id, name, json.dumps(nodes), json.dumps(edges), json.dumps(viewport), now, now, 1),
            )
            # Save initial version
            conn.execute(
                "INSERT INTO workflow_versions (id, workflow_id, version, nodes, edges, viewport, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"wfv-{uuid.uuid4().hex[:8]}", wf_id, 1, json.dumps(nodes), json.dumps(edges), json.dumps(viewport), now),
            )
            conn.commit()
        logger.info("Workflow created: %s [%s]", name, wf_id)
        return self.get_by_id(wf_id)

    def get_all(self) -> List[Dict[str, Any]]:
        """List all workflows (summary only)."""
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT id, name, created_at, updated_at, version FROM workflows ORDER BY updated_at DESC"
            ).fetchall()
            return [dict(row) for row in rows]

    def get_by_id(self, wf_id: str) -> Optional[Dict[str, Any]]:
        """Get full workflow by ID."""
        with self._pool.connection() as conn:
            row = conn.execute("SELECT * FROM workflows WHERE id = ?", (wf_id,)).fetchone()
            if not row:
                return None
            d = dict(row)
            d["nodes"] = json.loads(d["nodes"])
            d["edges"] = json.loads(d["edges"])
            d["viewport"] = json.loads(d["viewport"]) if d.get("viewport") else None
            return d

    def update(self, wf_id: str, name: str, nodes: List[Dict], edges: List[Dict], viewport: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        """Update an existing workflow and create a version snapshot."""
        now = datetime.datetime.now().isoformat()
        with self._pool.connection() as conn:
            existing = conn.execute("SELECT version FROM workflows WHERE id = ?", (wf_id,)).fetchone()
            if not existing:
                return None
            new_version = existing["version"] + 1

            conn.execute(
                "UPDATE workflows SET name = ?, nodes = ?, edges = ?, viewport = ?, updated_at = ?, version = ? WHERE id = ?",
                (name, json.dumps(nodes), json.dumps(edges), json.dumps(viewport), now, new_version, wf_id),
            )
            # Save version snapshot
            conn.execute(
                "INSERT INTO workflow_versions (id, workflow_id, version, nodes, edges, viewport, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"wfv-{uuid.uuid4().hex[:8]}", wf_id, new_version, json.dumps(nodes), json.dumps(edges), json.dumps(viewport), now),
            )
            conn.commit()
        logger.info("Workflow updated: %s v%d", wf_id, new_version)
        return self.get_by_id(wf_id)

    def delete(self, wf_id: str) -> bool:
        """Delete a workflow and its versions."""
        with self._pool.connection() as conn:
            cursor = conn.execute("DELETE FROM workflows WHERE id = ?", (wf_id,))
            conn.execute("DELETE FROM workflow_versions WHERE workflow_id = ?", (wf_id,))
            conn.commit()
            if cursor.rowcount > 0:
                logger.info("Workflow deleted: %s", wf_id)
                return True
            return False

    def get_versions(self, wf_id: str) -> List[Dict[str, Any]]:
        """Get version history for a workflow."""
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT id, version, saved_at FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC",
                (wf_id,),
            ).fetchall()
            return [dict(row) for row in rows]
