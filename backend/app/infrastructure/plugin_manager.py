"""
Plugin Manager for H.E.R.M.E.S. AI Agent Orchestrator.

Provides plugin discovery, lifecycle management, configuration,
and API registration for the plugin marketplace system.
"""

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pathlib import Path

logger = logging.getLogger("hermes.plugins")

# ─── Plugin Data Model ──────────────────────────────────────────

BUILTIN_PLUGINS = [
    {
        "id": "web-search",
        "name": "Web Search",
        "description": "Search the web using Hermes web_search integration. Supports multiple search engines and result filtering.",
        "version": "1.0.0",
        "author": "Hermes Team",
        "category": "search",
        "icon": "🔍",
        "capabilities": ["web_search", "url_fetch", "snippet_extract"],
        "config_schema": {
            "engine": {"type": "string", "default": "hermes", "description": "Search engine"},
            "max_results": {"type": "integer", "default": 10, "description": "Max results per query"},
        },
        "builtin": True,
    },
    {
        "id": "file-ops",
        "name": "File Operations",
        "description": "Read, write, and patch files on the local filesystem. Includes sandboxed file access with path validation.",
        "version": "1.0.0",
        "author": "Hermes Team",
        "category": "filesystem",
        "icon": "📁",
        "capabilities": ["file_read", "file_write", "file_patch", "directory_list"],
        "config_schema": {
            "allowed_paths": {"type": "array", "default": ["*"], "description": "Allowed path patterns"},
            "max_file_size": {"type": "integer", "default": 10485760, "description": "Max file size in bytes"},
        },
        "builtin": True,
    },
    {
        "id": "db-query",
        "name": "Database Query",
        "description": "Execute SQL queries against connected databases. Supports read and write operations with configurable access control.",
        "version": "1.0.0",
        "author": "Hermes Team",
        "category": "database",
        "icon": "🗄️",
        "capabilities": ["sql_query", "schema_inspect", "data_export"],
        "config_schema": {
            "read_only": {"type": "boolean", "default": True, "description": "Restrict to read-only queries"},
            "max_rows": {"type": "integer", "default": 1000, "description": "Max rows returned"},
        },
        "builtin": True,
    },
    {
        "id": "api-caller",
        "name": "API Caller",
        "description": "Make REST and GraphQL API calls. Includes request validation, auth header injection, and response caching.",
        "version": "1.0.0",
        "author": "Hermes Team",
        "category": "integration",
        "icon": "🌐",
        "capabilities": ["rest_call", "graphql_call", "webhook_trigger"],
        "config_schema": {
            "timeout": {"type": "integer", "default": 30, "description": "Request timeout in seconds"},
            "base_urls": {"type": "array", "default": ["*"], "description": "Allowed base URLs"},
        },
        "builtin": True,
    },
    {
        "id": "code-execution",
        "name": "Code Execution",
        "description": "Execute code snippets in a sandboxed environment. Supports Python, JavaScript, and shell commands with resource limits.",
        "version": "1.0.0",
        "author": "Hermes Team",
        "category": "development",
        "icon": "💻",
        "capabilities": ["python_exec", "js_exec", "shell_exec"],
        "config_schema": {
            "language": {"type": "string", "default": "python", "description": "Default language"},
            "timeout": {"type": "integer", "default": 30, "description": "Execution timeout in seconds"},
            "memory_limit": {"type": "string", "default": "256MB", "description": "Memory limit"},
        },
        "builtin": True,
    },
]


class PluginManager:
    """Manages plugin lifecycle, configuration, and API registration."""

    def __init__(self):
        self._plugins: Dict[str, Dict[str, Any]] = {}
        self._installed: Dict[str, Dict[str, Any]] = {}
        self._load_builtin_plugins()

    def _load_builtin_plugins(self):
        """Register all built-in plugins in the marketplace."""
        for plugin in BUILTIN_PLUGINS:
            self._plugins[plugin["id"]] = {
                **plugin,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        logger.info("Loaded %d built-in plugins", len(BUILTIN_PLUGINS))

    # ─── Marketplace ────────────────────────────────────────────

    def get_marketplace(self, category: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all available plugins in the marketplace."""
        results = list(self._plugins.values())
        if category:
            results = [p for p in results if p.get("category") == category]
        if search:
            q = search.lower()
            results = [p for p in results if q in p["name"].lower() or q in p["description"].lower()]
        return results

    # ─── Installed Plugins ──────────────────────────────────────

    def get_installed(self) -> List[Dict[str, Any]]:
        """List all installed plugins with their status."""
        result = []
        for pid, plugin in self._installed.items():
            result.append({
                **self._plugins.get(pid, {}),
                **plugin,
            })
        return result

    def install(self, plugin_id: str, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Install a plugin from the marketplace."""
        if plugin_id not in self._plugins:
            return {"error": f"Plugin '{plugin_id}' not found in marketplace"}
        if plugin_id in self._installed:
            return {"error": f"Plugin '{plugin_id}' is already installed"}

        plugin = self._plugins[plugin_id]
        # Apply default config
        default_config = {}
        for key, schema in plugin.get("config_schema", {}).items():
            default_config[key] = config.get(key, schema.get("default")) if config else schema.get("default")

        self._installed[plugin_id] = {
            "enabled": True,
            "config": default_config,
            "installed_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("Installed plugin: %s", plugin_id)
        return self.get_plugin(plugin_id)

    def uninstall(self, plugin_id: str) -> Dict[str, Any]:
        """Uninstall a plugin."""
        if plugin_id not in self._installed:
            return {"error": f"Plugin '{plugin_id}' is not installed"}
        del self._installed[plugin_id]
        logger.info("Uninstalled plugin: %s", plugin_id)
        return {"status": "uninstalled", "id": plugin_id}

    # ─── Enable / Disable ──────────────────────────────────────

    def enable(self, plugin_id: str) -> Dict[str, Any]:
        """Enable an installed plugin."""
        if plugin_id not in self._installed:
            return {"error": f"Plugin '{plugin_id}' is not installed"}
        self._installed[plugin_id]["enabled"] = True
        self._installed[plugin_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
        logger.info("Enabled plugin: %s", plugin_id)
        return self.get_plugin(plugin_id)

    def disable(self, plugin_id: str) -> Dict[str, Any]:
        """Disable an installed plugin."""
        if plugin_id not in self._installed:
            return {"error": f"Plugin '{plugin_id}' is not installed"}
        self._installed[plugin_id]["enabled"] = False
        self._installed[plugin_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
        logger.info("Disabled plugin: %s", plugin_id)
        return self.get_plugin(plugin_id)

    # ─── Configuration ──────────────────────────────────────────

    def update_config(self, plugin_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Update plugin configuration."""
        if plugin_id not in self._installed:
            return {"error": f"Plugin '{plugin_id}' is not installed"}

        plugin = self._plugins.get(plugin_id, {})
        schema = plugin.get("config_schema", {})

        # Validate config keys against schema
        validated = {}
        for key, value in config.items():
            if key in schema:
                validated[key] = value
            else:
                logger.warning("Ignoring unknown config key '%s' for plugin '%s'", key, plugin_id)

        self._installed[plugin_id]["config"].update(validated)
        self._installed[plugin_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
        logger.info("Updated config for plugin: %s", plugin_id)
        return self.get_plugin(plugin_id)

    # ─── Queries ─────────────────────────────────────────────────

    def get_plugin(self, plugin_id: str) -> Optional[Dict[str, Any]]:
        """Get full details of an installed plugin."""
        if plugin_id not in self._installed:
            return None
        plugin = self._plugins.get(plugin_id, {})
        installed = self._installed[plugin_id]
        return {**plugin, **installed}

    def get_plugin_for_api(self, plugin_id: str) -> Optional[Dict[str, Any]]:
        """Get plugin details formatted for API response."""
        plugin = self.get_plugin(plugin_id)
        if not plugin:
            return None
        return plugin

    def is_enabled(self, plugin_id: str) -> bool:
        """Check if a plugin is installed and enabled."""
        return plugin_id in self._installed and self._installed[plugin_id].get("enabled", False)

    def get_capabilities(self) -> List[str]:
        """Get all capabilities from enabled plugins."""
        caps = []
        for pid, info in self._installed.items():
            if info.get("enabled"):
                plugin = self._plugins.get(pid, {})
                caps.extend(plugin.get("capabilities", []))
        return caps


# Singleton instance
plugin_manager = PluginManager()
