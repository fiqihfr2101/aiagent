"""Database Connection Pool for H.E.R.M.E.S. AI Agent Orchestrator.

Provides a thread-safe, configurable SQLite connection pool with:
- Async support (aiosqlite)
- Connection recycling (max age)
- Health checks / validation
- WAL mode for concurrent reads
- Pool statistics
"""

import sqlite3
import asyncio
import threading
import time
import logging
from typing import Optional, Dict, Any
from collections import deque
from contextlib import contextmanager, asynccontextmanager

try:
    import aiosqlite
    HAS_AIOSQLITE = True
except ImportError:
    HAS_AIOSQLITE = False

logger = logging.getLogger(__name__)


class PoolStats:
    """Tracks connection pool statistics."""

    __slots__ = (
        "connections_created",
        "connections_recycled",
        "connections_acquired",
        "connections_released",
        "health_check_failures",
        "pool_misses",
    )

    def __init__(self):
        self.connections_created = 0
        self.connections_recycled = 0
        self.connections_acquired = 0
        self.connections_released = 0
        self.health_check_failures = 0
        self.pool_misses = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "connections_created": self.connections_created,
            "connections_recycled": self.connections_recycled,
            "connections_acquired": self.connections_acquired,
            "connections_released": self.connections_released,
            "health_check_failures": self.health_check_failures,
            "pool_misses": self.pool_misses,
        }


class PooledConnection:
    """Wrapper around a sqlite3.Connection with lifecycle tracking."""

    __slots__ = ("conn", "created_at", "last_used", "in_use", "db_path")

    def __init__(self, conn: sqlite3.Connection, db_path: str):
        self.conn = conn
        self.created_at = time.monotonic()
        self.last_used = time.monotonic()
        self.in_use = False
        self.db_path = db_path

    def is_expired(self, max_age: float) -> bool:
        return (time.monotonic() - self.created_at) > max_age

    def is_healthy(self) -> bool:
        try:
            self.conn.execute("SELECT 1")
            return True
        except Exception:
            return False

    def touch(self):
        self.last_used = time.monotonic()

    def close(self):
        try:
            self.conn.close()
        except Exception:
            pass


class ConnectionPool:
    """Thread-safe SQLite connection pool.

    Args:
        db_path: Path to the SQLite database file.
        pool_size: Maximum number of connections in the pool (default 5).
        max_age: Maximum connection lifetime in seconds (default 3600).
        wal_mode: Enable WAL journal mode (default True).
    """

    def __init__(
        self,
        db_path: str = "hermes_agents.db",
        pool_size: int = 5,
        max_age: float = 3600.0,
        wal_mode: bool = True,
    ):
        self.db_path = db_path
        self.pool_size = pool_size
        self.max_age = max_age
        self.wal_mode = wal_mode
        self.stats = PoolStats()

        self._pool: deque[PooledConnection] = deque()
        self._lock = threading.Lock()
        self._closed = False

        # Pre-populate pool
        self._init_db()

    # ─── Internal ─────────────────────────────────────────────────

    def _create_raw_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        if self.wal_mode:
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _init_db(self):
        """Create table structure if needed (called once at startup)."""
        conn = self._create_raw_conn()
        try:
            # Enable WAL on the database itself
            if self.wal_mode:
                conn.execute("PRAGMA journal_mode=WAL")
            conn.commit()
        finally:
            conn.close()

    def _recycle(self, pc: PooledConnection) -> PooledConnection:
        """Close expired connection and create a fresh one."""
        pc.close()
        self.stats.connections_recycled += 1
        new_pc = PooledConnection(self._create_raw_conn(), self.db_path)
        self.stats.connections_created += 1
        return new_pc

    # ─── Sync API ─────────────────────────────────────────────────

    @contextmanager
    def connection(self):
        """Context manager that yields a sqlite3.Connection from the pool.

        Usage:
            with pool.connection() as conn:
                conn.execute("SELECT ...")
        """
        pc = self._acquire()
        try:
            yield pc.conn
        finally:
            self._release(pc)

    def _acquire(self) -> PooledConnection:
        if self._closed:
            raise RuntimeError("Connection pool is closed")

        with self._lock:
            self.stats.connections_acquired += 1

            # Try to grab an idle connection
            while self._pool:
                pc = self._pool.popleft()
                if pc.is_expired(self.max_age):
                    # Recycle expired connection
                    try:
                        pc = self._recycle(pc)
                    except Exception:
                        self.stats.health_check_failures += 1
                        continue
                if not pc.is_healthy():
                    self.stats.health_check_failures += 1
                    pc.close()
                    continue
                pc.in_use = True
                pc.touch()
                return pc

            # Pool empty – create new connection
            self.stats.pool_misses += 1
            pc = PooledConnection(self._create_raw_conn(), self.db_path)
            self.stats.connections_created += 1
            pc.in_use = True
            return pc

    def _release(self, pc: PooledConnection):
        if self._closed:
            pc.close()
            return

        with self._lock:
            self.stats.connections_released += 1
            pc.in_use = False
            pc.touch()

            if pc.is_expired(self.max_age):
                pc.close()
                self.stats.connections_recycled += 1
            elif len(self._pool) < self.pool_size:
                self._pool.append(pc)
            else:
                pc.close()

    # ─── Async API ────────────────────────────────────────────────

    @asynccontextmanager
    async def aconnection(self):
        """Async context manager yielding an aiosqlite.Connection.

        Usage:
            async with pool.aconnection() as conn:
                await conn.execute("SELECT ...")
        """
        if not HAS_AIOSQLITE:
            raise RuntimeError("aiosqlite is not installed. Run: pip install aiosqlite")

        conn = await aiosqlite.connect(self.db_path)
        conn.row_factory = aiosqlite.Row
        if self.wal_mode:
            await conn.execute("PRAGMA journal_mode=WAL")
        await conn.execute("PRAGMA foreign_keys=ON")
        await conn.execute("PRAGMA busy_timeout=5000")
        self.stats.connections_acquired += 1
        self.stats.connections_created += 1
        try:
            yield conn
        finally:
            self.stats.connections_released += 1
            await conn.close()

    # ─── Stats / Lifecycle ────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            idle = len(self._pool)
        return {
            **self.stats.to_dict(),
            "pool_size": self.pool_size,
            "idle_connections": idle,
            "db_path": self.db_path,
            "wal_mode": self.wal_mode,
            "max_age": self.max_age,
        }

    def close(self):
        """Close all connections in the pool."""
        with self._lock:
            self._closed = True
            while self._pool:
                pc = self._pool.popleft()
                pc.close()
        logger.info("Connection pool closed for %s", self.db_path)


# ─── Module-level singleton pools ─────────────────────────────────

_pools: Dict[str, ConnectionPool] = {}
_pools_lock = threading.Lock()


def get_pool(
    db_path: str = "hermes_agents.db",
    pool_size: int = 5,
    max_age: float = 3600.0,
    wal_mode: bool = True,
) -> ConnectionPool:
    """Get or create a connection pool for the given database path.

    This is the main entry point – returns a singleton pool per db_path.
    """
    with _pools_lock:
        if db_path not in _pools:
            _pools[db_path] = ConnectionPool(
                db_path=db_path,
                pool_size=pool_size,
                max_age=max_age,
                wal_mode=wal_mode,
            )
            logger.info("Created connection pool for %s (size=%d)", db_path, pool_size)
        return _pools[db_path]


def close_all_pools():
    """Close all connection pools (call on shutdown)."""
    with _pools_lock:
        for pool in _pools.values():
            pool.close()
        _pools.clear()
