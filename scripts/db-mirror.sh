#!/bin/bash
# =============================================================================
# H.E.R.M.E.S. — Database Mirroring & Disaster Recovery Script
# Mirrors production database to staging or a file-based backup.
# Usage:
#   ./scripts/db-mirror.sh backup          # Full backup to timestamped dir
#   ./scripts/db-mirror.sh restore <file>  # Restore from SQL dump
#   ./scripts/db-mirror.sh mirror-staging  # Mirror prod → staging
#   ./scripts/db-mirror.sh verify          # Verify backup integrity
#   ./scripts/db-mirror.sh schedule        # Install cron for automatic backups
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROD_COMPOSE="${PROJECT_DIR}/docker-compose.yml"
STAGING_COMPOSE="${PROJECT_DIR}/docker-compose.staging.yml"
MIRROR_DIR="${PROJECT_DIR}/backups/mirror"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}    $1"; }
log_error() { echo -e "${RED}[ERROR]${NC}   $1"; }
log_step()  { echo -e "${BLUE}[STEP]${NC}    $1"; }

# =============================================================================
# Commands
# =============================================================================

cmd_backup() {
    local backup_dir="${MIRROR_DIR}/${TIMESTAMP}"
    mkdir -p "$backup_dir"

    echo "=========================================="
    echo " H.E.R.M.E.S. Full Database Backup"
    echo " $(date)"
    echo "=========================================="
    echo ""

    log_step "Dumping hermes database..."
    if docker ps --format '{{.Names}}' | grep -q "^prod-db$"; then
        # Dump hermes (application data — agents, tasks, configs)
        docker exec prod-db pg_dump -U temporal -d hermes --format=custom \
            > "${backup_dir}/hermes.dump" 2>/dev/null
        docker exec prod-db pg_dump -U temporal -d hermes --format=plain \
            > "${backup_dir}/hermes.sql" 2>/dev/null
        log_info "  ✓ hermes database dumped"

        # Dump temporal (workflow engine data)
        docker exec prod-db pg_dump -U temporal -d temporal --format=custom \
            > "${backup_dir}/temporal.dump" 2>/dev/null
        docker exec prod-db pg_dump -U temporal -d temporal --format=plain \
            > "${backup_dir}/temporal.sql" 2>/dev/null
        log_info "  ✓ temporal database dumped"

        # Get row counts for manifest
        local agent_count task_count
        agent_count=$(docker exec prod-db psql -U temporal -d hermes -tAc \
            "SELECT COUNT(*) FROM agents" 2>/dev/null || echo "0")
        task_count=$(docker exec prod-db psql -U temporal -d hermes -tAc \
            "SELECT COUNT(*) FROM tasks" 2>/dev/null || echo "0")

        # Write manifest
        cat > "${backup_dir}/manifest.json" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "type": "full_backup",
    "databases": {
        "hermes": {
            "agents": ${agent_count},
            "tasks": ${task_count}
        }
    },
    "git_commit": "$(cd "$PROJECT_DIR" && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF

        log_info "  Agent count: ${agent_count}"
        log_info "  Task count:  ${task_count}"
    else
        log_error "prod-db container is not running!"
        exit 1
    fi

    # Cleanup old mirrors (keep last 20)
    local count
    count=$(ls -d "${MIRROR_DIR}"/*/ 2>/dev/null | wc -l)
    if [ "$count" -gt 20 ]; then
        local to_remove=$((count - 20))
        ls -d "${MIRROR_DIR}"/*/ | head -n "$to_remove" | while read -r dir; do
            rm -rf "$dir"
        done
        log_info "  Cleaned up ${to_remove} old backup(s)"
    fi

    echo ""
    log_info "Backup saved to: ${backup_dir}"
    local total_size
    total_size=$(du -sh "$backup_dir" | cut -f1)
    log_info "Total size: ${total_size}"
    echo ""
    echo "=========================================="
    echo " Backup completed!"
    echo "=========================================="
}

cmd_restore() {
    local dump_file="$1"

    echo "=========================================="
    echo " H.E.R.M.E.S. Database Restore"
    echo "=========================================="
    echo ""

    if [ ! -f "$dump_file" ]; then
        log_error "File not found: ${dump_file}"
        exit 1
    fi

    if ! docker ps --format '{{.Names}}' | grep -q "^prod-db$"; then
        log_error "prod-db container is not running!"
        exit 1
    fi

    log_warn "⚠  This will OVERWRITE the current production database!"
    echo ""
    read -p "Are you sure? Type 'RESTORE' to confirm: " confirm
    if [ "$confirm" != "RESTORE" ]; then
        echo "Aborted."
        exit 0
    fi

    echo ""
    log_step "Creating safety backup of current data..."
    cmd_backup

    log_step "Restoring from: ${dump_file}"

    # Determine file type and restore
    if [[ "$dump_file" == *.dump ]]; then
        # Custom format — use pg_restore
        docker exec -i prod-db pg_restore -U temporal -d hermes --clean --if-exists \
            < "$dump_file" 2>/dev/null || true
    elif [[ "$dump_file" == *.sql ]]; then
        # Plain SQL — use psql
        docker exec -i prod-db psql -U temporal -d hermes \
            < "$dump_file" 2>/dev/null || true
    else
        log_error "Unknown file format. Use .sql or .dump"
        exit 1
    fi

    echo ""
    log_info "Restore complete. Verifying..."

    local agent_count
    agent_count=$(docker exec prod-db psql -U temporal -d hermes -tAc \
        "SELECT COUNT(*) FROM agents" 2>/dev/null || echo "0")
    log_info "  Agents in database: ${agent_count}"

    echo ""
    echo "=========================================="
    echo " Restore completed!"
    echo "=========================================="
}

cmd_mirror_staging() {
    echo "=========================================="
    echo " H.E.R.M.E.S. Mirror: Production → Staging"
    echo "=========================================="
    echo ""

    # Check production
    if ! docker ps --format '{{.Names}}' | grep -q "^prod-db$"; then
        log_error "Production database (prod-db) is not running!"
        exit 1
    fi

    # Check staging
    if ! docker ps --format '{{.Names}}' | grep -q "^staging-db$"; then
        log_warn "Staging database (staging-db) is not running."
        log_info "Starting staging infrastructure..."
        docker compose -f "$STAGING_COMPOSE" up -d temporal-db-staging redis-staging
        sleep 10
    fi

    log_step "Dumping production hermes database..."
    local tmp_dump
    tmp_dump=$(mktemp /tmp/hermes_mirror_XXXXXX.dump)
    docker exec prod-db pg_dump -U temporal -d hermes --format=custom \
        > "$tmp_dump" 2>/dev/null
    log_info "  ✓ Production dump created ($(du -sh "$tmp_dump" | cut -f1))"

    log_step "Restoring to staging database..."

    # Drop and recreate hermes_staging
    docker exec staging-db psql -U temporal -c \
        "DROP DATABASE IF EXISTS hermes_staging;" 2>/dev/null || true
    docker exec staging-db psql -U temporal -c \
        "CREATE DATABASE hermes_staging;" 2>/dev/null

    # Restore
    docker exec -i staging-db pg_restore -U temporal -d hermes_staging \
        < "$tmp_dump" 2>/dev/null || true

    rm -f "$tmp_dump"

    echo ""
    log_info "Verifying staging data..."

    local staging_agents
    staging_agents=$(docker exec staging-db psql -U temporal -d hermes_staging -tAc \
        "SELECT COUNT(*) FROM agents" 2>/dev/null || echo "0")
    log_info "  Staging agents: ${staging_agents}"

    echo ""
    echo "=========================================="
    echo " Mirror completed! Production → Staging"
    echo "  Staging now has ${staging_agents} agents"
    echo "=========================================="
}

cmd_verify() {
    echo "=========================================="
    echo " H.E.R.M.E.S. Backup Verification"
    echo "=========================================="
    echo ""

    # Find latest backup
    local latest_dir
    latest_dir=$(ls -d "${MIRROR_DIR}"/*/ 2>/dev/null | sort -r | head -n1)

    if [ -z "$latest_dir" ]; then
        log_error "No backups found in ${MIRROR_DIR}"
        exit 1
    fi

    log_info "Verifying backup: ${latest_dir}"
    echo ""

    local ok=true

    # Check SQL dumps
    for sql_file in "${latest_dir}"*.sql; do
        [ -f "$sql_file" ] || continue
        local name
        name=$(basename "$sql_file")
        local size
        size=$(wc -c < "$sql_file")

        if [ "$size" -lt 100 ]; then
            log_error "  ✗ ${name} — too small (${size} bytes)"
            ok=false
        else
            # Check for PostgreSQL dump markers
            if head -n5 "$sql_file" | grep -q "PostgreSQL database dump"; then
                log_info "  ✓ ${name} — valid PostgreSQL dump (${size} bytes)"
            else
                log_warn "  ⚠ ${name} — may not be a valid dump (${size} bytes)"
            fi
        fi
    done

    # Check custom dumps
    for dump_file in "${latest_dir}"*.dump; do
        [ -f "$dump_file" ] || continue
        local name
        name=$(basename "$dump_file")
        local size
        size=$(wc -c < "$dump_file")

        if [ "$size" -lt 100 ]; then
            log_error "  ✗ ${name} — too small (${size} bytes)"
            ok=false
        else
            log_info "  ✓ ${name} — present (${size} bytes)"
        fi
    done

    # Check manifest
    if [ -f "${latest_dir}manifest.json" ]; then
        log_info "  ✓ manifest.json present"
        if command -v jq &>/dev/null; then
            echo ""
            log_info "  Manifest contents:"
            jq '.' "${latest_dir}manifest.json" 2>/dev/null | head -20
        fi
    else
        log_warn "  ⚠ No manifest found"
    fi

    echo ""
    if [ "$ok" = true ]; then
        log_info "All checks passed ✓"
    else
        log_error "Some checks failed — review manually"
        exit 1
    fi
}

cmd_schedule() {
    echo "=========================================="
    echo " H.E.R.M.E.S. Backup Scheduler"
    echo "=========================================="
    echo ""

    local cron_entry="0 2 * * * cd ${PROJECT_DIR} && bash scripts/db-mirror.sh backup >> ${PROJECT_DIR}/backups/mirror/cron.log 2>&1"

    log_info "This will install a cron job for daily backups at 2:00 AM:"
    echo ""
    echo "  ${cron_entry}"
    echo ""

    read -p "Install cron job? [y/N] " confirm
    if [[ "$confirm" != [yY] ]]; then
        echo "Aborted."
        exit 0
    fi

    # Check if cron entry already exists
    if crontab -l 2>/dev/null | grep -q "db-mirror.sh backup"; then
        log_warn "Cron job already exists. Removing old entry..."
        crontab -l 2>/dev/null | grep -v "db-mirror.sh backup" | crontab -
    fi

    # Add new cron entry
    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -

    log_info "✓ Cron job installed"
    echo ""
    log_info "Current crontab:"
    crontab -l | grep "db-mirror"
    echo ""
    log_info "Logs will be written to: ${PROJECT_DIR}/backups/mirror/cron.log"
}

# =============================================================================
# Main
# =============================================================================

usage() {
    echo "H.E.R.M.E.S. Database Mirroring Tool"
    echo ""
    echo "Usage: $0 <command> [arguments]"
    echo ""
    echo "Commands:"
    echo "  backup              Full backup of all production databases"
    echo "  restore <file>      Restore from a .sql or .dump file"
    echo "  mirror-staging      Copy production data to staging environment"
    echo "  verify              Verify the latest backup's integrity"
    echo "  schedule            Install daily cron job for automatic backups"
    echo ""
    echo "Examples:"
    echo "  $0 backup"
    echo "  $0 restore ./backups/mirror/20260628_120000/hermes.sql"
    echo "  $0 mirror-staging"
    echo "  $0 verify"
    echo "  $0 schedule"
}

case "${1:-}" in
    backup)          cmd_backup ;;
    restore)
        if [ -z "${2:-}" ]; then
            log_error "Usage: $0 restore <file>"
            exit 1
        fi
        cmd_restore "$2"
        ;;
    mirror-staging)  cmd_mirror_staging ;;
    verify)          cmd_verify ;;
    schedule)        cmd_schedule ;;
    -h|--help)       usage ;;
    *)
        if [ -n "${1:-}" ]; then
            log_error "Unknown command: $1"
        fi
        usage
        exit 1
        ;;
esac
