#!/bin/bash
# =============================================================================
# Verify PostgreSQL Streaming Replication
# Checks replication health and tests data sync
# =============================================================================

set -e

echo "=========================================="
echo "PostgreSQL Replication Verification"
echo "=========================================="
echo ""

# Check primary status
echo "--- [1] Primary Database Status ---"
docker exec prod-db psql -U temporal -d hermes -c "SELECT pg_is_in_recovery() AS is_replica, current_database() AS database, version();" 2>/dev/null || echo "ERROR: Cannot connect to primary"
echo ""

# Check WAL settings
echo "--- [2] WAL Configuration ---"
docker exec prod-db psql -U temporal -d hermes -c "
SELECT name, setting FROM pg_settings
WHERE name IN ('wal_level', 'max_wal_senders', 'max_replication_slots')
ORDER BY name;
" 2>/dev/null
echo ""

# Check replication slots
echo "--- [3] Replication Slots ---"
docker exec prod-db psql -U temporal -d hermes -c "
SELECT slot_name, slot_type, active, restart_lsn, confirmed_flush_lsn
FROM pg_replication_slots;
" 2>/dev/null
echo ""

# Check replication connections
echo "--- [4] Active Replication Connections ---"
docker exec prod-db psql -U temporal -d hermes -c "
SELECT pid, usename, client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn, sync_state
FROM pg_stat_replication;
" 2>/dev/null || echo "  No active replication connections"
echo ""

# Check replica status
echo "--- [5] Replica Database Status ---"
docker exec replica-db psql -U replicator -d hermes -c "SELECT pg_is_in_recovery() AS is_replica, current_database() AS database;" 2>/dev/null || echo "ERROR: Cannot connect to replica"
echo ""

# Check WAL receiver
echo "--- [6] WAL Receiver Status ---"
docker exec replica-db psql -U replicator -d hermes -c "
SELECT status, received_lsn, latest_end_lsn, last_msg_send_time, last_msg_receipt_time
FROM pg_stat_wal_receiver;
" 2>/dev/null || echo "  WAL receiver not active"
echo ""

# Test data sync
echo "--- [7] Testing Data Sync ---"
echo "  Inserting test row on primary..."
docker exec prod-db psql -U temporal -d hermes -c "
INSERT INTO agents (id, name, role, status, created_at, updated_at)
VALUES ('__replication_test__', 'REPLICATION_TEST', 'test', 'active', NOW()::text, NOW()::text)
ON CONFLICT (id) DO UPDATE SET updated_at = NOW()::text;
" 2>/dev/null

echo "  Waiting 2 seconds for replication..."
sleep 2

echo "  Checking test row on replica..."
REPLICA_RESULT=$(docker exec replica-db psql -U replicator -d hermes -t -c "
SELECT COUNT(*) FROM agents WHERE id = '__replication_test__';
" 2>/dev/null | tr -d ' ')

if [ "$REPLICA_RESULT" = "1" ]; then
    echo "  ✅ Data sync verified! Replica has the test row."
else
    echo "  ❌ Data sync failed. Replica does not have the test row."
fi

# Cleanup test row
echo "  Cleaning up test row..."
docker exec prod-db psql -U temporal -d hermes -c "DELETE FROM agents WHERE id = '__replication_test__';" 2>/dev/null

echo ""
echo "--- [8] Table Counts Comparison ---"
echo "  Primary:"
docker exec prod-db psql -U temporal -d hermes -c "
SELECT 'agents' AS table_name, COUNT(*) AS count FROM agents
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL
SELECT 'messages', COUNT(*) FROM messages;
" 2>/dev/null

echo "  Replica:"
docker exec replica-db psql -U replicator -d hermes -c "
SELECT 'agents' AS table_name, COUNT(*) AS count FROM agents
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL
SELECT 'messages', COUNT(*) FROM messages;
" 2>/dev/null

echo ""
echo "--- [9] Read-Only Verification ---"
echo "  Attempting INSERT on replica (should fail)..."
docker exec replica-db psql -U replicator -d hermes -c "
INSERT INTO agents (id, name, role, status, created_at, updated_at)
VALUES ('readonly_test', 'TEST', 'test', 'active', NOW()::text, NOW()::text);
" 2>&1 && echo "  ❌ ERROR: Replica accepted write!" || echo "  ✅ Replica correctly rejected write (read-only)."

echo ""
echo "=========================================="
echo "Verification Complete"
echo "=========================================="
