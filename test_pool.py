"""Quick smoke test for the connection pool."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import tempfile
from backend.app.infrastructure.db_pool import get_pool, close_all_pools

def test_pool_creation():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        pool = get_pool(db_path, pool_size=3)
        stats = pool.get_stats()
        assert stats["pool_size"] == 3
        assert stats["idle_connections"] == 0
        print("✓ Pool creation OK")
    finally:
        close_all_pools()
        os.unlink(db_path)

def test_connection_reuse():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        pool = get_pool(db_path, pool_size=3)

        # Acquire and release
        with pool.connection() as conn:
            conn.execute("CREATE TABLE t (id INTEGER)")
            conn.commit()

        stats = pool.get_stats()
        assert stats["connections_created"] == 1
        assert stats["idle_connections"] == 1  # connection returned to pool
        print("✓ Connection reuse OK")

        # Reuse same connection
        with pool.connection() as conn:
            rows = conn.execute("SELECT * FROM t").fetchall()

        stats = pool.get_stats()
        assert stats["connections_created"] == 1  # no new connection created
        assert stats["pool_misses"] == 1  # first acquire was a miss (empty pool)
        print("✓ Pool miss=0 (reused) OK")
    finally:
        close_all_pools()
        os.unlink(db_path)

def test_wal_mode():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        pool = get_pool(db_path, wal_mode=True)
        with pool.connection() as conn:
            mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
            assert mode == "wal", f"Expected wal, got {mode}"
        print("✓ WAL mode OK")
    finally:
        close_all_pools()
        os.unlink(db_path)

def test_pool_stats():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        pool = get_pool(db_path, pool_size=2)
        for _ in range(5):
            with pool.connection() as conn:
                conn.execute("SELECT 1")
        stats = pool.get_stats()
        assert stats["connections_acquired"] == 5
        assert stats["connections_released"] == 5
        assert stats["connections_created"] == 1  # only 1 needed since reused
        print("✓ Pool stats OK")
    finally:
        close_all_pools()
        os.unlink(db_path)

if __name__ == "__main__":
    test_pool_creation()
    test_connection_reuse()
    test_wal_mode()
    test_pool_stats()
    print("\n✅ All pool tests passed!")
