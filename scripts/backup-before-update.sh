#!/bin/bash
# =============================================================================
# H.E.R.M.E.S. Dashboard - Pre-Update Backup Script
# =============================================================================
# Creates timestamped backups of PostgreSQL and ChromaDB data before updates.
# Usage: ./scripts/backup-before-update.sh [--no-chroma] [--no-postgres]
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_BASE_DIR="${PROJECT_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_BASE_DIR}/${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Flags
BACKUP_POSTGRES=true
BACKUP_CHROMA=true

# Parse arguments
for arg in "$@"; do
    case $arg in
        --no-postgres)
            BACKUP_POSTGRES=false
            shift
            ;;
        --no-chroma)
            BACKUP_CHROMA=false
            shift
            ;;
        *)
            echo -e "${RED}Unknown argument: $arg${NC}"
            echo "Usage: $0 [--no-chroma] [--no-postgres]"
            exit 1
            ;;
    esac
done

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    local missing=()
    
    if ! command -v docker &> /dev/null; then
        missing+=("docker")
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        missing+=("docker-compose")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing dependencies: ${missing[*]}"
        exit 1
    fi
}

# =============================================================================
# Backup Functions
# =============================================================================

backup_postgres() {
    if [ "$BACKUP_POSTGRES" = false ]; then
        log_warn "Skipping PostgreSQL backup (--no-postgres)"
        return 0
    fi
    
    log_info "Starting PostgreSQL backup..."
    
    local postgres_backup_dir="${BACKUP_DIR}/postgres"
    mkdir -p "$postgres_backup_dir"
    
    # Check if temporal-db container is running
    if ! docker ps --format '{{.Names}}' | grep -q "temporal-db"; then
        log_error "temporal-db container is not running"
        return 1
    fi
    
    # Get PostgreSQL credentials from environment or use defaults
    local pg_user="${POSTGRES_USER:-temporal}"
    local pg_password="${POSTGRES_PASSWORD:-***}"
    local pg_db="${POSTGRES_DB:-temporal}"
    
    # Dump all application databases
    for db_name in hermes temporal temporal_visibility; do
        local db_exists
        db_exists=$(docker exec temporal-db psql -U "$pg_user" -tc \
            "SELECT 1 FROM pg_database WHERE datname = '${db_name}'" 2>/dev/null | tr -d '[:space:]')

        if [ "$db_exists" = "1" ]; then
            log_info "Dumping database: ${db_name}..."
            docker exec temporal-db pg_dump \
                -U "$pg_user" \
                -d "$db_name" \
                --format=custom \
                --verbose \
                > "${postgres_backup_dir}/${db_name}.dump" 2> "${postgres_backup_dir}/${db_name}_dump.log"

            docker exec temporal-db pg_dump \
                -U "$pg_user" \
                -d "$db_name" \
                --format=plain \
                > "${postgres_backup_dir}/${db_name}.sql" 2>> "${postgres_backup_dir}/${db_name}_dump.log"

            local db_size
            db_size=$(docker exec temporal-db psql -U "$pg_user" -d "$db_name" -t -c \
                "SELECT pg_size_pretty(pg_database_size('${db_name}'));" | tr -d '[:space:]')
            log_info "  ${db_name}: ${db_size}"
        else
            log_warn "Database '${db_name}' does not exist — skipping"
        fi
    done
    
    return 0
}

backup_chroma() {
    if [ "$BACKUP_CHROMA" = false ]; then
        log_warn "Skipping ChromaDB backup (--no-chroma)"
        return 0
    fi
    
    log_info "Starting ChromaDB backup..."
    
    local chroma_backup_dir="${BACKUP_DIR}/chromadb"
    mkdir -p "$chroma_backup_dir"
    
    # Backup ChromaDB data directory
    local chroma_data_dir="${PROJECT_DIR}/backend/data/chroma"
    
    if [ -d "$chroma_data_dir" ]; then
        log_info "Copying ChromaDB data from ${chroma_data_dir}..."
        cp -r "$chroma_data_dir" "${chroma_backup_dir}/data"
        
        # Get size of ChromaDB data
        local chroma_size=$(du -sh "$chroma_data_dir" | cut -f1)
        log_info "ChromaDB data size: ${chroma_size}"
    else
        log_warn "ChromaDB data directory not found: ${chroma_data_dir}"
    fi
    
    # Also backup root-level data/chroma if it exists
    local root_chroma_dir="${PROJECT_DIR}/data/chroma"
    if [ -d "$root_chroma_dir" ]; then
        log_info "Copying root ChromaDB data from ${root_chroma_dir}..."
        cp -r "$root_chroma_dir" "${chroma_backup_dir}/root_data"
    fi
    
    log_info "ChromaDB backup completed: ${chroma_backup_dir}"
    
    return 0
}

create_manifest() {
    log_info "Creating backup manifest..."
    
    cat > "${BACKUP_DIR}/manifest.json" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "timestamp_unix": $(date +%s),
    "backup_dir": "${BACKUP_DIR}",
    "project_dir": "${PROJECT_DIR}",
    "components": {
        "postgres": ${BACKUP_POSTGRES},
        "chromadb": ${BACKUP_CHROMA}
    },
    "docker_containers": $(docker ps --format '{{.Names}}' | jq -R -s -c 'split("\n") | map(select(length > 0))'),
    "git_commit": "$(cd "$PROJECT_DIR" && git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF
    
    log_info "Manifest created: ${BACKUP_DIR}/manifest.json"
}

cleanup_old_backups() {
    local max_backups=10
    
    log_info "Cleaning up old backups (keeping last ${max_backups})..."
    
    local backup_count=$(ls -d "${BACKUP_BASE_DIR}"/*/ 2>/dev/null | wc -l)
    
    if [ "$backup_count" -gt "$max_backups" ]; then
        local backups_to_remove=$((backup_count - max_backups))
        ls -d "${BACKUP_BASE_DIR}"/*/ | head -n "$backups_to_remove" | while read dir; do
            log_info "Removing old backup: $dir"
            rm -rf "$dir"
        done
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    echo "=========================================="
    echo "H.E.R.M.E.S. Dashboard - Backup Script"
    echo "=========================================="
    echo ""
    
    # Check dependencies
    check_dependencies
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    log_info "Backup directory: ${BACKUP_DIR}"
    log_info "Timestamp: ${TIMESTAMP}"
    echo ""
    
    # Perform backups
    local postgres_status=0
    local chroma_status=0
    
    backup_postgres || postgres_status=$?
    echo ""
    backup_chroma || chroma_status=$?
    echo ""
    
    # Create manifest
    create_manifest
    echo ""
    
    # Cleanup old backups
    cleanup_old_backups
    echo ""
    
    # Summary
    echo "=========================================="
    echo "Backup Summary"
    echo "=========================================="
    echo ""
    
    if [ "$BACKUP_POSTGRES" = true ]; then
        if [ $postgres_status -eq 0 ]; then
            log_info "PostgreSQL: ✓ Success"
        else
            log_error "PostgreSQL: ✗ Failed"
        fi
    else
        log_warn "PostgreSQL: ⊘ Skipped"
    fi
    
    if [ "$BACKUP_CHROMA" = true ]; then
        if [ $chroma_status -eq 0 ]; then
            log_info "ChromaDB: ✓ Success"
        else
            log_error "ChromaDB: ✗ Failed"
        fi
    else
        log_warn "ChromaDB: ⊘ Skipped"
    fi
    
    echo ""
    log_info "Backup location: ${BACKUP_DIR}"
    
    # Calculate total backup size
    local total_size=$(du -sh "$BACKUP_DIR" | cut -f1)
    log_info "Total backup size: ${total_size}"
    
    # Exit with error if any backup failed
    if [ $postgres_status -ne 0 ] || [ $chroma_status -ne 0 ]; then
        log_error "Some backups failed. Check logs for details."
        exit 1
    fi
    
    echo ""
    echo "=========================================="
    echo "Backup completed successfully!"
    echo "=========================================="
    
    return 0
}

# Run main function
main "$@"
