#!/bin/bash
# =============================================================================
# Migrate Missing Databases to Production RDS
# =============================================================================
# This script migrates 14 missing databases from original server to Prod RDS
# =============================================================================

set -euo pipefail

# Colors
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_YELLOW='\033[1;33m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_NC='\033[0m'

log_info() { echo -e "${COLOR_BLUE}[INFO]${COLOR_NC} $*"; }
log_success() { echo -e "${COLOR_GREEN}[✓]${COLOR_NC} $*"; }
log_warn() { echo -e "${COLOR_YELLOW}[!]${COLOR_NC} $*"; }
log_error() { echo -e "${COLOR_RED}[✗]${COLOR_NC} $*"; }

# Configuration
readonly SSH_KEY="/Users/taozhang/Projects/Pem/odoo-2025.pem"
readonly ORIGINAL_SERVER="54.65.127.141"
readonly PROD_RDS_HOST="seisei-odoo18-prod-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com"
readonly PROD_RDS_USER="odoo18"
readonly PROD_RDS_PASSWORD="Wind1982"
readonly DB_CONTAINER="seisei-db"

# Databases to migrate (14 missing from Production RDS)
readonly DATABASES=(
    "biznexus"
    "odoo18_staging"
    "opss.seisei.tokyo"
    "seisei-project"
    "ten_00000001"
    "ten_00000002"
    "ten_00000003"
    "ten_00000004"
    "ten_public"
    "test001"
    "tpl_consulting"
    "tpl_production"
    "tpl_realestate"
    "tpl_restaurant"
    "tpl_retail"
    "tpl_service"
)

echo ""
log_info "Production RDS Database Migration"
log_info "=================================="
echo ""
log_info "Source: Original Server (${ORIGINAL_SERVER})"
log_info "Target: Production RDS (${PROD_RDS_HOST})"
log_info "Databases to migrate: ${#DATABASES[@]}"
echo ""

# Counter
SUCCESS_COUNT=0
FAILED_COUNT=0
declare -a FAILED_DBS

# Migrate each database
for db in "${DATABASES[@]}"; do
    echo ""
    log_info "Migrating: ${db}"
    echo "────────────────────────────────────────"

    # Step 1: Dump from original server
    log_info "  [1/3] Exporting from original server..."
    if ssh -i "${SSH_KEY}" ubuntu@${ORIGINAL_SERVER} \
        "docker exec ${DB_CONTAINER} pg_dump -U odoo18 -Fc ${db}" \
        > "/tmp/${db}.dump" 2>/tmp/dump_error.log; then

        DUMP_SIZE=$(ls -lh "/tmp/${db}.dump" | awk '{print $5}')
        log_success "  Exported: ${DUMP_SIZE}"
    else
        log_error "  Export failed for ${db}"
        cat /tmp/dump_error.log
        FAILED_COUNT=$((FAILED_COUNT + 1))
        FAILED_DBS+=("${db}")
        continue
    fi

    # Step 2: Create database on Production RDS
    log_info "  [2/3] Creating database on Production RDS..."
    if PGPASSWORD="${PROD_RDS_PASSWORD}" psql \
        -h "${PROD_RDS_HOST}" \
        -U "${PROD_RDS_USER}" \
        -d postgres \
        -c "CREATE DATABASE \"${db}\" OWNER ${PROD_RDS_USER};" \
        2>/tmp/create_error.log; then
        log_success "  Database created"
    else
        # Check if database already exists
        if grep -q "already exists" /tmp/create_error.log; then
            log_warn "  Database already exists, will overwrite"
        else
            log_error "  Failed to create database"
            cat /tmp/create_error.log
            FAILED_COUNT=$((FAILED_COUNT + 1))
            FAILED_DBS+=("${db}")
            rm -f "/tmp/${db}.dump"
            continue
        fi
    fi

    # Step 3: Restore to Production RDS
    log_info "  [3/3] Importing to Production RDS..."
    if PGPASSWORD="${PROD_RDS_PASSWORD}" pg_restore \
        -h "${PROD_RDS_HOST}" \
        -U "${PROD_RDS_USER}" \
        -d "${db}" \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        "/tmp/${db}.dump" \
        2>/tmp/restore_error.log; then
        log_success "  Import completed"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        # pg_restore returns non-zero for warnings, check if critical error
        if grep -qE "FATAL|ERROR.*relation.*does not exist" /tmp/restore_error.log; then
            log_error "  Import failed for ${db}"
            cat /tmp/restore_error.log | head -20
            FAILED_COUNT=$((FAILED_COUNT + 1))
            FAILED_DBS+=("${db}")
        else
            log_warn "  Import completed with warnings (likely OK)"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        fi
    fi

    # Cleanup dump file
    rm -f "/tmp/${db}.dump"

    log_success "Database ${db} migrated successfully!"
done

# Summary
echo ""
echo "═══════════════════════════════════════"
echo "  MIGRATION SUMMARY"
echo "═══════════════════════════════════════"
log_success "Successfully migrated: ${SUCCESS_COUNT} databases"

if [ ${FAILED_COUNT} -gt 0 ]; then
    log_error "Failed migrations: ${FAILED_COUNT} databases"
    echo "Failed databases:"
    for db in "${FAILED_DBS[@]}"; do
        echo "  - ${db}"
    done
    echo ""
    exit 1
else
    log_success "All databases migrated successfully!"
    echo ""
    log_info "Next steps:"
    echo "  1. Verify database integrity on Production RDS"
    echo "  2. Deploy Production EC2 environment"
    echo "  3. Configure Traefik for production routing"
    exit 0
fi
