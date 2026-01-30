#!/bin/bash
# =============================================================================
# Rollback Script - Production-Grade Rollback
# =============================================================================
# Usage: ./rollback.sh <stack> <env> [--to <version> | --steps <n>]
# Example: ./rollback.sh odoo18-prod prod
# Example: ./rollback.sh odoo18-prod prod --to sha-4b1ce21
# Example: ./rollback.sh odoo18-prod prod --steps 2
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Help
if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: $0 <stack> <env> [--to <version> | --steps <n>]"
    echo "Example: $0 odoo18-prod prod"
    echo "Example: $0 odoo18-prod prod --to sha-4b1ce21"
    echo "Example: $0 odoo18-prod prod --steps 2"
    exit 0
fi

# Parse arguments
STACK="${1:-}"
ENV="${2:-prod}"
TARGET_VERSION=""
STEPS_BACK=""

[ -z "$STACK" ] && fail "Usage: $0 <stack> <env> [--to <version> | --steps <n>]"

shift 2
while [[ $# -gt 0 ]]; do
    case $1 in
        --to)
            TARGET_VERSION="$2"
            shift 2
            ;;
        --steps)
            STEPS_BACK="$2"
            shift 2
            ;;
        *)
            fail "Unknown argument: $1"
            ;;
    esac
done

# Validate --to and --steps are mutually exclusive
if [[ -n "$TARGET_VERSION" ]] && [[ -n "$STEPS_BACK" ]]; then
    fail "Cannot use --to and --steps together"
fi

log_step "Rollback: $STACK ($ENV)"

STACK_DIR=$(resolve_stack_dir "$STACK")
cd "$STACK_DIR" || fail "Cannot cd to $STACK_DIR"

# Determine rollback version
if [ -z "$TARGET_VERSION" ]; then
    if [ -n "$STEPS_BACK" ]; then
        log_info "Finding deployment $STEPS_BACK steps back..."
        # Get Nth successful deployment from history
        TARGET_VERSION=$(grep "| $STACK | $ENV | deploy | .* | success |" "$HISTORY_FILE" 2>/dev/null | \
            tail -n "+$((STEPS_BACK + 1))" | head -1 | \
            awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $5); print $5}')

        if [ -z "$TARGET_VERSION" ]; then
            fail "No deployment found $STEPS_BACK steps back in history"
        fi

        log_info "Rollback target ($STEPS_BACK steps back): $TARGET_VERSION"
    else
        log_info "Finding last successful deployment..."
        TARGET_VERSION=$(get_last_deployment "$STACK" "$ENV")

        if [ -z "$TARGET_VERSION" ]; then
            fail "No previous successful deployment found in history"
        fi

        log_info "Rollback target (from history): $TARGET_VERSION"
    fi
else
    log_info "Rollback target (manual): $TARGET_VERSION"
fi

# Get current version
CURRENT_IMAGE=$(get_current_image "$STACK")
CURRENT_VERSION=$(extract_tag "$CURRENT_IMAGE")
log_info "Current version: $CURRENT_VERSION"

if [ "$CURRENT_VERSION" = "$TARGET_VERSION" ]; then
    log_warn "Already at target version: $TARGET_VERSION"
    exit 0
fi

# Update version in .env or compose
log_info "Updating version configuration..."

# Determine version variable name based on stack
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
    *)
        VERSION_VAR="VERSION"
        ;;
esac

# Update .env if exists
if [ -f .env ]; then
    if grep -q "^${VERSION_VAR}=" .env; then
        sed -i "s/^${VERSION_VAR}=.*/${VERSION_VAR}=${TARGET_VERSION}/" .env
        log_success "Updated .env: ${VERSION_VAR}=${TARGET_VERSION}"
    else
        echo "${VERSION_VAR}=${TARGET_VERSION}" >> .env
        log_success "Added to .env: ${VERSION_VAR}=${TARGET_VERSION}"
    fi
else
    log_warn ".env not found, version may need manual configuration"
fi

# Pull target version
log_info "Pulling image: $TARGET_VERSION..."
if ! docker compose pull; then
    fail "Failed to pull image $TARGET_VERSION"
fi

# Recreate containers
log_info "Recreating containers..."
if ! docker compose up -d --force-recreate; then
    fail "Failed to recreate containers"
fi

# Wait for startup
log_info "Waiting for services to start..."
sleep 10

# Run smoke tests
log_info "Running smoke tests..."
if ! "$SCRIPT_DIR/smoke.sh" "$STACK" "$ENV" "$TARGET_VERSION"; then
    fail "Smoke tests failed after rollback"
fi

# Write history
write_history "$STACK" "$ENV" "$TARGET_VERSION" "rollback" "success" "from $CURRENT_VERSION"

log_success "✅ Rollback completed: $CURRENT_VERSION → $TARGET_VERSION"
exit 0
