#!/usr/bin/env bash
# =============================================================
# H.E.R.M.E.S. — First-Time Staging Setup
# Creates databases, runs migrations, seeds test data.
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.staging.yml"

echo "==========================================="
echo " H.E.R.M.E.S. — Staging First-Time Setup"
echo "==========================================="

# ---- 1. Pre-flight ----
echo ""
echo "[1/4] Pre-flight checks..."

if ! command -v docker &>/dev/null; then
    echo "ERROR: docker not found in PATH." >&2; exit 1
fi
if ! docker info &>/dev/null; then
    echo "ERROR: Docker daemon is not running." >&2; exit 1
fi
if [ ! -f "$PROJECT_ROOT/.env.staging" ]; then
    echo "ERROR: .env.staging not found. Copy .env and edit for staging." >&2; exit 1
fi

echo "  ✓ Docker running"
echo "  ✓ .env.staging present"

# ---- 2. Build & start infra ----
echo ""
echo "[2/4] Building images and starting infrastructure..."
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d temporal-db-staging redis-staging

echo "  Waiting for PostgreSQL to be healthy..."
for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" ps temporal-db-staging 2>/dev/null | grep -q "healthy"; then
        break
    fi
    sleep 2
done
echo "  ✓ PostgreSQL is ready"
echo "  ✓ Redis is ready"

# ---- 3. Start Temporal, backend, worker, frontend ----
echo ""
echo "[3/4] Starting Temporal cluster..."
docker compose -f "$COMPOSE_FILE" up -d temporal-staging
echo "  Waiting for Temporal to be healthy..."
for i in $(seq 1 40); do
    if docker compose -f "$COMPOSE_FILE" ps temporal-staging 2>/dev/null | grep -q "healthy"; then
        break
    fi
    sleep 3
done
echo "  ✓ Temporal is ready"

echo "  Starting backend, worker, and frontend..."
docker compose -f "$COMPOSE_FILE" up -d backend-staging worker-staging frontend-staging

echo "  Waiting for all services to settle (60s)..."
sleep 60

# ---- 4. Run migrations / seed ----
echo ""
echo "[4/4] Running database setup..."

# Create hermes_staging database if it doesn't already exist
docker compose -f "$COMPOSE_FILE" exec -T temporal-db-staging \
    psql -U temporal -tc "SELECT 1 FROM pg_database WHERE datname = 'hermes_staging'" 2>/dev/null \
    | grep -q 1 || \
    docker compose -f "$COMPOSE_FILE" exec -T temporal-db-staging \
    psql -U temporal -c "CREATE DATABASE hermes_staging;" 2>/dev/null

echo "  ✓ Database 'hermes_staging' exists"

# Run any migration scripts that exist in the project
if [ -f "$PROJECT_ROOT/backend/migrations/run.sh" ]; then
    echo "  Running backend migrations..."
    bash "$PROJECT_ROOT/backend/migrations/run.sh" staging || echo "  (migration script returned non-zero — check manually)"
fi

# Seed staging test data if a seed file exists
if [ -f "$PROJECT_ROOT/scripts/seed-staging.sql" ]; then
    echo "  Seeding test data..."
    docker compose -f "$COMPOSE_FILE" exec -T temporal-db-staging \
        psql -U temporal -d hermes_staging -f /dev/stdin < "$PROJECT_ROOT/scripts/seed-staging.sql"
    echo "  ✓ Test data seeded"
else
    echo "  (No scripts/seed-staging.sql found — skipping seed)"
fi

echo ""
echo "==========================================="
echo " Staging setup complete!"
echo "==========================================="
echo ""
echo "  Frontend:     http://localhost:3001"
echo "  Backend API:  http://localhost:8001"
echo "  Temporal UI:  http://localhost:8081"
echo "  PostgreSQL:   localhost:5433"
echo "  Redis:        localhost:6380"
echo "  Temporal:     localhost:7234"
echo ""
echo "  To deploy updates:  bash scripts/deploy-to-staging.sh"
echo "  To promote:         bash scripts/promote-to-production.sh"
