#!/bin/bash
# =============================================================================
# Sync to /srv/stacks - Unify Runtime Directories
# =============================================================================
# Usage: ./sync_to_srv.sh <stack>
# Example: ./sync_to_srv.sh odoo18-prod
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Help
if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: $0 <stack>"
    echo "Example: $0 odoo18-prod"
    echo ""
    echo "Syncs source directory to /srv/stacks/<stack>"
    exit 0
fi

STACK="${1:-}"
[ -z "$STACK" ] && fail "Usage: $0 <stack>"

# Source directory mapping
declare -A SOURCE_MAP=(
    ["odoo18-prod"]="/opt/seisei-odoo-addons/infra/stacks/odoo18-prod"
    ["odoo18-staging"]="/opt/seisei-odoo-addons/infra/stacks/odoo18-staging"
    ["web-seisei"]="/home/ubuntu/biznexus/infra/stacks/web-seisei"
    ["edge-traefik"]="/srv/stacks/edge-traefik"  # Already in place
    ["langbot"]="/srv/stacks/langbot"            # Already in place
    ["ocr"]="/srv/stacks/ocr"                    # Already in place
)

if [[ ! -v SOURCE_MAP["$STACK"] ]]; then
    fail "Unknown stack: $STACK. Known stacks: ${!SOURCE_MAP[*]}"
fi

SOURCE_DIR="${SOURCE_MAP[$STACK]}"
TARGET_DIR="/srv/stacks/$STACK"

log_step "Sync: $STACK"
log_info "Source: $SOURCE_DIR"
log_info "Target: $TARGET_DIR"

# Check source exists
if [ ! -d "$SOURCE_DIR" ]; then
    fail "Source directory not found: $SOURCE_DIR"
fi

# Create target directory
mkdir -p "$TARGET_DIR"

# Preserve existing .env
ENV_BACKUP=""
if [ -f "$TARGET_DIR/.env" ]; then
    ENV_BACKUP=$(mktemp)
    cp "$TARGET_DIR/.env" "$ENV_BACKUP"
    log_info "Preserved existing .env"
fi

# Sync files (exclude volumes and sensitive data)
log_info "Syncing files..."
rsync -av --delete \
    --exclude='.env' \
    --exclude='volumes/' \
    --exclude='data/' \
    --exclude='*.log' \
    --exclude='.git/' \
    "$SOURCE_DIR/" "$TARGET_DIR/" || fail "Rsync failed"

# Restore .env
if [ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ]; then
    mv "$ENV_BACKUP" "$TARGET_DIR/.env"
    log_success "Restored existing .env"
elif [ -f "$SOURCE_DIR/.env.example" ] && [ ! -f "$TARGET_DIR/.env" ]; then
    cp "$SOURCE_DIR/.env.example" "$TARGET_DIR/.env"
    log_warn "Copied .env.example to .env - PLEASE CONFIGURE IT"
fi

log_success "✅ Sync completed: $SOURCE_DIR → $TARGET_DIR"
exit 0
