#!/bin/bash
# =============================================================================
# Preflight Checks - Production-Grade Gatekeeping
# =============================================================================
# Usage: ./preflight.sh <stack> [env]
# Example: ./preflight.sh odoo18-prod prod
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Parse arguments
STACK="${1:-}"
ENV="${2:-prod}"

[ -z "$STACK" ] && fail "Usage: $0 <stack> [env]"

log_step "Preflight Checks: $STACK ($ENV)"

# 1. Check edge network exists
check_network_exists "edge"

# 2. Resolve stack directory
STACK_DIR=$(resolve_stack_dir "$STACK")
log_info "Stack directory: $STACK_DIR"

# 3. Check compose file exists
COMPOSE_FILE="$STACK_DIR/docker-compose.yml"
[ ! -f "$COMPOSE_FILE" ] && fail "Compose file not found: $COMPOSE_FILE"

# 4. Validate compose syntax
validate_compose "$STACK_DIR"

# 5. Check no build directives
check_no_build "$COMPOSE_FILE"

# 6. Check no :latest tags (except staging)
if [ "$ENV" != "staging" ]; then
    check_no_latest "$COMPOSE_FILE"
fi

# 7. Check disk space
check_disk_space 80

# 8. Check required commands
for cmd in docker jq curl; do
    require_cmd "$cmd"
done

log_success "✅ All preflight checks passed for $STACK"
exit 0
