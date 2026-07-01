#!/bin/bash
# =============================================================================
# Promote Replica to Primary
# Use this when the primary (prod-db) fails and you need to promote the replica
# WARNING: After promotion, streaming replication will stop
# =============================================================================

set -e

echo "=========================================="
echo "Promote Replica to Primary"
echo "=========================================="
echo ""
echo "WARNING: This will promote replica-db to primary."
echo "Streaming replication will stop after promotion."
echo ""

# Check if primary is actually down
echo "Checking primary status..."
if docker exec prod-db pg_isready -U temporal 2>/dev/null; then
    echo "WARNING: Primary appears to be running!"
    read -p "Are you sure you want to promote the replica? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 0
    fi
fi

echo "Promoting replica to primary..."
docker exec replica-db psql -U replicator -d hermes -c "SELECT pg_promote();"

sleep 3

echo ""
echo "--- Replica Status After Promotion ---"
docker exec replica-db psql -U replicator -d hermes -c "SELECT pg_is_in_recovery() AS is_replica;"

echo ""
echo "=========================================="
echo "Replica promoted to primary!"
echo ""
echo "IMPORTANT NEXT STEPS:"
echo "  1. Update application connection strings to point to replica-db (port 5434)"
echo "  2. The old primary (prod-db) should be rebuilt as a new replica"
echo "  3. Run setup-replication.sh to re-establish replication with new primary"
echo "=========================================="
