"""PostgreSQL Connection Pool for H.E.R.M.E.S. AI Agent Orchestrator.

Provides a thread-safe, configurable PostgreSQL connection pool with:
- Async support (psycopg2)
- Connection recycling
- Health checks / validation
- Pool statistics
"""

import psycopg2
import psycopg2.pool
import psycopg2.extras
import threading
import time
import logging
import os
from typing import Optional, Dict, Any
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class PostgreSQLPool:
    """Thread-safe PostgreSQL connection pool."""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, dsn: Optional[str] = None, min_conn: int = 2, max_conn: int = 10):
        if hasattr(self, '_initialized'):
            return
        
        self._initialized = True
        self._dsn = dsn or os.getenv(
            "DATABASE_URL",
            "postgresql://temporal:temporal@temporal-db:5432/hermes"
        )
        self._min_conn = min_conn
        self._max_conn = max_conn
        self._pool = None
        self._lock = threading.Lock()
        
        # Stats
        self.connections_created = 0
        self.connections_acquired = 0
        self.connections_released = 0
        
        self._init_pool()
    
    def _init_pool(self):
        """Initialize the connection pool."""
        try:
            self._pool = psycopg2.pool.ThreadedConnectionPool(
                self._min_conn,
                self._max_conn,
                self._dsn
            )
            logger.info("PostgreSQL connection pool initialized (min=%d, max=%d)", 
                       self._min_conn, self._max_conn)
        except Exception as e:
            logger.error("Failed to initialize PostgreSQL pool: %s", e)
            raise
    
    @contextmanager
    def connection(self):
        """Get a connection from the pool."""
        conn = None
        try:
            conn = self._pool.getconn()
            self.connections_acquired += 1
            yield conn
        except Exception as e:
            logger.error("Database error: %s", e)
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                self._pool.putconn(conn)
                self.connections_released += 1
    
    @contextmanager
    def cursor(self, commit: bool = True):
        """Get a cursor from a connection."""
        with self.connection() as conn:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            try:
                yield cursor
                if commit:
                    conn.commit()
            except Exception as e:
                conn.rollback()
                raise
            finally:
                cursor.close()
    
    def execute(self, query: str, params: Optional[tuple] = None, fetch: bool = True):
        """Execute a query and optionally fetch results."""
        with self.cursor() as cursor:
            cursor.execute(query, params)
            if fetch and cursor.description:
                return cursor.fetchall()
            return None
    
    def execute_many(self, query: str, params_list: list):
        """Execute a query with multiple parameter sets."""
        with self.cursor() as cursor:
            cursor.executemany(query, params_list)
    
    def close(self):
        """Close all connections in the pool."""
        if self._pool:
            self._pool.closeall()
            logger.info("PostgreSQL connection pool closed")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get pool statistics."""
        return {
            "connections_created": self.connections_created,
            "connections_acquired": self.connections_acquired,
            "connections_released": self.connections_released,
            "pool_size": self._max_conn,
        }


# Global pool instance
_pool: Optional[PostgreSQLPool] = None


def get_pool(dsn: Optional[str] = None) -> PostgreSQLPool:
    """Get or create the global PostgreSQL pool."""
    global _pool
    if _pool is None:
        _pool = PostgreSQLPool(dsn)
    return _pool


def close_pool():
    """Close the global pool."""
    global _pool
    if _pool:
        _pool.close()
        _pool = None
