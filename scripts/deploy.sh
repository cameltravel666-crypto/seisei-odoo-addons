#!/bin/bash
# =============================================================================
# Deploy Script - Production-Grade Deployment with Promotion
# =============================================================================
# Usage: ./deploy.sh <stack> <env> <version> [--force]
# Example: ./deploy.sh odoo18-staging staging sha-19b9b98
# Example: ./deploy.sh odoo18-prod prod sha-19b9b98
# Example: ./deploy.sh odoo18-prod prod sha-abc123 --force
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Help
if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: $0 <stack> <env> <version> [--force]"
    echo ""
    echo "Examples:"
    echo "  $0 odoo18-staging staging sha-19b9b98"
    echo "  $0 odoo18-prod prod sha-19b9b98"
    echo "  $0 odoo18-prod prod sha-abc123 --force  # Skip promotion check"
    echo ""
    echo "Environment:"
    echo "  staging - Allows :latest, writes verified version on success"
    echo "  prod    - Requires verified version (from staging), strict checks"
    exit 0
fi

# Parse arguments
STACK="${1:-}"
ENV="${2:-prod}"
VERSION="${3:-}"
FORCE=false

[ -z "$STACK" ] && fail "Usage: $0 <stack> <env> <version> [--force]"
[ -z "$VERSION" ] && fail "Usage: $0 <stack> <env> <version> [--force]"

shift 3
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        *)
            fail "Unknown argument: $1"
            ;;
    esac
done

log_step "Deploy: $STACK ($ENV) [$VERSION]"
[ "$FORCE" = true ] && log_warn "FORCE MODE ENABLED - Skipping promotion check"

STACK_DIR=$(resolve_stack_dir "$STACK")

# Step 1: Preflight checks
log_step "Step 1: Preflight Checks"
"$SCRIPT_DIR/preflight.sh" "$STACK" "$ENV" || fail "Preflight checks failed"

# Step 2: Promotion check (production only)
if [ "$ENV" = "prod" ]; then
    log_step "Step 2: Promotion Verification"
    check_verified "$STACK" "$VERSION" "$FORCE" || fail "Promotion check failed"
else
    log_info "Step 2: Skipping promotion check (staging environment)"
fi

# Step 3: Backup
log_step "Step 3: Backup"
BACKUP_PATH=$("$SCRIPT_DIR/backup.sh" "$STACK" "$ENV") || fail "Backup failed"
log_success "Backup completed: $BACKUP_PATH"

# Step 4: Update configuration
log_step "Step 4: Update Configuration"
cd "$STACK_DIR" || fail "Cannot cd to $STACK_DIR"

# Determine version variable
case "$STACK" in
    odoo18-*|odoo18_*)
        VERSION_VAR="ODOO18_IMAGE_TAG"
        ;;
    ocr)
        VERSION_VAR="OCR_IMAGE_TAG"
        ;;
    web-seisei)
        VERSION_VAR="WWW_IMAGE_TAG"
        ;;
    langbot)
        VERSION_VAR="LANGBOT_IMAGE_TAG"
        ;;
    *)
        VERSION_VAR="VERSION"
        ;;
esac

# Update .env
if [ -f .env ]; then
    cp .env .env.backup
    if grep -q "^${VERSION_VAR}=" .env; then
        sed -i "s/^${VERSION_VAR}=.*/${VERSION_VAR}=${VERSION}/" .env
    else
        echo "${VERSION_VAR}=${VERSION}" >> .env
    fi
    log_success "Updated .env: ${VERSION_VAR}=${VERSION}"
else
    log_warn ".env not found, creating..."
    echo "${VERSION_VAR}=${VERSION}" > .env
fi

# Step 5: Pull image
log_step "Step 5: Pull Docker Image"
if ! docker compose pull; then
    log_error "Failed to pull image"
    mv .env.backup .env 2>/dev/null || true
    fail "Image pull failed"
fi
log_success "Image pulled successfully"

# Step 6: Deploy
log_step "Step 6: Deploy Containers"
if ! docker compose up -d --force-recreate; then
    log_error "Deployment failed"
    "$SCRIPT_DIR/rollback.sh" "$STACK" "$ENV" || true
    fail "Container deployment failed, rollback attempted"
fi
log_success "Containers deployed"

# Step 7: Wait and smoke test
log_step "Step 7: Smoke Tests"
log_info "Waiting 15 seconds for services to stabilize..."
sleep 15

if ! "$SCRIPT_DIR/smoke.sh" "$STACK" "$ENV" "$VERSION"; then
    log_error "Smoke tests failed"
    "$SCRIPT_DIR/rollback.sh" "$STACK" "$ENV" || true
    fail "Smoke tests failed, rollback attempted"
fi
log_success "Smoke tests passed"

# Step 8: Success actions
log_step "Step 8: Post-Deployment"

# Write deployment history
NOTES=""
[ "$FORCE" = true ] && NOTES="FORCED"
write_history "$STACK" "$ENV" "$VERSION" "deploy" "success" "$NOTES"
log_success "Deployment recorded in history"

# Mark as verified (staging only)
if [ "$ENV" = "staging" ]; then
    mark_verified "$STACK" "$VERSION"
    log_success "Version marked as verified for production"
fi

# Cleanup
rm -f .env.backup

log_step "✅ DEPLOYMENT SUCCESSFUL"
echo ""
echo "Stack:       $STACK"
echo "Environment: $ENV"
echo "Version:     $VERSION"
echo "Backup:      $BACKUP_PATH"
echo ""
log_success "Deployment completed successfully!"
exit 0
