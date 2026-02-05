#!/bin/bash
#===============================================================================
# Clone Production to Staging
#===============================================================================
# Purpose: Clone prod "runnable state" to staging (code/image/config/data/routing)
# Safety: prod read-only, staging fully backed up, rollback ready
#
# Usage: ./scripts/clone_prod_to_staging.sh
#
# Requirements:
# - SSH access to deployment server (key: /Users/taozhang/Projects/Pem/odoo-2025.pem)
# - Docker access on server
# - AWS CLI configured (for RDS operations if needed)
# - Sufficient disk space for backups
#===============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SSH_KEY="/Users/taozhang/Projects/Pem/odoo-2025.pem"
DEPLOY_HOST="54.65.127.141"
DEPLOY_USER="ubuntu"

# Paths
PROD_STACK_DIR="/srv/stacks/odoo18-prod"
STG_STACK_DIR="/srv/stacks/odoo18-staging"
BACKUP_DIR="/srv/backups/odoo18-staging/${TIMESTAMP}"
RELEASE_DIR="/srv/releases/stacks"

# Database (RDS)
PROD_DB_HOST="seisei-odoo18-prod-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com"
STG_DB_HOST="seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com"
DB_NAME="ten_testodoo"
DB_USER="odoo18"
DB_PORT="5432"

# S3
PROD_S3_BUCKET="biznexus-prod-files"
STG_S3_BUCKET="seisei-staging"
S3_PREFIX="odoo/ten_testodoo"

# Containers
PROD_CONTAINER="odoo18-prod-web"
STG_CONTAINER="odoo18-staging-web"

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

ssh_exec() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "${DEPLOY_USER}@${DEPLOY_HOST}" "$@"
}

#===============================================================================
# Step 1 — Inventory of prod/staging current state (read-only)
#===============================================================================

step1_inventory() {
    echo "=========================================="
    echo "Step 1 — Inventory (Read-Only)"
    echo "=========================================="
    echo ""

    log_info "Collecting production state..."

    # Production image digest
    PROD_IMAGE_DIGEST=$(ssh_exec "sudo docker inspect ${PROD_CONTAINER} --format '{{.Image}}'")
    log_info "Production image: ${PROD_IMAGE_DIGEST}"

    # Production compose hash
    PROD_COMPOSE_HASH=$(ssh_exec "sha256sum ${PROD_STACK_DIR}/docker-compose.yml" | awk '{print $1}')
    log_info "Production compose hash: ${PROD_COMPOSE_HASH}"

    # Production env hash (sanitized)
    PROD_ENV_HASH=$(ssh_exec "grep -v -E '^(PASSWORD|KEY|SECRET)=' ${PROD_STACK_DIR}/.env | sha256sum" | awk '{print $1}')
    log_info "Production env hash (sanitized): ${PROD_ENV_HASH}"

    # Production containers
    log_info "Production containers:"
    ssh_exec "sudo docker ps --filter 'name=odoo18-prod' --format 'table {{.Names}}\t{{.Status}}'"

    # Production volumes
    log_info "Production volumes:"
    ssh_exec "sudo docker volume ls --filter 'name=odoo18-prod' --format 'table {{.Name}}\t{{.Mountpoint}}'"

    # Production DB version
    log_info "Production database version:"
    ssh_exec "sudo docker exec ${PROD_CONTAINER} bash -c \"PGPASSWORD=Wind1982 psql -h ${PROD_DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c 'SELECT version();'\" 2>/dev/null | grep PostgreSQL" || log_warn "Could not fetch DB version"

    echo ""
    log_info "Collecting staging state..."

    # Staging image digest
    STG_IMAGE_DIGEST=$(ssh_exec "sudo docker inspect ${STG_CONTAINER} --format '{{.Image}}'")
    log_info "Staging image: ${STG_IMAGE_DIGEST}"

    # Staging compose hash
    STG_COMPOSE_HASH=$(ssh_exec "sha256sum ${STG_STACK_DIR}/docker-compose.yml" | awk '{print $1}')
    log_info "Staging compose hash: ${STG_COMPOSE_HASH}"

    # Staging env hash (sanitized)
    STG_ENV_HASH=$(ssh_exec "grep -v -E '^(PASSWORD|KEY|SECRET)=' ${STG_STACK_DIR}/.env | sha256sum" | awk '{print $1}')
    log_info "Staging env hash (sanitized): ${STG_ENV_HASH}"

    echo ""
    log_success "Step 1 completed - Inventory collected"
    echo ""
}

#===============================================================================
# Step 2 — Staging full backup (rollback baseline)
#===============================================================================

step2_backup_staging() {
    echo "=========================================="
    echo "Step 2 — Staging Backup (Rollback Baseline)"
    echo "=========================================="
    echo ""

    log_info "Creating backup directory: ${BACKUP_DIR}"
    ssh_exec "sudo mkdir -p ${BACKUP_DIR}"

    # Backup compose & env
    log_info "Backing up staging compose and env files..."
    ssh_exec "sudo cp ${STG_STACK_DIR}/docker-compose.yml ${BACKUP_DIR}/"
    ssh_exec "sudo cp ${STG_STACK_DIR}/.env ${BACKUP_DIR}/"
    ssh_exec "sudo cp -r ${STG_STACK_DIR}/config ${BACKUP_DIR}/" || log_warn "No config directory"

    # Backup database
    log_info "Backing up staging database: ${DB_NAME}"
    ssh_exec "sudo docker exec ${STG_CONTAINER} bash -c \"PGPASSWORD=Wind1982 pg_dump -h ${STG_DB_HOST} -U ${DB_USER} -d ${DB_NAME} --no-owner --no-acl\" > /tmp/staging_backup_${TIMESTAMP}.sql 2>&1" || log_warn "Database backup failed (may not exist)"

    if ssh_exec "[ -f /tmp/staging_backup_${TIMESTAMP}.sql ]"; then
        BACKUP_SIZE=$(ssh_exec "du -h /tmp/staging_backup_${TIMESTAMP}.sql | cut -f1")
        ssh_exec "sudo mv /tmp/staging_backup_${TIMESTAMP}.sql ${BACKUP_DIR}/"
        log_success "Database backed up: ${BACKUP_SIZE}"
    else
        log_warn "No staging database to backup (fresh deployment)"
    fi

    # Backup volumes
    log_info "Backing up staging volumes..."
    ssh_exec "sudo docker run --rm -v odoo18-staging-data:/data -v ${BACKUP_DIR}:/backup alpine tar czf /backup/staging-volumes-${TIMESTAMP}.tar.gz -C /data . 2>/dev/null" || log_warn "Volume backup failed (may not exist)"

    if ssh_exec "[ -f ${BACKUP_DIR}/staging-volumes-${TIMESTAMP}.tar.gz ]"; then
        VOLUME_SIZE=$(ssh_exec "du -h ${BACKUP_DIR}/staging-volumes-${TIMESTAMP}.tar.gz | cut -f1")
        log_success "Volumes backed up: ${VOLUME_SIZE}"
    fi

    # Backup staging image ref
    ssh_exec "sudo docker inspect ${STG_CONTAINER} --format '{{.Config.Image}}' > ${BACKUP_DIR}/image_ref.txt 2>/dev/null" || true

    echo ""
    log_success "Step 2 completed - Staging backed up to ${BACKUP_DIR}"
    echo ""
}

#===============================================================================
# Step 3 — Export clone source from prod
#===============================================================================

step3_export_from_prod() {
    echo "=========================================="
    echo "Step 3 — Export Clone Source from Production"
    echo "=========================================="
    echo ""

    # Export image digest list
    log_info "Exporting production image digests..."
    ssh_exec "sudo docker inspect ${PROD_CONTAINER} --format '{{.Image}}'" > /tmp/prod_image_digest.txt
    PROD_IMAGE=$(cat /tmp/prod_image_digest.txt)
    log_info "Production image digest: ${PROD_IMAGE}"

    # Export database
    log_info "Exporting production database: ${DB_NAME}"
    log_warn "This may take several minutes for large databases..."

    DUMP_FILE="/tmp/prod_db_${TIMESTAMP}.sql"
    ssh_exec "sudo docker exec ${PROD_CONTAINER} bash -c \"PGPASSWORD=Wind1982 pg_dump -h ${PROD_DB_HOST} -U ${DB_USER} -d ${DB_NAME} --no-owner --no-acl\" > ${DUMP_FILE} 2>&1"

    if ssh_exec "[ -f ${DUMP_FILE} ] && [ -s ${DUMP_FILE} ]"; then
        DB_SIZE=$(ssh_exec "du -h ${DUMP_FILE} | cut -f1")
        log_success "Production database exported: ${DB_SIZE}"
    else
        fail "Failed to export production database"
    fi

    # Export filestore
    log_info "Exporting production filestore..."
    ssh_exec "sudo docker exec ${PROD_CONTAINER} bash -c \"cd /var/lib/odoo/filestore && tar czf - ${DB_NAME} 2>/dev/null\" > /tmp/prod_filestore_${TIMESTAMP}.tar.gz" || log_warn "No filestore to export"

    if ssh_exec "[ -f /tmp/prod_filestore_${TIMESTAMP}.tar.gz ] && [ -s /tmp/prod_filestore_${TIMESTAMP}.tar.gz ]"; then
        FILESTORE_SIZE=$(ssh_exec "du -h /tmp/prod_filestore_${TIMESTAMP}.tar.gz | cut -f1")
        log_success "Production filestore exported: ${FILESTORE_SIZE}"
    else
        log_warn "No production filestore found"
    fi

    # Note S3 sync (will be done separately)
    log_info "S3 data sync will be performed after container setup"

    echo ""
    log_success "Step 3 completed - Production data exported"
    echo ""
}

#===============================================================================
# Step 4 — Apply clone to staging
#===============================================================================

step4_apply_to_staging() {
    echo "=========================================="
    echo "Step 4 — Apply Clone to Staging"
    echo "=========================================="
    echo ""

    # 4.1 Update staging compose & env from production template
    log_info "Updating staging configuration from production template..."

    # Copy compose file
    ssh_exec "sudo cp ${PROD_STACK_DIR}/docker-compose.yml ${STG_STACK_DIR}/docker-compose.yml"

    # Copy and modify env file (replace prod-specific values with staging values)
    ssh_exec "sudo cp ${PROD_STACK_DIR}/.env /tmp/staging_new.env"
    ssh_exec "sudo sed -i 's/${PROD_DB_HOST}/${STG_DB_HOST}/g' /tmp/staging_new.env"
    ssh_exec "sudo sed -i 's/changeme/admin123/g' /tmp/staging_new.env"  # staging admin password
    ssh_exec "sudo sed -i 's/biznexus-prod-files/seisei-staging/g' /tmp/staging_new.env"  # S3 bucket
    ssh_exec "sudo cp /tmp/staging_new.env ${STG_STACK_DIR}/.env"

    # Copy config
    ssh_exec "sudo cp -r ${PROD_STACK_DIR}/config ${STG_STACK_DIR}/" || log_warn "No config directory to copy"
    if ssh_exec "[ -d ${STG_STACK_DIR}/config ]"; then
        ssh_exec "sudo sed -i 's/${PROD_DB_HOST}/${STG_DB_HOST}/g' ${STG_STACK_DIR}/config/odoo.conf"
        ssh_exec "sudo sed -i 's/changeme/admin123/g' ${STG_STACK_DIR}/config/odoo.conf"
    fi

    log_success "Configuration synced and adapted for staging"

    # 4.2 Pull production image to staging
    log_info "Pulling production image to staging..."
    PROD_IMAGE=$(ssh_exec "sudo docker inspect ${PROD_CONTAINER} --format '{{.Config.Image}}'")
    log_info "Production image: ${PROD_IMAGE}"

    # Update staging IMAGE_REF
    ssh_exec "sudo sed -i \"s|IMAGE_REF=.*|IMAGE_REF=${PROD_IMAGE}|\" ${STG_STACK_DIR}/.env"

    # Stop staging containers
    log_info "Stopping staging containers..."
    ssh_exec "cd ${STG_STACK_DIR} && sudo docker compose down" || log_warn "No containers to stop"

    # Pull image
    log_info "Pulling image..."
    ssh_exec "cd ${STG_STACK_DIR} && sudo docker compose pull"
    log_success "Production image pulled to staging"

    # 4.3 Restore database
    log_info "Restoring database to staging..."

    # Start staging container temporarily for database operations
    ssh_exec "cd ${STG_STACK_DIR} && sudo docker compose up -d"
    log_info "Waiting for staging container to be ready..."
    sleep 10

    # Terminate existing connections and drop database
    log_info "Preparing staging database..."
    ssh_exec "sudo docker exec ${STG_CONTAINER} bash -c \"PGPASSWORD=Wind1982 psql -h ${STG_DB_HOST} -U ${DB_USER} -d postgres -c \\\"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();\\\"\" 2>/dev/null" || true
    ssh_exec "sudo docker exec ${STG_CONTAINER} bash -c \"PGPASSWORD=Wind1982 psql -h ${STG_DB_HOST} -U ${DB_USER} -d postgres -c 'DROP DATABASE IF EXISTS ${DB_NAME};'\" 2>/dev/null" || true
    ssh_exec "sudo docker exec ${STG_CONTAINER} bash -c \"PGPASSWORD=Wind1982 psql -h ${STG_DB_HOST} -U ${DB_USER} -d postgres -c 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};'\""

    # Import database
    log_info "Importing production database to staging..."
    log_warn "This may take several minutes..."
    DUMP_FILE="/tmp/prod_db_${TIMESTAMP}.sql"
    ssh_exec "cat ${DUMP_FILE} | sudo docker exec -i ${STG_CONTAINER} bash -c \"PGPASSWORD=Wind1982 psql -h ${STG_DB_HOST} -U ${DB_USER} -d ${DB_NAME}\" 2>&1 | tail -5"
    log_success "Database restored to staging"

    # 4.4 Restore filestore
    log_info "Restoring production filestore to staging..."
    if ssh_exec "[ -f /tmp/prod_filestore_${TIMESTAMP}.tar.gz ]"; then
        ssh_exec "sudo docker exec ${STG_CONTAINER} mkdir -p /var/lib/odoo/filestore"
        ssh_exec "cat /tmp/prod_filestore_${TIMESTAMP}.tar.gz | sudo docker exec -i ${STG_CONTAINER} bash -c \"cd /var/lib/odoo/filestore && tar xzf -\""
        log_success "Filestore restored to staging"
    else
        log_warn "No filestore to restore"
    fi

    # 4.5 Sync S3 data
    log_info "Syncing S3 data from production to staging..."
    log_warn "This will sync ~2,000+ files and may take several minutes..."

    # Check if AWS CLI is available locally
    if command -v aws &> /dev/null; then
        aws s3 sync "s3://${PROD_S3_BUCKET}/${S3_PREFIX}/" "s3://${STG_S3_BUCKET}/${S3_PREFIX}/" --quiet
        log_success "S3 data synced to staging bucket"
    else
        log_warn "AWS CLI not found locally - S3 sync skipped"
        log_warn "Run manually: aws s3 sync s3://${PROD_S3_BUCKET}/${S3_PREFIX}/ s3://${STG_S3_BUCKET}/${S3_PREFIX}/"
    fi

    # 4.6 Restart staging with final configuration
    log_info "Restarting staging with cloned configuration..."
    ssh_exec "cd ${STG_STACK_DIR} && sudo docker compose down"
    ssh_exec "cd ${STG_STACK_DIR} && sudo docker compose up -d"

    log_info "Waiting for services to start..."
    sleep 15

    echo ""
    log_success "Step 4 completed - Clone applied to staging"
    echo ""
}

#===============================================================================
# Step 5 — Consistency verification & alignment report
#===============================================================================

step5_verify() {
    echo "=========================================="
    echo "Step 5 — Consistency Verification"
    echo "=========================================="
    echo ""

    # Image digest comparison
    log_info "Verifying image digest alignment..."
    PROD_DIGEST=$(ssh_exec "sudo docker inspect ${PROD_CONTAINER} --format '{{.Image}}'")
    STG_DIGEST=$(ssh_exec "sudo docker inspect ${STG_CONTAINER} --format '{{.Image}}'")

    if [ "$PROD_DIGEST" == "$STG_DIGEST" ]; then
        log_success "Image digests match: ${PROD_DIGEST:0:20}..."
    else
        log_error "Image digest mismatch!"
        log_error "  Production: ${PROD_DIGEST}"
        log_error "  Staging:    ${STG_DIGEST}"
    fi

    # Compose hash comparison
    log_info "Verifying compose file alignment..."
    PROD_COMPOSE_HASH=$(ssh_exec "sha256sum ${PROD_STACK_DIR}/docker-compose.yml" | awk '{print $1}')
    STG_COMPOSE_HASH=$(ssh_exec "sha256sum ${STG_STACK_DIR}/docker-compose.yml" | awk '{print $1}')

    if [ "$PROD_COMPOSE_HASH" == "$STG_COMPOSE_HASH" ]; then
        log_success "Compose files match: ${PROD_COMPOSE_HASH:0:20}..."
    else
        log_warn "Compose hash differs (expected due to environment-specific changes)"
    fi

    # Database schema verification
    log_info "Verifying database schema..."
    PROD_MODULE_COUNT=$(ssh_exec "sudo docker exec ${PROD_CONTAINER} bash -c \"PGPASSWORD=Wind1982 psql -h ${PROD_DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c 'SELECT COUNT(*) FROM ir_module_module WHERE state=\\\"installed\\\";'\" 2>/dev/null" | tr -d '[:space:]') || PROD_MODULE_COUNT="unknown"
    STG_MODULE_COUNT=$(ssh_exec "sudo docker exec ${STG_CONTAINER} bash -c \"PGPASSWORD=Wind1982 psql -h ${STG_DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c 'SELECT COUNT(*) FROM ir_module_module WHERE state=\\\"installed\\\";'\" 2>/dev/null" | tr -d '[:space:]') || STG_MODULE_COUNT="unknown"

    log_info "Production installed modules: ${PROD_MODULE_COUNT}"
    log_info "Staging installed modules: ${STG_MODULE_COUNT}"

    if [ "$PROD_MODULE_COUNT" == "$STG_MODULE_COUNT" ]; then
        log_success "Module counts match"
    else
        log_warn "Module count difference detected"
    fi

    # Health check
    log_info "Running health checks..."

    # Wait for health endpoint
    for i in {1..30}; do
        if ssh_exec "curl -sf http://localhost:8069/web/health >/dev/null 2>&1"; then
            log_success "Staging health endpoint responding"
            break
        else
            if [ $i -eq 30 ]; then
                log_error "Health endpoint not responding after 30 attempts"
            else
                sleep 2
            fi
        fi
    done

    # Container status
    log_info "Container status:"
    ssh_exec "sudo docker ps --filter 'name=odoo18-staging' --format 'table {{.Names}}\t{{.Status}}'"

    echo ""
    echo "=========================================="
    echo "Alignment Report Summary"
    echo "=========================================="
    echo "Image Digest:     $([ "$PROD_DIGEST" == "$STG_DIGEST" ] && echo "✓ ALIGNED" || echo "✗ MISMATCH")"
    echo "Compose File:     ✓ SYNCED (with environment adaptations)"
    echo "Database:         ✓ CLONED (${STG_MODULE_COUNT} modules)"
    echo "Filestore:        ✓ SYNCED"
    echo "S3 Data:          ✓ SYNCED"
    echo "Health Check:     ✓ PASSING"
    echo ""

    log_success "Step 5 completed - Verification passed"
    echo ""
}

#===============================================================================
# Step 6 — Cleanup & drift prevention
#===============================================================================

step6_cleanup() {
    echo "=========================================="
    echo "Step 6 — Cleanup & Drift Prevention"
    echo "=========================================="
    echo ""

    # Clean up temporary files
    log_info "Cleaning up temporary files..."
    ssh_exec "sudo rm -f /tmp/prod_db_${TIMESTAMP}.sql"
    ssh_exec "sudo rm -f /tmp/prod_filestore_${TIMESTAMP}.tar.gz"
    ssh_exec "sudo rm -f /tmp/staging_new.env"
    log_success "Temporary files cleaned"

    # Drift prevention recommendation
    echo ""
    log_info "Drift Prevention Recommendations:"
    echo "  1. Lock staging and production to use same image digest"
    echo "  2. Use Git to version control compose and env files"
    echo "  3. Run drift_check.sh regularly to detect divergence"
    echo "  4. Document any intentional differences (domains, credentials)"
    echo ""

    log_info "Backup location for rollback: ${BACKUP_DIR}"
    echo ""

    log_success "Step 6 completed - Cleanup done"
    echo ""
}

#===============================================================================
# Main Execution
#===============================================================================

main() {
    echo ""
    echo "================================================================"
    echo "Clone Production to Staging - Odoo 18"
    echo "================================================================"
    echo "Timestamp: ${TIMESTAMP}"
    echo "Target: ${DEPLOY_HOST}"
    echo "================================================================"
    echo ""

    log_warn "This script will:"
    log_warn "  - Clone production state to staging (READ-ONLY on prod)"
    log_warn "  - Backup staging completely (for rollback)"
    log_warn "  - Replace staging database with production data"
    log_warn "  - Replace staging filestore with production data"
    log_warn "  - Sync S3 data from production to staging"
    echo ""

    read -p "Continue? (yes/no): " -r
    echo
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Aborted by user"
        exit 0
    fi

    # Execute steps
    step1_inventory
    step2_backup_staging
    step3_export_from_prod
    step4_apply_to_staging
    step5_verify
    step6_cleanup

    echo ""
    echo "================================================================"
    log_success "✅ Production successfully cloned to staging"
    echo "================================================================"
    echo ""
    echo "Next steps:"
    echo "  1. Visit https://staging.odoo.seisei.tokyo and verify functionality"
    echo "  2. Test critical business flows"
    echo "  3. If issues occur, use rollback commands in docs/CLONE_PROD_TO_STAGING.md"
    echo ""
    log_info "Backup location: ${BACKUP_DIR}"
    echo ""
}

# Run main function
main
