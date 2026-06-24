"""
Redis Cache Service for H.E.R.M.E.S. AI Agent Orchestrator.

Provides a cache-aside pattern with TTL support, JSON serialization,
and pattern-based invalidation. Gracefully degrades when Redis is unavailable.
"""

import json
import logging
import os
from typing import Any, Optional

import redis.asyncio as aioredis

logger = logging.getLogger("hermes.cache")

# Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
DEFAULT_TTL = 30  # seconds


class CacheService:
    """Async Redis cache with graceful degradation."""

    def __init__(self):
        self._client: Optional[aioredis.Redis] = None
        self._available = False

    async def connect(self):
        """Connect to Redis. Non-fatal if unavailable."""
        try:
            self._client = aioredis.from_url(
                REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=3,
            )
            await self._client.ping()
            self._available = True
            logger.info("Redis cache connected: %s", REDIS_URL)
        except Exception as e:
            self._available = False
            logger.warning("Redis unavailable, caching disabled: %s", e)

    async def disconnect(self):
        """Close Redis connection."""
        if self._client:
            await self._client.close()
            self._available = False

    @property
    def available(self) -> bool:
        return self._available

    # Core Operations

    async def get(self, key: str) -> Optional[Any]:
        """Get a cached value. Returns None on miss or if Redis is down."""
        if not self._available or not self._client:
            return None
        try:
            raw = await self._client.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as e:
            logger.debug("Cache get error for %s: %s", key, e)
            return None

    async def set(self, key: str, value: Any, ttl: int = DEFAULT_TTL) -> bool:
        """Set a cached value with TTL. Returns True on success."""
        if not self._available or not self._client:
            return False
        try:
            serialized = json.dumps(value, default=str)
            await self._client.set(key, serialized, ex=ttl)
            return True
        except Exception as e:
            logger.debug("Cache set error for %s: %s", key, e)
            return False

    async def delete(self, key: str) -> bool:
        """Delete a cached key."""
        if not self._available or not self._client:
            return False
        try:
            await self._client.delete(key)
            return True
        except Exception as e:
            logger.debug("Cache delete error for %s: %s", key, e)
            return False

    async def exists(self, key: str) -> bool:
        """Check if a key exists in cache."""
        if not self._available or not self._client:
            return False
        try:
            return bool(await self._client.exists(key))
        except Exception:
            return False

    # Pattern Invalidation

    async def invalidate_pattern(self, pattern: str) -> int:
        """Delete all keys matching a glob pattern. Returns count deleted."""
        if not self._available or not self._client:
            return 0
        try:
            deleted = 0
            async for key in self._client.scan_iter(match=pattern, count=100):
                await self._client.delete(key)
                deleted += 1
            if deleted:
                logger.info("Cache invalidated %d keys matching '%s'", deleted, pattern)
            return deleted
        except Exception as e:
            logger.debug("Cache invalidate_pattern error: %s", e)
            return 0

    async def invalidate_agents(self):
        """Invalidate all agent-related cache entries."""
        await self.invalidate_pattern("agents:*")

    async def invalidate_tasks(self):
        """Invalidate all task-related cache entries."""
        await self.invalidate_pattern("tasks:*")

    async def invalidate_metrics(self):
        """Invalidate all metrics-related cache entries."""
        await self.invalidate_pattern("metrics:*")

    async def invalidate_all(self):
        """Invalidate all application cache entries."""
        for pattern in ("agents:*", "tasks:*", "metrics:*"):
            await self.invalidate_pattern(pattern)

    # Stats

    async def info(self) -> dict:
        """Return basic Redis info for health/status reporting."""
        if not self._available or not self._client:
            return {"available": False}
        try:
            info = await self._client.info("stats")
            mem_info = await self._client.info("memory")
            return {
                "available": True,
                "hits": info.get("keyspace_hits", 0),
                "misses": info.get("keyspace_misses", 0),
                "connected_clients": info.get("connected_clients", 0),
                "used_memory_human": mem_info.get("used_memory_human", "N/A"),
            }
        except Exception:
            return {"available": True, "hits": 0, "misses": 0}


# Singleton instance
cache = CacheService()
