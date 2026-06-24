"""Unit tests for ConnectionPool."""
import pytest
import time
import sqlite3
from app.infrastructure.db_pool import ConnectionPool, PooledConnection, PoolStats, get_pool, close_all_pools


class TestPoolStats:
    """Test pool statistics."""

    def test_initial_stats(self):
        stats = PoolStats()
        assert stats.connections_created == 0
        assert stats.connections_recycled == 0
        assert stats.connections_acquired == 0
        assert stats.connections_released == 0
        assert stats.health_check_failures == 0
        assert stats.pool_misses == 0

    def test_to_dict(self):
        stats = PoolStats()
        d = stats.to_dict()
        assert isinstance(d, dict)
        assert "connections_created" in d


class TestPooledConnection:
    """Test PooledConnection wrapper."""

    def test_initial_state(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        conn = sqlite3.connect(db_path)
        pc = PooledConnection(conn, db_path)
        assert pc.in_use is False
        assert pc.is_healthy()
        pc.close()

    def test_is_expired_fresh(self, tmp_path):
        """Fresh connection should not be expired with reasonable max_age."""
        db_path = str(tmp_path / "test.db")
        conn = sqlite3.connect(db_path)
        pc = PooledConnection(conn, db_path)
        assert not pc.is_expired(10.0)
        pc.close()

    def test_is_expired_after_max_age(self, tmp_path):
        """Connection older than max_age should be expired."""
        db_path = str(tmp_path / "test.db")
        conn = sqlite3.connect(db_path)
        pc = PooledConnection(conn, db_path)
        # Manually set created_at to past
        pc.created_at = time.monotonic() - 100
        assert pc.is_expired(50.0)
        pc.close()

    def test_is_healthy(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        conn = sqlite3.connect(db_path)
        pc = PooledConnection(conn, db_path)
        assert pc.is_healthy()
        pc.close()

    def test_touch(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        conn = sqlite3.connect(db_path)
        pc = PooledConnection(conn, db_path)
        old = pc.last_used
        time.sleep(0.01)
        pc.touch()
        assert pc.last_used >= old
        pc.close()


class TestConnectionPool:
    """Test ConnectionPool operations."""

    def test_create_pool(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path, pool_size=3)
        assert pool.pool_size == 3
        pool.close()

    def test_connection_context_manager(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path)
        with pool.connection() as conn:
            result = conn.execute("SELECT 1").fetchone()
            assert result[0] == 1
        pool.close()

    def test_connection_returns_sqlite_connection(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path)
        with pool.connection() as conn:
            assert isinstance(conn, sqlite3.Connection)
        pool.close()

    def test_multiple_connections(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path, pool_size=3)
        with pool.connection() as conn1:
            conn1.execute("CREATE TABLE IF NOT EXISTS test (id INTEGER)")
            conn1.commit()
        with pool.connection() as conn2:
            conn2.execute("INSERT INTO test VALUES (1)")
            conn2.commit()
        with pool.connection() as conn3:
            result = conn3.execute("SELECT COUNT(*) FROM test").fetchone()
            assert result[0] == 1
        pool.close()

    def test_wal_mode_enabled(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path, wal_mode=True)
        with pool.connection() as conn:
            mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            assert mode == "wal"
        pool.close()

    def test_wal_mode_disabled(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path, wal_mode=False)
        with pool.connection() as conn:
            mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            assert mode != "wal" or mode == "delete"
        pool.close()

    def test_get_stats(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path)
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        stats = pool.get_stats()
        assert "pool_size" in stats
        assert "connections_acquired" in stats
        assert "connections_released" in stats
        assert stats["connections_acquired"] >= 1
        pool.close()

    def test_close_pool(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path)
        pool.close()
        with pytest.raises(RuntimeError, match="closed"):
            with pool.connection():
                pass

    def test_max_age_recycling(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path, max_age=0.001)
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        # Return connection to pool, then wait for it to expire
        time.sleep(0.05)
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        stats = pool.get_stats()
        assert stats["connections_recycled"] >= 1
        pool.close()

    def test_row_factory_set(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = ConnectionPool(db_path=db_path)
        with pool.connection() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS test_row (name TEXT)")
            conn.execute("INSERT INTO test_row VALUES ('hello')")
            conn.commit()
            row = conn.execute("SELECT * FROM test_row").fetchone()
            assert row["name"] == "hello"
        pool.close()


class TestGetPool:
    """Test get_pool singleton factory."""

    def test_get_pool_returns_same_instance(self, tmp_path):
        db_path = str(tmp_path / "singleton.db")
        p1 = get_pool(db_path)
        p2 = get_pool(db_path)
        assert p1 is p2
        close_all_pools()

    def test_get_pool_different_paths(self, tmp_path):
        p1 = get_pool(str(tmp_path / "db1.db"))
        p2 = get_pool(str(tmp_path / "db2.db"))
        assert p1 is not p2
        close_all_pools()

    def test_close_all_pools(self, tmp_path):
        get_pool(str(tmp_path / "db1.db"))
        get_pool(str(tmp_path / "db2.db"))
        close_all_pools()
        from app.infrastructure.db_pool import _pools
        assert len(_pools) == 0
