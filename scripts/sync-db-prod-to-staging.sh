#!/bin/bash
#===============================================================================
# Database Sync: Production → Staging
#===============================================================================
# Exports testodoo database from production and imports to staging
#
# Safety:
# - Read-only on production (pg_dump)
# - Drops and recreates staging database
# - Creates backup of staging before overwrite
#
# Usage:
#   ./sync-db-prod-to-staging.sh
#
# Requirements:
# - SSH access to deployment server
# - Docker access on server
# - Sufficient disk space for database dump
#===============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="ten_testodoo"
DUMP_FILE="/tmp/${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql"
PROD_CONTAINER="odoo18-prod-web"
STAGING_CONTAINER="odoo18-staging-web"

#===============================================================================
# Helper Functions
#===============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

fail() {
    log_error "$1"
    exit 1
}

#===============================================================================
# Main Script
#===============================================================================

echo "=========================================="
echo "Database Sync: Production → Staging"
echo "Database: $DB_NAME"
echo "=========================================="
echo ""

log_warn "⚠️  This will REPLACE the staging database with production data"
log_warn "⚠️  All existing staging data will be lost"
echo ""
read -p "Are you sure you want to continue? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log_info "Aborted by user"
    exit 0
fi

#===============================================================================
# Step 1: Export from Production
#===============================================================================

log_info "Step 1/4: Exporting database from production..."
log_info "Container: $PROD_CONTAINER"
log_info "Database: $DB_NAME"
log_info "Output: $DUMP_FILE"

# Check if production container exists
if ! docker ps --format '{{.Names}}' | grep -q "^${PROD_CONTAINER}$"; then
    fail "Production container '$PROD_CONTAINER' not found"
fi

# Export database using pg_dump
log_info "Running pg_dump (this may take a few minutes)..."
docker exec -t "$PROD_CONTAINER" \
    pg_dump -h seisei-db -U odoo -d "$DB_NAME" --no-owner --no-acl \
    > "$DUMP_FILE" 2>&1 || fail "Failed to export database"

# Verify dump file
if [ ! -f "$DUMP_FILE" ]; then
    fail "Dump file not created: $DUMP_FILE"
fi

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log_success "Database exported successfully ($DUMP_SIZE)"
echo ""

#===============================================================================
# Step 2: Backup Existing Staging Database
#===============================================================================

log_info "Step 2/4: Backing up existing staging database..."
BACKUP_FILE="/tmp/${DB_NAME}_staging_backup_$(date +%Y%m%d_%H%M%S).sql"

# Check if staging container exists
if docker ps --format '{{.Names}}' | grep -q "^${STAGING_CONTAINER}$"; then
    log_info "Creating backup: $BACKUP_FILE"
    docker exec -t "$STAGING_CONTAINER" \
        pg_dump -h seisei-db -U odoo -d "$DB_NAME" --no-owner --no-acl \
        > "$BACKUP_FILE" 2>/dev/null || log_warn "No existing database to backup"

    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log_success "Staging database backed up ($BACKUP_SIZE)"
    else
        log_info "No existing staging database found (fresh deployment)"
        rm -f "$BACKUP_FILE"
    fi
else
    log_warn "Staging container not found, skipping backup"
fi
echo ""

#===============================================================================
# Step 3: Drop and Recreate Staging Database
#===============================================================================

log_info "Step 3/4: Recreating staging database..."

# Terminate existing connections and drop database
log_info "Terminating existing connections..."
docker exec -t "$STAGING_CONTAINER" psql -h seisei-db -U odoo -d postgres <<-EOSQL 2>/dev/null || true
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
EOSQL

log_info "Dropping existing database..."
docker exec -t "$STAGING_CONTAINER" \
    psql -h seisei-db -U odoo -d postgres \
    -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true

log_info "Creating fresh database..."
docker exec -t "$STAGING_CONTAINER" \
    psql -h seisei-db -U odoo -d postgres \
    -c "CREATE DATABASE $DB_NAME OWNER odoo;" \
    || fail "Failed to create database"

log_success "Staging database recreated"
echo ""

#===============================================================================
# Step 4: Import to Staging
#===============================================================================

log_info "Step 4/4: Importing database to staging..."
log_info "Database: $DB_NAME"
log_info "Size: $DUMP_SIZE"

cat "$DUMP_FILE" | docker exec -i "$STAGING_CONTAINER" \
    psql -h seisei-db -U odoo -d "$DB_NAME" \
    || fail "Failed to import database"

log_success "Database imported successfully"
echo ""

#===============================================================================
# Cleanup
#===============================================================================

log_info "Cleaning up temporary files..."
rm -f "$DUMP_FILE"
log_success "Temporary dump file removed: $DUMP_FILE"

if [ -f "$BACKUP_FILE" ]; then
    log_info "Backup kept at: $BACKUP_FILE"
    log_info "You can safely delete this after verifying the import"
fi

echo ""
echo "=========================================="
log_success "✅ Database sync completed successfully"
echo "=========================================="
echo ""
log_info "Next steps:"
echo "  1. Restart staging Odoo container to clear cache"
echo "  2. Visit https://staging.odoo.seisei.tokyo"
echo "  3. Verify images are displaying correctly"
echo ""
log_warn "⚠️  Note: Staging now has PRODUCTION data"
log_warn "⚠️  Do NOT test destructive operations on staging"
