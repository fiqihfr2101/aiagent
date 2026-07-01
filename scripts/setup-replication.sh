#!/bin/bash
# =============================================================================
# PostgreSQL Streaming Replication Setup
# Sets up real-time streaming replication from prod-db (primary) to replica-db
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=========================================="
echo "PostgreSQL Streaming Replication Setup"
echo "=========================================="
echo ""

# Step 1: Ensure primary is running with replication settings
echo "[1/6] Restarting primary database with replication settings..."
docker compose down temporal-db replica-db 2>/dev/null || true
docker compose up -d temporal-db

echo "[2/6] Waiting for primary to be ready..."
until docker exec prod-db pg_isready -U temporal -d temporal 2>/dev/null; do
    echo "  Waiting for primary..."
    sleep 2
done
echo "  Primary is ready!"

# Step 3: Create replication user
echo "[3/6] Creating replication user..."
docker exec prod-db psql -U temporal -d temporal -c "
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') THEN
        CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';
        RAISE NOTICE 'User replicator created';
    ELSE
        RAISE NOTICE 'User replicator already exists';
    END IF;
END \$\$;
"

# Grant access to hermes database
docker exec prod-db psql -U temporal -d hermes -c "
GRANT CONNECT ON DATABASE hermes TO replicator;
GRANT USAGE ON SCHEMA public TO replicator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replicator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO replicator;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO replicator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO replicator;
"

# Step 4: Create replication slot
echo "[4/6] Creating replication slot..."
docker exec prod-db psql -U temporal -d hermes -c "
SELECT pg_create_physical_replication_slot('replication_slot');
" 2>/dev/null || echo "  Replication slot already exists (OK)"

# Step 5: Verify WAL settings
echo "[5/6] Verifying WAL settings..."
docker exec prod-db psql -U temporal -d hermes -c "
SELECT name, setting FROM pg_settings
WHERE name IN ('wal_level', 'max_wal_senders', 'max_replication_slots', 'hot_standby')
ORDER BY name;
"

# Step 6: Start replica
echo "[6/6] Starting replica database..."
docker compose up -d replica-db

echo ""
echo "=========================================="
echo "Replication setup initiated!"
echo "=========================================="
echo ""
echo "Waiting for replica to initialize (this may take a moment)..."
sleep 10

# Verify replication status
echo ""
echo "--- Replication Status (Primary) ---"
docker exec prod-db psql -U temporal -d hermes -c "SELECT * FROM pg_stat_replication;" 2>/dev/null || echo "  No active replication connections yet (replica may still be initializing)"
echo ""

echo "--- Replica WAL Receiver Status ---"
docker exec replica-db psql -U replicator -d hermes -c "SELECT status, received_lsn, latest_end_lsn FROM pg_stat_wal_receiver;" 2>/dev/null || echo "  Replica WAL receiver not ready yet"
echo ""

echo "=========================================="
echo "Connection Info:"
echo "  Primary:  localhost:5432 (read-write)"
echo "  Replica:  localhost:5434 (read-only)"
echo "=========================================="
echo ""
echo "Test replication with:"
echo "  docker exec prod-db psql -U temporal -d hermes -c \"SELECT 1;\""
echo "  docker exec replica-db psql -U replicator -d hermes -c \"SELECT 1;\""
