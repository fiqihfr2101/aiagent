"""
Agent Configuration Repository for H.E.R.M.E.S. AI Agent Orchestrator.

Provides SQLite-backed storage for:
- Agent configurations (save/load)
- Config profiles (clone)
- Config templates (pre-built agent types)
- Environment variables per agent
"""

import sqlite3
import uuid
import json
import datetime
import logging
from typing import Optional, List, Dict, Any

from .db_pool import get_pool

logger = logging.getLogger(__name__)


# ─── Default Templates ──────────────────────────────────────────

DEFAULT_TEMPLATES = [
    {
        "id": "tpl_researcher",
        "name": "Researcher",
        "description": "Web research agent with search and file read capabilities",
        "model": "claude-sonnet-4",
        "system_prompt": "You are a research assistant. Your job is to find, analyze, and synthesize information from multiple sources. Always cite your sources and provide evidence-based conclusions.",
        "temperature": 0.3,
        "tools": ["web_search", "file_read", "summarize", "citation_manager"],
        "toolsets": ["research", "file_access"],
        "max_tokens": 4096,
        "env_vars": {
            "SEARCH_ENGINE": "google",
            "MAX_SEARCH_RESULTS": "10",
            "ENABLE_CITATIONS": "true",
        },
    },
    {
        "id": "tpl_coder",
        "name": "Coder",
        "description": "Software development agent with terminal, file, and code execution",
        "model": "claude-sonnet-4",
        "system_prompt": "You are a software engineer. Write clean, well-documented, production-ready code. Follow best practices, use proper error handling, and include tests when appropriate.",
        "temperature": 0.2,
        "tools": ["terminal", "file_read", "file_write", "code_execute", "git"],
        "toolsets": ["development", "terminal", "file_access"],
        "max_tokens": 8192,
        "env_vars": {
            "DEFAULT_LANGUAGE": "python",
            "CODE_STYLE": "pep8",
            "ENABLE_TESTS": "true",
        },
    },
    {
        "id": "tpl_analyst",
        "name": "Analyst",
        "description": "Data analysis agent with visualization and reporting",
        "model": "claude-sonnet-4",
        "system_prompt": "You are a data analyst. Analyze datasets, identify patterns, create visualizations, and provide actionable insights. Use statistical methods and present findings clearly.",
        "temperature": 0.4,
        "tools": ["data_analysis", "visualization", "file_read", "file_write", "sql_query"],
        "toolsets": ["analytics", "visualization", "file_access"],
        "max_tokens": 4096,
        "env_vars": {
            "CHART_LIBRARY": "matplotlib",
            "DATA_FORMAT": "csv",
            "ENABLE_EXPORT": "true",
        },
    },
    {
        "id": "tpl_writer",
        "name": "Writer",
        "description": "Content generation agent for articles, docs, and creative writing",
        "model": "claude-sonnet-4",
        "system_prompt": "You are a professional writer. Create clear, engaging, and well-structured content. Adapt your tone and style to the target audience. Focus on clarity and readability.",
        "temperature": 0.7,
        "tools": ["file_read", "file_write", "web_search", "grammar_check"],
        "toolsets": ["content", "file_access"],
        "max_tokens": 4096,
        "env_vars": {
            "WRITING_STYLE": "professional",
            "TONE": "informative",
            "ENABLE_GRAMMAR_CHECK": "true",
        },
    },
]


class AgentConfigRepository:
    """SQLite-backed agent configuration storage."""

    def __init__(self, db_path: str = "hermes_agents.db"):
        self.db_path = db_path
        self._pool = get_pool(db_path)
        self._init_db()
        self._seed_templates()

    def _init_db(self):
        with self._pool.connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_configs (
                    id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    model TEXT DEFAULT 'claude-sonnet-4',
                    system_prompt TEXT DEFAULT '',
                    temperature REAL DEFAULT 0.5,
                    max_tokens INTEGER DEFAULT 4096,
                    tools TEXT DEFAULT '[]',
                    toolsets TEXT DEFAULT '[]',
                    env_vars TEXT DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS config_templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    model TEXT DEFAULT 'claude-sonnet-4',
                    system_prompt TEXT DEFAULT '',
                    temperature REAL DEFAULT 0.5,
                    max_tokens INTEGER DEFAULT 4096,
                    tools TEXT DEFAULT '[]',
                    toolsets TEXT DEFAULT '[]',
                    env_vars TEXT DEFAULT '{}',
                    is_default INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            # Index for fast agent lookups
            try:
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_agent_configs_agent
                    ON agent_configs(agent_id)
                """)
            except Exception:
                pass
            conn.commit()

    def _seed_templates(self):
        """Insert default templates if they don't exist."""
        with self._pool.connection() as conn:
            for tpl in DEFAULT_TEMPLATES:
                existing = conn.execute(
                    "SELECT id FROM config_templates WHERE id = ?", (tpl["id"],)
                ).fetchone()
                if not existing:
                    now = datetime.datetime.now().isoformat()
                    conn.execute(
                        """INSERT INTO config_templates
                           (id, name, description, model, system_prompt, temperature,
                            max_tokens, tools, toolsets, env_vars, is_default, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
                        (
                            tpl["id"], tpl["name"], tpl["description"], tpl["model"],
                            tpl["system_prompt"], tpl["temperature"], tpl["max_tokens"],
                            json.dumps(tpl["tools"]), json.dumps(tpl["toolsets"]),
                            json.dumps(tpl["env_vars"]), now,
                        ),
                    )
            conn.commit()
            logger.info("Templates seeded")

    # ─── Config CRUD ─────────────────────────────────────────────

    def save_config(self, agent_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Save or update an agent's configuration."""
        now = datetime.datetime.now().isoformat()
        tools = json.dumps(config.get("tools", []))
        toolsets = json.dumps(config.get("toolsets", []))
        env_vars = json.dumps(config.get("env_vars", {}))

        with self._pool.connection() as conn:
            existing = conn.execute(
                "SELECT id FROM agent_configs WHERE agent_id = ?", (agent_id,)
            ).fetchone()

            if existing:
                conn.execute(
                    """UPDATE agent_configs SET
                       model=?, system_prompt=?, temperature=?, max_tokens=?,
                       tools=?, toolsets=?, env_vars=?, updated_at=?
                       WHERE agent_id=?""",
                    (
                        config.get("model", "claude-sonnet-4"),
                        config.get("system_prompt", ""),
                        config.get("temperature", 0.5),
                        config.get("max_tokens", 4096),
                        tools, toolsets, env_vars, now, agent_id,
                    ),
                )
                config_id = existing["id"]
            else:
                config_id = "cfg_" + uuid.uuid4().hex[:8]
                conn.execute(
                    """INSERT INTO agent_configs
                       (id, agent_id, model, system_prompt, temperature, max_tokens,
                        tools, toolsets, env_vars, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        config_id, agent_id,
                        config.get("model", "claude-sonnet-4"),
                        config.get("system_prompt", ""),
                        config.get("temperature", 0.5),
                        config.get("max_tokens", 4096),
                        tools, toolsets, env_vars, now, now,
                    ),
                )
            conn.commit()
            logger.info("Config saved for agent %s", agent_id)
            return self.get_config(agent_id)

    def get_config(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Load an agent's configuration."""
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT * FROM agent_configs WHERE agent_id = ?", (agent_id,)
            ).fetchone()
            if not row:
                return None
            return self._row_to_dict(row)

    def clone_config(self, source_agent_id: str, target_agent_id: str) -> Dict[str, Any]:
        """Clone configuration from one agent to another."""
        source = self.get_config(source_agent_id)
        if not source:
            raise ValueError(f"No config found for agent {source_agent_id}")
        source.pop("id", None)
        source.pop("agent_id", None)
        source.pop("created_at", None)
        source.pop("updated_at", None)
        return self.save_config(target_agent_id, source)

    def delete_config(self, agent_id: str) -> bool:
        """Delete an agent's configuration."""
        with self._pool.connection() as conn:
            cursor = conn.execute(
                "DELETE FROM agent_configs WHERE agent_id = ?", (agent_id,)
            )
            conn.commit()
            return cursor.rowcount > 0

    # ─── Template CRUD ───────────────────────────────────────────

    def get_templates(self) -> List[Dict[str, Any]]:
        """List all config templates."""
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM config_templates ORDER BY is_default DESC, name ASC"
            ).fetchall()
            return [self._template_to_dict(row) for row in rows]

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        """Get a single template."""
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT * FROM config_templates WHERE id = ?", (template_id,)
            ).fetchone()
            return self._template_to_dict(row) if row else None

    def create_template(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new template."""
        tpl_id = "tpl_" + uuid.uuid4().hex[:8]
        now = datetime.datetime.now().isoformat()
        tools = json.dumps(data.get("tools", []))
        toolsets = json.dumps(data.get("toolsets", []))
        env_vars = json.dumps(data.get("env_vars", {}))

        with self._pool.connection() as conn:
            conn.execute(
                """INSERT INTO config_templates
                   (id, name, description, model, system_prompt, temperature,
                    max_tokens, tools, toolsets, env_vars, is_default, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
                (
                    tpl_id, data.get("name", "Untitled"),
                    data.get("description", ""),
                    data.get("model", "claude-sonnet-4"),
                    data.get("system_prompt", ""),
                    data.get("temperature", 0.5),
                    data.get("max_tokens", 4096),
                    tools, toolsets, env_vars, now,
                ),
            )
            conn.commit()
            return self.get_template(tpl_id)

    def apply_template(self, agent_id: str, template_id: str) -> Dict[str, Any]:
        """Apply a template's settings to an agent's config."""
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")
        config = {
            "model": template["model"],
            "system_prompt": template["system_prompt"],
            "temperature": template["temperature"],
            "max_tokens": template["max_tokens"],
            "tools": template["tools"],
            "toolsets": template["toolsets"],
            "env_vars": template["env_vars"],
        }
        return self.save_config(agent_id, config)

    def create_template_from_agent(self, agent_id: str, name: str, description: str = "") -> Dict[str, Any]:
        """Create a template from an agent's current config."""
        config = self.get_config(agent_id)
        if not config:
            raise ValueError(f"No config found for agent {agent_id}")
        return self.create_template({
            "name": name,
            "description": description or f"Template from agent {agent_id}",
            "model": config["model"],
            "system_prompt": config["system_prompt"],
            "temperature": config["temperature"],
            "max_tokens": config["max_tokens"],
            "tools": config["tools"],
            "toolsets": config["toolsets"],
            "env_vars": config["env_vars"],
        })

    # ─── Env Vars ────────────────────────────────────────────────

    def get_env_vars(self, agent_id: str) -> Dict[str, str]:
        """Get environment variables for an agent."""
        config = self.get_config(agent_id)
        if not config:
            return {}
        return config.get("env_vars", {})

    def set_env_var(self, agent_id: str, key: str, value: str) -> Dict[str, str]:
        """Set a single environment variable."""
        config = self.get_config(agent_id) or {}
        env_vars = config.get("env_vars", {})
        env_vars[key] = value
        self.save_config(agent_id, {**config, "env_vars": env_vars})
        return env_vars

    def delete_env_var(self, agent_id: str, key: str) -> Dict[str, str]:
        """Delete a single environment variable."""
        config = self.get_config(agent_id) or {}
        env_vars = config.get("env_vars", {})
        env_vars.pop(key, None)
        self.save_config(agent_id, {**config, "env_vars": env_vars})
        return env_vars

    # ─── Helpers ─────────────────────────────────────────────────

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        return {
            "id": d["id"],
            "agent_id": d["agent_id"],
            "model": d["model"],
            "system_prompt": d["system_prompt"] or "",
            "temperature": d["temperature"],
            "max_tokens": d["max_tokens"],
            "tools": json.loads(d["tools"]) if d["tools"] else [],
            "toolsets": json.loads(d["toolsets"]) if d["toolsets"] else [],
            "env_vars": json.loads(d["env_vars"]) if d["env_vars"] else {},
            "created_at": d["created_at"],
            "updated_at": d["updated_at"],
        }

    def _template_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        return {
            "id": d["id"],
            "name": d["name"],
            "description": d["description"] or "",
            "model": d["model"],
            "system_prompt": d["system_prompt"] or "",
            "temperature": d["temperature"],
            "max_tokens": d["max_tokens"],
            "tools": json.loads(d["tools"]) if d["tools"] else [],
            "toolsets": json.loads(d["toolsets"]) if d["toolsets"] else [],
            "env_vars": json.loads(d["env_vars"]) if d["env_vars"] else {},
            "is_default": bool(d.get("is_default", 0)),
            "created_at": d["created_at"],
        }
