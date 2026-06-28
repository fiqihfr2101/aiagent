#!/usr/bin/env bash
# =============================================================
# H.E.R.M.E.S. — Deploy to Staging
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.staging.yml"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$PROJECT_ROOT/scripts/logs/staging-deploy-${TIMESTAMP}.log"

mkdir -p "$(dirname "$LOG_FILE")"

echo "==========================================="
echo " H.E.R.M.E.S. Deploy to Staging"
echo " $(date)"
echo "==========================================="

# ---- 1. Pre-flight ----
echo ""
echo "[1/6] Pre-flight checks..."

if ! docker info &>/dev/null; then
    echo "ERROR: Docker daemon is not running." >&2
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "ERROR: docker-compose.staging.yml not found at $COMPOSE_FILE" >&2
    exit 1
fi

if [ ! -f "$PROJECT_ROOT/.env.staging" ]; then
    echo "ERROR: .env.staging not found." >&2
    exit 1
fi

echo "  ✓ All pre-flight checks passed"

# ---- 2. Build images ----
echo ""
echo "[2/6] Building staging images..."
docker compose -f "$COMPOSE_FILE" build 2>&1 | tee -a "$LOG_FILE"
echo "  ✓ Build complete"

# ---- 3. Stop current staging (if running) ----
echo ""
echo "[3/6] Stopping current staging containers..."
docker compose -f "$COMPOSE_FILE" down --timeout 30 2>&1 | tee -a "$LOG_FILE"
echo "  ✓ Old containers stopped"

# ---- 4. Start staging environment ----
echo ""
echo "[4/6] Starting staging environment..."
docker compose -f "$COMPOSE_FILE" up -d 2>&1 | tee -a "$LOG_FILE"
echo "  ✓ Staging containers started"

# ---- 5. Health checks ----
echo ""
echo "[5/6] Running health checks..."
echo "  Waiting for services to become healthy..."

check_health() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "$url" &>/dev/null; then
            echo "  ✓ $service is healthy ($url)"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 3
    done
    echo "  ✗ $service failed health check ($url)" | tee -a "$LOG_FILE"
    return 1
}

HEALTH_OK=true
check_health "Backend"  "http://localhost:8001/health" || HEALTH_OK=false
check_health "Frontend" "http://localhost:3001"        || HEALTH_OK=false

# Check Postgres
echo -n "  Checking PostgreSQL... "
if docker compose -f "$COMPOSE_FILE" exec -T temporal-db-staging pg_isready -U temporal -d hermes_staging &>/dev/null; then
    echo "✓ PostgreSQL is ready"
else
    echo "✗ PostgreSQL is not ready" | tee -a "$LOG_FILE"
    HEALTH_OK=false
fi

# Check Redis
echo -n "  Checking Redis... "
if docker compose -f "$COMPOSE_FILE" exec -T redis-staging redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✓ Redis is ready"
else
    echo "✗ Redis is not ready" | tee -a "$LOG_FILE"
    HEALTH_OK=false
fi

# Check Temporal
echo -n "  Checking Temporal... "
if docker compose -f "$COMPOSE_FILE" ps temporal-staging 2>/dev/null | grep -q "healthy\|Up"; then
    echo "✓ Temporal is running"
else
    echo "✗ Temporal is not running" | tee -a "$LOG_FILE"
    HEALTH_OK=false
fi

# ---- 6. Report ----
echo ""
echo "[6/6] Deployment summary"
echo "==========================================="

if [ "$HEALTH_OK" = true ]; then
    echo "  Status:  ✓ ALL HEALTH CHECKS PASSED"
else
    echo "  Status:  ✗ SOME HEALTH CHECKS FAILED"
    echo "  Check logs: $LOG_FILE"
fi

echo ""
echo "  Staging URLs:"
echo "    Frontend:     http://localhost:3001"
echo "    Backend API:  http://localhost:8001"
echo "    Temporal UI:  http://localhost:8081"
echo "    PostgreSQL:   localhost:5433"
echo "    Redis:        localhost:6380"
echo ""
echo "  Container status:"
docker compose -f "$COMPOSE_FILE" ps 2>/dev/null | tail -n +2 | while read -r line; do
    echo "    $line"
done
echo ""
echo "  Log file: $LOG_FILE"
echo "==========================================="

if [ "$HEALTH_OK" = false ]; then
    exit 1
fi
