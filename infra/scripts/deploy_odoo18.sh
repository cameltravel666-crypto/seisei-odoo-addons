#!/bin/bash
# =============================================================================
# Seisei Odoo 18 Production Deployment Script
# =============================================================================
# Specialized deployment script for Odoo 18 production
# Called by GitHub Actions or manual deployment
#
# Usage: ./deploy_odoo18.sh <image_tag> [operator]
#
# Parameters:
#   image_tag  - Docker image tag (e.g., sha-abc1234)
#   operator   - GitHub username or manual (default: manual)
#
# This script should be installed at /usr/local/bin/deploy_odoo18.sh
# with restricted permissions for the deploy user
# =============================================================================

set -eo pipefail

# Configuration
STACK_DIR="/srv/stacks/odoo18-prod"
HISTORY_LOG="/srv/deployments/history.log"
LAST_GOOD_DIR="/srv/deployments/last_good_sha"
BACKUP_SCRIPT="/srv/scripts/backup-odoo18.sh"

# Parameters
IMAGE_TAG=${1:-latest}
OPERATOR=${2:-manual}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
info() { log "${BLUE}INFO${NC}: $1"; }
success() { log "${GREEN}SUCCESS${NC}: $1"; }
warn() { log "${YELLOW}WARN${NC}: $1"; }
error() { log "${RED}ERROR${NC}: $1"; }

record() {
    local status=$1
    mkdir -p "$(dirname $HISTORY_LOG)"
    echo "$(date -Iseconds) | odoo18-prod | ${IMAGE_TAG} | prod | ${status} | ${OPERATOR}" >> $HISTORY_LOG
}

save_last_good() {
    mkdir -p $LAST_GOOD_DIR
    echo "$IMAGE_TAG" > "$LAST_GOOD_DIR/odoo18-prod"
}

get_last_good() {
    cat "$LAST_GOOD_DIR/odoo18-prod" 2>/dev/null || echo "latest"
}

# Pre-deployment backup
backup() {
    info "Creating pre-deployment backup..."
    if [[ -x "$BACKUP_SCRIPT" ]]; then
        $BACKUP_SCRIPT "pre-deploy-${IMAGE_TAG}" || warn "Backup failed, continuing anyway"
    else
        warn "Backup script not found at $BACKUP_SCRIPT"
    fi
}

# Gate checks
gate_check() {
    info "Running gate checks..."

    # Disk space
    local disk_usage=$(df -h /srv 2>/dev/null | awk 'NR==2 {print $5}' | sed 's/%//' || echo "0")
    if [[ $disk_usage -gt 85 ]]; then
        error "Disk usage is ${disk_usage}% (>85%). Aborting."
        exit 1
    fi

    # Memory
    local mem_available=$(free -m 2>/dev/null | awk 'NR==2 {print $7}' || echo "1024")
    if [[ $mem_available -lt 512 ]]; then
        error "Available memory is ${mem_available}MB (<512MB). Aborting."
        exit 1
    fi

    # Docker
    if ! docker info &>/dev/null; then
        error "Docker is not running"
        exit 1
    fi

    success "Gate checks passed"
}

# Deploy
deploy() {
    cd "$STACK_DIR"

    # Update .env with new image tag
    if grep -q "^ODOO18_IMAGE_TAG=" .env 2>/dev/null; then
        sed -i "s|^ODOO18_IMAGE_TAG=.*|ODOO18_IMAGE_TAG=${IMAGE_TAG}|" .env
    else
        echo "ODOO18_IMAGE_TAG=${IMAGE_TAG}" >> .env
    fi

    info "Pulling image: ghcr.io/*/seisei-odoo18:${IMAGE_TAG}..."
    docker compose pull web 2>/dev/null || docker-compose pull web

    info "Deploying Odoo 18 with tag: ${IMAGE_TAG}..."
    docker compose up -d --remove-orphans 2>/dev/null || docker-compose up -d --remove-orphans

    # Wait for health check
    info "Waiting for health check..."
    local max_wait=120
    local waited=0
    while [[ $waited -lt $max_wait ]]; do
        if docker compose exec -T web curl -sf http://localhost:8069/web/health &>/dev/null; then
            success "Health check passed after ${waited}s"
            return 0
        fi
        sleep 5
        ((waited+=5))
        echo -n "."
    done
    echo ""

    error "Health check failed after ${max_wait}s"
    return 1
}

# Rollback
rollback() {
    local last=$(get_last_good)
    warn "Rolling back to ${last}..."
    IMAGE_TAG=$last deploy
}

# Main
main() {
    echo "============================================"
    info "Odoo 18 Production Deployment"
    info "Image Tag: ${IMAGE_TAG}"
    info "Operator: ${OPERATOR}"
    echo "============================================"

    gate_check
    backup

    if deploy; then
        record "deployed"
        save_last_good
        record "success"
        success "Deployment completed!"

        # Show container status
        docker compose ps 2>/dev/null || docker-compose ps
    else
        record "failed"
        error "Deployment failed"
        warn "Attempting rollback..."
        rollback
        record "rollback"
        exit 1
    fi
}

main
