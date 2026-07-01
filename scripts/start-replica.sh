#!/bin/bash
# PostgreSQL Replica Startup Script
# Performs pg_basebackup from primary and starts as read-only replica

set -e

echo "Starting PostgreSQL replica setup..."

# Wait for primary to be ready
echo "Waiting for primary database (prod-db:5432)..."
until pg_isready -h prod-db -p 5432 -U replicator 2>/dev/null; do
    echo "  Primary not ready, waiting..."
    sleep 2
done
echo "Primary is ready!"

# Clear data directory (Docker entrypoint may have initialized it)
echo "Clearing data directory to prepare for base backup..."
rm -rf /var/lib/postgresql/data/*

# Perform base backup from primary
echo "Running pg_basebackup..."
until pg_basebackup \
    --pgdata=/var/lib/postgresql/data \
    -R \
    --slot=replication_slot \
    --host=prod-db \
    --port=5432 \
    --username=replicator \
    --checkpoint=fast \
    --wal-method=stream \
    --progress
do
    echo "pg_basebackup failed, retrying in 2 seconds..."
    sleep 2
done

echo "Base backup complete!"

# Ensure correct permissions
chown -R postgres:postgres /var/lib/postgresql/data
chmod 0700 /var/lib/postgresql/data

# Start PostgreSQL in standby mode as the postgres user
echo "Starting PostgreSQL replica..."
exec gosu postgres postgres
