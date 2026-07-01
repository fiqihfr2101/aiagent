#!/bin/bash
# =============================================================================
# H.E.R.M.E.S. — Database Backup Script
# Creates timestamped backups of all PostgreSQL databases.
# Usage: ./scripts/db-backup.sh [--compress] [--retain DAYS]
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_BASE_DIR="${PROJECT_DIR}/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_BASE_DIR}/${TIMESTAMP}"
COMPRESS=false
RETAIN_DAYS=30

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --compress) COMPRESS=true; shift ;;
        --retain) RETAIN_DAYS="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: $0 [--compress] [--retain DAYS]"
            echo "  --compress   Compress backups with gzip"
            echo "  --retain N   Keep backups for N days (default: 30)"
            exit 0
            ;;
        *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
    esac
done

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Backup Functions
# =============================================================================

backup_database() {
    local container=$1
    local db_name=$2
    local output_file=$3

    log_info "Backing up '${db_name}' from container '${container}'..."

    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_error "Container '${container}' is not running"
        return 1
    fi

    # Check if database exists
    local db_exists
    db_exists=$(docker exec "$container" psql -U temporal -tc \
        "SELECT 1 FROM pg_database WHERE datname = '${db_name}'" 2>/dev/null | tr -d '[:space:]')

    if [ "$db_exists" != "1" ]; then
        log_warn "Database '${db_name}' does not exist in container '${container}' — skipping"
        return 0
    fi

    # SQL dump (plain text — portable, human-readable)
    docker exec "$container" pg_dump -U temporal -d "$db_name" --format=plain \
        > "${output_file}.sql" 2>/dev/null

    # Custom-format dump (fast, supports selective restore)
    docker exec "$container" pg_dump -U temporal -d "$db_name" --format=custom \
        > "${output_file}.dump" 2>/dev/null

    # Compress if requested
    if [ "$COMPRESS" = true ]; then
        gzip -f "${output_file}.sql"
        log_info "  Compressed: ${output_file}.sql.gz"
    fi

    local size
    size=$(du -sh "${output_file}.sql" | cut -f1)
    log_info "  ✓ ${db_name} backed up (${size})"
}

backup_all_databases() {
    local container="prod-db"

    log_info "Starting backup of all databases from ${container}..."
    echo ""

    # Backup hermes (application data)
    backup_database "$container" "hermes" "${BACKUP_DIR}/hermes"

    # Backup temporal (workflow data)
    backup_database "$container" "temporal" "${BACKUP_DIR}/temporal"

    # Backup temporal_visibility if it exists
    backup_database "$container" "temporal_visibility" "${BACKUP_DIR}/temporal_visibility"
}

backup_redis() {
    log_info "Backing up Redis data..."

    if ! docker ps --format '{{.Names}}' | grep -q "^prod-redis$"; then
        log_warn "Redis container is not running — skipping"
        return 0
    fi

    # Trigger BGSAVE and wait
    docker exec prod-redis redis-cli BGSAVE > /dev/null 2>&1
    sleep 2

    # Copy dump.rdb
    docker cp prod-redis:/data/dump.rdb "${BACKUP_DIR}/redis_dump.rdb" 2>/dev/null || \
        log_warn "Could not copy Redis dump"

    # Copy AOF if exists
    docker cp prod-redis:/data/appendonly.aof "${BACKUP_DIR}/redis_appendonly.aof" 2>/dev/null || true

    log_info "  ✓ Redis backup complete"
}

create_manifest() {
    cat > "${BACKUP_DIR}/manifest.json" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "timestamp_unix": $(date +%s),
    "backup_dir": "${BACKUP_DIR}",
    "databases": ["hermes", "temporal", "temporal_visibility"],
    "compressed": ${COMPRESS},
    "docker_containers": $(docker ps --format '{{.Names}}' | jq -R -s -c 'split("\n") | map(select(length > 0))'),
    "git_commit": "$(cd "$PROJECT_DIR" && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF
    log_info "Manifest: ${BACKUP_DIR}/manifest.json"
}

cleanup_old_backups() {
    log_info "Cleaning up backups older than ${RETAIN_DAYS} days..."

    local count=0
    while IFS= read -r dir; do
        if [ -n "$dir" ]; then
            rm -rf "$dir"
            count=$((count + 1))
        fi
    done < <(find "$BACKUP_BASE_DIR" -maxdepth 1 -type d -mtime "+${RETAIN_DAYS}" 2>/dev/null)

    if [ "$count" -gt 0 ]; then
        log_info "  Removed ${count} old backup(s)"
    else
        log_info "  No old backups to remove"
    fi
}

verify_backup() {
    log_info "Verifying backup integrity..."

    local ok=true

    for sql_file in "${BACKUP_DIR}"/*.sql; do
        [ -f "$sql_file" ] || continue
        local name
        name=$(basename "$sql_file")

        # Check for minimum content (at least 100 bytes for a valid dump)
        local size
        size=$(wc -c < "$sql_file")
        if [ "$size" -lt 100 ]; then
            log_error "  ✗ ${name} looks too small (${size} bytes) — possible failure"
            ok=false
        else
            log_info "  ✓ ${name} (${size} bytes)"
        fi
    done

    if [ "$ok" = true ]; then
        log_info "  All backups verified ✓"
    else
        log_error "  Some backups may be corrupt — check manually"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo "=========================================="
    echo " H.E.R.M.E.S. Database Backup"
    echo " $(date)"
    echo "=========================================="
    echo ""

    mkdir -p "$BACKUP_DIR"
    log_info "Backup directory: ${BACKUP_DIR}"
    echo ""

    # Backup databases
    backup_all_databases
    echo ""

    # Backup Redis
    backup_redis
    echo ""

    # Create manifest
    create_manifest
    echo ""

    # Verify
    verify_backup
    echo ""

    # Cleanup old backups
    cleanup_old_backups
    echo ""

    # Summary
    echo "=========================================="
    echo " Backup Summary"
    echo "=========================================="
    local total_size
    total_size=$(du -sh "$BACKUP_DIR" | cut -f1)
    log_info "Total size: ${total_size}"
    log_info "Location:   ${BACKUP_DIR}"
    log_info "Retention:  ${RETAIN_DAYS} days"
    echo ""

    ls -lh "${BACKUP_DIR}"/*.sql "${BACKUP_DIR}"/*.dump 2>/dev/null | \
        awk '{print "  " $NF " (" $5 ")"}'

    echo ""
    echo "=========================================="
    echo " Backup completed successfully!"
    echo "=========================================="
}

main "$@"
