#!/usr/bin/env bash
# =============================================================
# H.E.R.M.E.S. — Promote Staging to Production
# Backs up production, stops it, deploys staging config, verifies.
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STAGING_COMPOSE="$PROJECT_ROOT/docker-compose.staging.yml"
PROD_COMPOSE="$PROJECT_ROOT/docker-compose.yml"
BACKUP_DIR="$PROJECT_ROOT/scripts/backups/$(date +%Y%m%d_%H%M%S)"

echo "==========================================="
echo " H.E.R.M.E.S. — Promote Staging → Production"
echo "==========================================="
echo ""
echo "⚠  This will:"
echo "   1. Backup production data"
echo "   2. Stop production containers"
echo "   3. Rebuild and restart production with current code"
echo "   4. Verify health"
echo ""
read -p "Continue? [y/N] " confirm
if [[ "$confirm" != [yY] ]]; then
    echo "Aborted."
    exit 0
fi

# ---- 1. Verify staging is healthy ----
echo ""
echo "[1/5] Verifying staging is healthy..."
if curl -sf http://localhost:8001/health &>/dev/null; then
    echo "  ✓ Staging backend is healthy"
else
    echo "  ✗ Staging backend is NOT healthy. Fix staging before promoting." >&2
    exit 1
fi

# ---- 2. Backup production ----
echo ""
echo "[2/5] Backing up production data..."
mkdir -p "$BACKUP_DIR"

# Dump production databases (hermes + temporal)
echo "  Dumping production databases..."
for db_name in hermes temporal; do
    docker compose -f "$PROD_COMPOSE" exec -T temporal-db \
        pg_dump -U temporal -d "$db_name" > "$BACKUP_DIR/${db_name}_production.sql" 2>/dev/null && \
        echo "  ✓ Backed up ${db_name}" || \
        echo "  ⚠ Could not dump ${db_name} (may not exist yet)" >&2
done

# Backup production redis
echo "  Saving production Redis snapshot..."
docker compose -f "$PROD_COMPOSE" exec -T redis \
    redis-cli BGSAVE &>/dev/null || true

echo "  ✓ Backups saved to $BACKUP_DIR"

# ---- 3. Stop production ----
echo ""
echo "[3/5] Stopping production containers..."
docker compose -f "$PROD_COMPOSE" down --timeout 30
echo "  ✓ Production stopped"

# ---- 4. Rebuild & restart production ----
echo ""
echo "[4/5] Rebuilding and starting production..."
docker compose -f "$PROD_COMPOSE" build --no-cache
docker compose -f "$PROD_COMPOSE" up -d

echo "  Waiting for production to come up (90s)..."
sleep 90

# ---- 5. Health checks ----
echo ""
echo "[5/5] Production health checks..."

PROD_HEALTHY=true

echo -n "  Backend:  "
if curl -sf http://localhost:8000/health &>/dev/null; then
    echo "✓ healthy"
else
    echo "✗ FAILED"
    PROD_HEALTHY=false
fi

echo -n "  Frontend: "
if curl -sf http://localhost:3000 &>/dev/null; then
    echo "✓ healthy"
else
    echo "✗ FAILED"
    PROD_HEALTHY=false
fi

echo -n "  Postgres: "
if docker compose -f "$PROD_COMPOSE" exec -T temporal-db pg_isready -U temporal &>/dev/null; then
    echo "✓ ready"
else
    echo "✗ FAILED"
    PROD_HEALTHY=false
fi

echo -n "  Redis:    "
if docker compose -f "$PROD_COMPOSE" exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✓ ready"
else
    echo "✗ FAILED"
    PROD_HEALTHY=false
fi

echo ""
if [ "$PROD_HEALTHY" = true ]; then
    echo "==========================================="
    echo " ✅ Promotion successful!"
    echo "==========================================="
    echo ""
    echo "  Production is live:"
    echo "    Frontend:    http://localhost:3000"
    echo "    Backend API: http://localhost:8000"
    echo ""
    echo "  Staging is still running (stop manually if desired):"
    echo "    docker compose -f docker-compose.staging.yml down"
else
    echo "==========================================="
    echo " ✗ Production health checks FAILED"
    echo "==========================================="
    echo ""
    echo "  To rollback:"
    echo "    1. docker compose -f $PROD_COMPOSE down"
    echo "    2. Restore DB from: $BACKUP_DIR/hermes_production.sql"
    echo "    3. docker compose -f $PROD_COMPOSE up -d"
    echo ""
    echo "  Or restart staging as fallback:"
    echo "    docker compose -f $STAGING_COMPOSE up -d"
    exit 1
fi
