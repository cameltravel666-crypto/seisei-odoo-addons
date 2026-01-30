#!/bin/bash
# =============================================================================
# Backup Script - Production-Grade Backup
# =============================================================================
# Usage: ./backup.sh <stack> <env>
# Example: ./backup.sh odoo18-prod prod
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Help
if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: $0 <stack> <env>"
    echo "Example: $0 odoo18-prod prod"
    exit 0
fi

# Parse arguments
STACK="${1:-}"
ENV="${2:-prod}"

[ -z "$STACK" ] && fail "Usage: $0 <stack> <env>"

log_step "Backup: $STACK ($ENV)"

# Resolve stack directory
STACK_DIR=$(resolve_stack_dir "$STACK")
log_info "Stack directory: $STACK_DIR"

# Create backup directory
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/$STACK/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
log_info "Backup directory: $BACKUP_DIR"

# Backup compose files and config
log_info "Backing up configuration files..."
cd "$STACK_DIR" || fail "Cannot cd to $STACK_DIR"

for file in docker-compose.yml docker-compose.override.yml .env; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/"
        log_success "Backed up: $file"
    fi
done

# Backup config directory if exists
if [ -d "config" ]; then
    cp -r config "$BACKUP_DIR/"
    log_success "Backed up: config/"
fi

# Backup database
log_info "Looking for database container..."

# Find database container
DB_CONTAINER=""
for pattern in "${STACK}-db" "${STACK}_db" "$(echo $STACK | tr '-' '_')-db" "$(echo $STACK | tr '-' '_')_db_1"; do
    if docker ps --format '{{.Names}}' | grep -q "^${pattern}$"; then
        DB_CONTAINER="$pattern"
        break
    fi
done

# Also try to find by compose service label
if [ -z "$DB_CONTAINER" ]; then
    DB_CONTAINER=$(docker compose ps -q db 2>/dev/null | xargs -r docker inspect --format '{{.Name}}' | sed 's/^\///' || echo "")
fi

# Attempt database backup
if [ -n "$DB_CONTAINER" ]; then
    log_info "Found database container: $DB_CONTAINER"
    
    # Try common database users
    DB_BACKED_UP=false
    for user in postgres odoo ocr; do
        log_info "Trying to backup database with user: $user"
        
        if docker exec "$DB_CONTAINER" pg_dumpall -U "$user" 2>/dev/null | gzip > "$BACKUP_DIR/database.sql.gz"; then
            DB_SIZE=$(du -h "$BACKUP_DIR/database.sql.gz" | cut -f1)
            log_success "Database backed up: database.sql.gz ($DB_SIZE) [user: $user]"
            DB_BACKED_UP=true
            break
        fi
    done
    
    if [ "$DB_BACKED_UP" = false ]; then
        log_warn "Could not backup database. Tried users: postgres, odoo, ocr"
        log_warn "Please backup database manually if needed"
    fi
else
    log_info "No database container found for $STACK (this is OK if stack has no database)"
fi

# Create backup manifest
cat > "$BACKUP_DIR/manifest.txt" << EOF
Backup Manifest
===============
Stack: $STACK
Environment: $ENV
Timestamp: $TIMESTAMP
Backup Directory: $BACKUP_DIR

Files backed up:
$(ls -lh "$BACKUP_DIR")

Created by: backup.sh
EOF

log_success "Backup manifest created"

# Cleanup old backups (keep last 10)
log_info "Cleaning up old backups (keeping last 10)..."
ls -t "$BACKUP_ROOT/$STACK" 2>/dev/null | tail -n +11 | xargs -r -I {} rm -rf "$BACKUP_ROOT/$STACK/{}"

# Output backup path
echo "$BACKUP_DIR"
log_success "✅ Backup completed: $BACKUP_DIR"
exit 0
