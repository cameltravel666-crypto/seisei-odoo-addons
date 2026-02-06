#!/bin/bash
#===============================================================================
# Drift Check: Production vs Staging
#===============================================================================
# Purpose: Detect configuration and state drift between prod and staging
# Usage: ./scripts/drift_check_prod_staging.sh
#
# This script compares:
# - Docker image digests
# - Compose file hashes
# - Environment variable hashes (sanitized)
# - Running container status
# - Module installation status
#===============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SSH_KEY="/Users/taozhang/Projects/Pem/odoo-2025.pem"
DEPLOY_HOST="54.65.127.141"
DEPLOY_USER="ubuntu"

PROD_STACK_DIR="/srv/stacks/odoo18-prod"
STG_STACK_DIR="/srv/stacks/odoo18-staging"

PROD_CONTAINER="odoo18-prod-web"
STG_CONTAINER="odoo18-staging-web"

PROD_DB_HOST="seisei-odoo18-prod-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com"
STG_DB_HOST="seisei-odoo18-staging-rds.c1emceusojse.ap-northeast-1.rds.amazonaws.com"
DB_NAME="ten_testodoo"
DB_USER="odoo18"

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

ssh_exec() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "${DEPLOY_USER}@${DEPLOY_HOST}" "$@"
}

#===============================================================================
# Drift Checks
#===============================================================================

echo ""
echo "================================================================"
echo "Drift Check: Production vs Staging"
echo "================================================================"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================"
echo ""

DRIFT_DETECTED=0

# 1. Image Digest Check
echo "1. Checking Image Digests..."
PROD_IMAGE=$(ssh_exec "sudo docker inspect ${PROD_CONTAINER} --format '{{.Image}}' 2>/dev/null" || echo "ERROR")
STG_IMAGE=$(ssh_exec "sudo docker inspect ${STG_CONTAINER} --format '{{.Image}}' 2>/dev/null" || echo "ERROR")

echo "   Production: ${PROD_IMAGE:0:80}"
echo "   Staging:    ${STG_IMAGE:0:80}"

if [ "$PROD_IMAGE" == "$STG_IMAGE" ] && [ "$PROD_IMAGE" != "ERROR" ]; then
    log_success "Image digests match"
else
    log_error "Image digest DRIFT detected"
    DRIFT_DETECTED=1
fi
echo ""

# 2. Compose File Hash Check
echo "2. Checking Compose File Hashes..."
PROD_COMPOSE_HASH=$(ssh_exec "sha256sum ${PROD_STACK_DIR}/docker-compose.yml 2>/dev/null" | awk '{print $1}' || echo "ERROR")
STG_COMPOSE_HASH=$(ssh_exec "sha256sum ${STG_STACK_DIR}/docker-compose.yml 2>/dev/null" | awk '{print $1}' || echo "ERROR")

echo "   Production: ${PROD_COMPOSE_HASH}"
echo "   Staging:    ${STG_COMPOSE_HASH}"

if [ "$PROD_COMPOSE_HASH" == "$STG_COMPOSE_HASH" ]; then
    log_success "Compose files match"
else
    log_warn "Compose file difference detected (may be intentional for environment-specific settings)"
fi
echo ""

# 3. Environment Variable Hash Check (Sanitized)
echo "3. Checking Environment Variables (sanitized)..."
PROD_ENV_HASH=$(ssh_exec "grep -v -E '^(PASSWORD|KEY|SECRET|DB_HOST)=' ${PROD_STACK_DIR}/.env 2>/dev/null | sort | sha256sum" | awk '{print $1}' || echo "ERROR")
STG_ENV_HASH=$(ssh_exec "grep -v -E '^(PASSWORD|KEY|SECRET|DB_HOST)=' ${STG_STACK_DIR}/.env 2>/dev/null | sort | sha256sum" | awk '{print $1}' || echo "ERROR")

echo "   Production: ${PROD_ENV_HASH}"
echo "   Staging:    ${STG_ENV_HASH}"

if [ "$PROD_ENV_HASH" == "$STG_ENV_HASH" ]; then
    log_success "Environment variables match (excluding secrets)"
else
    log_warn "Environment variable difference detected (excluding secrets)"
    echo "   Run diff to see details:"
    echo "   ssh -i ${SSH_KEY} ${DEPLOY_USER}@${DEPLOY_HOST} \"diff -u <(grep -v -E '^(PASSWORD|KEY|SECRET|DB_HOST)=' ${PROD_STACK_DIR}/.env | sort) <(grep -v -E '^(PASSWORD|KEY|SECRET|DB_HOST)=' ${STG_STACK_DIR}/.env | sort)\""
fi
echo ""

# 4. Container Status Check
echo "4. Checking Container Status..."
PROD_STATUS=$(ssh_exec "sudo docker inspect ${PROD_CONTAINER} --format '{{.State.Status}}' 2>/dev/null" || echo "ERROR")
STG_STATUS=$(ssh_exec "sudo docker inspect ${STG_CONTAINER} --format '{{.State.Status}}' 2>/dev/null" || echo "ERROR")

echo "   Production: ${PROD_STATUS}"
echo "   Staging:    ${STG_STATUS}"

if [ "$PROD_STATUS" == "running" ] && [ "$STG_STATUS" == "running" ]; then
    log_success "Both containers running"
else
    log_error "Container status issue detected"
    DRIFT_DETECTED=1
fi
echo ""

# 5. Database Module Count Check
echo "5. Checking Installed Odoo Modules..."
PROD_MODULES=$(ssh_exec "sudo docker exec ${PROD_CONTAINER} bash -c \"PGPASSWORD=Wind1982 psql -h ${PROD_DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c 'SELECT COUNT(*) FROM ir_module_module WHERE state=\\\"installed\\\";'\" 2>/dev/null" | tr -d '[:space:]' || echo "ERROR")
STG_MODULES=$(ssh_exec "sudo docker exec ${STG_CONTAINER} bash -c \"PGPASSWORD=Wind1982 psql -h ${STG_DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c 'SELECT COUNT(*) FROM ir_module_module WHERE state=\\\"installed\\\";'\" 2>/dev/null" | tr -d '[:space:]' || echo "ERROR")

echo "   Production: ${PROD_MODULES} modules"
echo "   Staging:    ${STG_MODULES} modules"

if [ "$PROD_MODULES" == "$STG_MODULES" ] && [ "$PROD_MODULES" != "ERROR" ]; then
    log_success "Module counts match"
else
    log_error "Module count DRIFT detected"
    DRIFT_DETECTED=1
fi
echo ""

# 6. Health Check
echo "6. Checking Health Endpoints..."
PROD_HEALTH=$(ssh_exec "curl -sf -o /dev/null -w '%{http_code}' http://localhost:8069/web/health 2>/dev/null" || echo "ERROR")
STG_HEALTH=$(ssh_exec "curl -sf -o /dev/null -w '%{http_code}' http://localhost:8069/web/health 2>/dev/null" || echo "ERROR")

echo "   Production: HTTP ${PROD_HEALTH}"
echo "   Staging:    HTTP ${STG_HEALTH}"

if [ "$PROD_HEALTH" == "200" ] && [ "$STG_HEALTH" == "200" ]; then
    log_success "Both health endpoints responding"
else
    log_error "Health endpoint issue detected"
    DRIFT_DETECTED=1
fi
echo ""

# 7. Volume Size Check
echo "7. Checking Data Volume Sizes..."
PROD_VOLUME_SIZE=$(ssh_exec "sudo docker run --rm -v odoo18-prod-data:/data alpine du -sh /data 2>/dev/null | cut -f1" || echo "ERROR")
STG_VOLUME_SIZE=$(ssh_exec "sudo docker run --rm -v odoo18-staging-data:/data alpine du -sh /data 2>/dev/null | cut -f1" || echo "ERROR")

echo "   Production: ${PROD_VOLUME_SIZE}"
echo "   Staging:    ${STG_VOLUME_SIZE}"

if [ "$PROD_VOLUME_SIZE" != "ERROR" ] && [ "$STG_VOLUME_SIZE" != "ERROR" ]; then
    log_success "Volume sizes retrieved"
else
    log_warn "Could not retrieve volume sizes"
fi
echo ""

#===============================================================================
# Summary Report
#===============================================================================

echo "================================================================"
echo "Drift Check Summary"
echo "================================================================"
echo ""

if [ $DRIFT_DETECTED -eq 0 ]; then
    log_success "✅ No critical drift detected"
    echo ""
    echo "Production and Staging are aligned."
    echo "Minor differences in environment variables and compose files are acceptable"
    echo "for environment-specific settings (domains, credentials, etc.)."
else
    log_error "⚠️  CRITICAL DRIFT DETECTED"
    echo ""
    echo "Action required:"
    echo "  1. Review differences above"
    echo "  2. If drift is unintentional, re-run clone script:"
    echo "     ./scripts/clone_prod_to_staging.sh"
    echo "  3. If drift is intentional, document in docs/CLONE_PROD_TO_STAGING.md"
fi

echo ""
echo "================================================================"
echo ""

exit $DRIFT_DETECTED
