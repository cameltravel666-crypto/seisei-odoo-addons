#!/bin/bash
# =============================================================================
# Rollback Script - Image as Source of Truth (Release Directory Switching)
# =============================================================================
# Usage: ./rollback.sh <stack> <env> --steps <n> [OPTIONS]
#
# Required Arguments:
#   <stack>         Stack name (e.g., odoo18-prod, erp-seisei)
#   <env>           Environment: staging | production
#   --steps <n>     Number of successful deployments to go back (default: 1)
#
# Optional Arguments:
#   --to <release>  Target specific release_id (overrides --steps)
#   --actor "name"  GitHub actor or user email for audit trail
#   --run-id "id"   GitHub run ID or manual identifier
#
# Examples:
#   # Rollback 1 deployment back
#   ./rollback.sh odoo18-prod production --steps 1 \
#       --actor "oncall" --run-id "manual"
#
#   # Rollback 2 deployments back
#   ./rollback.sh odoo18-staging staging --steps 2
#
#   # Rollback to specific release
#   ./rollback.sh erp-seisei production --to sha-abc123__20260131T120000Z
#
# Key Behaviors:
# 1. Finds target release from deployment history or current manifest
# 2. Atomically switches /srv/stacks/<stack> symlink to target release_dir
# 3. Pulls image and recreates containers in target release directory
# 4. Runs smoke tests - if fail, auto-retry with earlier releases (max 3 attempts)
# 5. Writes current manifest after successful rollback
# 6. Does NOT modify source code in /opt, only switches runtime state
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# =============================================================================
# Help and Usage
# =============================================================================
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    cat << 'EOF'
Rollback Script - Image as Source of Truth

Usage: rollback.sh <stack> <env> --steps <n> [OPTIONS]

Required:
  <stack>         Stack name (odoo18-prod, odoo18-staging, erp-seisei, etc.)
  <env>           Environment: staging | production
  --steps <n>     Go back N successful deployments (default: 1)

Optional:
  --to RELEASE    Target specific release_id (e.g., sha-abc123__20260131T120000Z)
  --actor "NAME"  GitHub actor or user email for audit trail
  --run-id "ID"   GitHub run ID or manual identifier

Examples:
  # Rollback to previous deployment
  rollback.sh odoo18-prod production --steps 1

  # Rollback 2 deployments back
  rollback.sh odoo18-staging staging --steps 2 \
      --actor "github-actions" --run-id "789012"

  # Rollback to specific release
  rollback.sh erp-seisei production --to sha-abc123__20260131T120000Z \
      --actor "oncall@example.com" --run-id "emergency"

Auto-Recovery:
  If smoke tests fail after rollback, script will automatically try rolling
  back to even earlier releases (up to 3 total attempts before giving up).

EOF
    exit 0
fi

# =============================================================================
# Parse Arguments
# =============================================================================
STACK="${1:-}"
ENV="${2:-}"
STEPS_BACK=1
TARGET_RELEASE=""
ACTOR="unknown"
RUN_ID="unknown"

# Validate required positional arguments
[ -z "$STACK" ] && fail "Missing required argument: <stack>"
[ -z "$ENV" ] && fail "Missing required argument: <env>"

# Validate environment
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    fail "Invalid environment '$ENV'. Must be 'staging' or 'production'"
fi

# Parse optional arguments
shift 2
while [[ $# -gt 0 ]]; do
    case $1 in
        --steps)
            STEPS_BACK="${2:-1}"
            [ -z "$STEPS_BACK" ] && fail "--steps requires a number argument"
            shift 2
            ;;
        --to)
            TARGET_RELEASE="${2:-}"
            [ -z "$TARGET_RELEASE" ] && fail "--to requires a release_id argument"
            shift 2
            ;;
        --actor)
            ACTOR="${2:-unknown}"
            shift 2
            ;;
        --run-id)
            RUN_ID="${2:-unknown}"
            shift 2
            ;;
        *)
            fail "Unknown argument: $1"
            ;;
    esac
done

# Validate --to and --steps are mutually exclusive
if [[ -n "$TARGET_RELEASE" ]] && [[ "$STEPS_BACK" != "1" ]]; then
    fail "Cannot use both --to and --steps together"
fi

# =============================================================================
# Configuration
# =============================================================================
RELEASES_BASE="/srv/releases"
STACKS_BASE="/srv/stacks"
CURRENT_DIR="$RELEASES_BASE/current"
HISTORY_FILE="$RELEASES_BASE/deploy_history.log"
SYMLINK_TARGET="$STACKS_BASE/$STACK"

# =============================================================================
# Step 0: Display Rollback Info
# =============================================================================
log_step "🔄 ROLLBACK: $STACK ($ENV)"
echo "  Stack:        $STACK"
echo "  Environment:  $ENV"
if [ -n "$TARGET_RELEASE" ]; then
    echo "  Target:       $TARGET_RELEASE (specific)"
else
    echo "  Steps Back:   $STEPS_BACK"
fi
echo "  Actor:        $ACTOR"
echo "  Run_ID:       $RUN_ID"
echo ""

# =============================================================================
# Step 1: Find Target Release
# =============================================================================
log_step "Step 1: Find Target Release"

# Get current release info
CURRENT_MANIFEST="$CURRENT_DIR/${STACK}.json"
if [ -f "$CURRENT_MANIFEST" ]; then
    CURRENT_RELEASE_ID=$(jq -r '.release_id // empty' "$CURRENT_MANIFEST" 2>/dev/null || echo "")
    CURRENT_IMAGE_TAG=$(jq -r '.image_tag // empty' "$CURRENT_MANIFEST" 2>/dev/null || echo "")
    log_info "Current release: $CURRENT_RELEASE_ID (tag: $CURRENT_IMAGE_TAG)"
else
    log_warn "Current manifest not found: $CURRENT_MANIFEST"
    CURRENT_RELEASE_ID="unknown"
    CURRENT_IMAGE_TAG="unknown"
fi

# Find target release
if [ -n "$TARGET_RELEASE" ]; then
    # Use specific release
    TARGET_RELEASE_ID="$TARGET_RELEASE"
    TARGET_RELEASE_DIR="$RELEASES_BASE/stacks/$STACK/$TARGET_RELEASE_ID"

    if [ ! -d "$TARGET_RELEASE_DIR" ]; then
        fail "Target release directory not found: $TARGET_RELEASE_DIR"
    fi

    log_success "Target release (manual): $TARGET_RELEASE_ID"
else
    # Find from history - go back N successful deployments
    log_info "Searching deployment history for $STEPS_BACK steps back..."

    if [ ! -f "$HISTORY_FILE" ]; then
        fail "Deployment history not found: $HISTORY_FILE"
    fi

    # Extract all successful deployments for this stack/env, newest first
    # Expected format: <timestamp> <stack> <env> <image_tag> <action> <result> ...
    # We need to skip current deployment and go back N steps

    HISTORY_RELEASES=$(grep " $STACK $ENV " "$HISTORY_FILE" | \
        grep " deploy success " | \
        tail -n "+$((STEPS_BACK + 1))" | \
        head -n 5 || true)

    if [ -z "$HISTORY_RELEASES" ]; then
        log_error "No deployment found $STEPS_BACK steps back in history"
        log_error "History file: $HISTORY_FILE"
        fail "Cannot find target deployment in history"
    fi

    # Get the target deployment (first match after skipping N)
    TARGET_IMAGE_TAG=$(echo "$HISTORY_RELEASES" | head -n 1 | awk '{print $4}')

    if [ -z "$TARGET_IMAGE_TAG" ]; then
        fail "Failed to parse image_tag from history"
    fi

    log_info "Target image tag from history: $TARGET_IMAGE_TAG"

    # Find the most recent release_id for this image_tag
    TARGET_RELEASE_DIR=$(find "$RELEASES_BASE/stacks/$STACK" -maxdepth 1 -type d -name "${TARGET_IMAGE_TAG}__*" | sort -r | head -n 1 || true)

    if [ -z "$TARGET_RELEASE_DIR" ] || [ ! -d "$TARGET_RELEASE_DIR" ]; then
        log_error "Release directory not found for tag: $TARGET_IMAGE_TAG"
        log_error "Expected pattern: $RELEASES_BASE/stacks/$STACK/${TARGET_IMAGE_TAG}__*"
        fail "Cannot find release directory for target deployment"
    fi

    TARGET_RELEASE_ID=$(basename "$TARGET_RELEASE_DIR")
    log_success "Target release ($STEPS_BACK steps back): $TARGET_RELEASE_ID"
fi

# Validate target release directory exists
if [ ! -d "$TARGET_RELEASE_DIR" ]; then
    fail "Target release directory does not exist: $TARGET_RELEASE_DIR"
fi

if [ ! -f "$TARGET_RELEASE_DIR/docker-compose.yml" ]; then
    fail "docker-compose.yml not found in target release: $TARGET_RELEASE_DIR"
fi

echo ""

# =============================================================================
# Step 2: Atomic Symlink Switch
# =============================================================================
log_step "Step 2: Atomic Symlink Switch"

# Check if already at target
if [ -L "$SYMLINK_TARGET" ]; then
    CURRENT_TARGET=$(readlink -f "$SYMLINK_TARGET" || readlink "$SYMLINK_TARGET")
    if [ "$CURRENT_TARGET" = "$TARGET_RELEASE_DIR" ]; then
        log_warn "Already at target release: $TARGET_RELEASE_ID"
        log_success "No rollback needed"
        exit 0
    fi
    log_info "Current symlink: $SYMLINK_TARGET -> $CURRENT_TARGET"
fi

# Atomic symlink switch
log_info "Switching $SYMLINK_TARGET -> $TARGET_RELEASE_DIR ..."
ln -sfn "$TARGET_RELEASE_DIR" "$SYMLINK_TARGET" || fail "Failed to update symlink"
log_success "Symlink updated: $SYMLINK_TARGET -> $TARGET_RELEASE_DIR"

# Verify symlink
ACTUAL_TARGET=$(readlink -f "$SYMLINK_TARGET" || readlink "$SYMLINK_TARGET")
if [ "$ACTUAL_TARGET" != "$TARGET_RELEASE_DIR" ]; then
    fail "Symlink verification failed: expected $TARGET_RELEASE_DIR, got $ACTUAL_TARGET"
fi
log_success "Symlink verified"

echo ""

# =============================================================================
# Step 3: Pull Image and Deploy with Auto-Retry
# =============================================================================
log_step "Step 3: Pull Image and Deploy"

MAX_RETRIES=3
RETRY_COUNT=0
ROLLBACK_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if [ $RETRY_COUNT -gt 0 ]; then
        log_warn "Retry attempt $RETRY_COUNT of $MAX_RETRIES..."
        log_info "Rolling back one more step to older release..."

        # Find next older release
        STEPS_BACK=$((STEPS_BACK + 1))
        HISTORY_RELEASES=$(grep " $STACK $ENV " "$HISTORY_FILE" | \
            grep " deploy success " | \
            tail -n "+$((STEPS_BACK + 1))" | \
            head -n 1 || true)

        if [ -z "$HISTORY_RELEASES" ]; then
            log_error "No more deployments to try in history"
            break
        fi

        TARGET_IMAGE_TAG=$(echo "$HISTORY_RELEASES" | awk '{print $4}')
        TARGET_RELEASE_DIR=$(find "$RELEASES_BASE/stacks/$STACK" -maxdepth 1 -type d -name "${TARGET_IMAGE_TAG}__*" | sort -r | head -n 1 || true)

        if [ -z "$TARGET_RELEASE_DIR" ] || [ ! -d "$TARGET_RELEASE_DIR" ]; then
            log_error "Release directory not found for older deployment: $TARGET_IMAGE_TAG"
            break
        fi

        TARGET_RELEASE_ID=$(basename "$TARGET_RELEASE_DIR")
        log_info "Trying older release: $TARGET_RELEASE_ID"

        # Update symlink to older release
        ln -sfn "$TARGET_RELEASE_DIR" "$SYMLINK_TARGET" || fail "Failed to update symlink to older release"
    fi

    cd "$SYMLINK_TARGET" || fail "Cannot cd to $SYMLINK_TARGET"

    # Pull image
    log_info "Pulling image from release directory..."
    if ! docker compose pull; then
        log_error "Failed to pull image"
        RETRY_COUNT=$((RETRY_COUNT + 1))
        continue
    fi
    log_success "Image pulled successfully"

    # Recreate containers
    log_info "Recreating containers (force-recreate)..."
    if ! docker compose up -d --force-recreate; then
        log_error "Failed to recreate containers"
        RETRY_COUNT=$((RETRY_COUNT + 1))
        continue
    fi
    log_success "Containers recreated"

    # Wait for stabilization
    log_info "Waiting 15 seconds for services to stabilize..."
    sleep 15

    # Smoke tests
    if [ -f "$SCRIPT_DIR/smoke.sh" ]; then
        log_info "Running smoke tests..."
        if ! "$SCRIPT_DIR/smoke.sh" "$STACK" "$ENV" "$(basename "$TARGET_RELEASE_DIR" | cut -d'_' -f1)"; then
            log_error "Smoke tests failed for release: $TARGET_RELEASE_ID"
            RETRY_COUNT=$((RETRY_COUNT + 1))
            continue
        fi
        log_success "Smoke tests passed"
    else
        log_warn "smoke.sh not found, performing basic health check..."
        CONTAINER_NAME=$(docker compose ps -q | head -n1)
        if [ -z "$CONTAINER_NAME" ]; then
            log_error "No containers found"
            RETRY_COUNT=$((RETRY_COUNT + 1))
            continue
        fi

        if ! docker inspect "$CONTAINER_NAME" --format='{{.State.Status}}' | grep -q "running"; then
            log_error "Container is not running"
            RETRY_COUNT=$((RETRY_COUNT + 1))
            continue
        fi
        log_success "Basic health check passed"
    fi

    # Success!
    ROLLBACK_SUCCESS=true
    break
done

if [ "$ROLLBACK_SUCCESS" = false ]; then
    log_error "❌ Rollback FAILED after $MAX_RETRIES attempts"
    fail "All rollback attempts failed. Manual intervention required."
fi

echo ""

# =============================================================================
# Step 4: Write Current Manifest
# =============================================================================
log_step "Step 4: Write Current Manifest"

# Extract info from target release
cd "$TARGET_RELEASE_DIR" || fail "Cannot cd to $TARGET_RELEASE_DIR"

TARGET_IMAGE_TAG=$(basename "$TARGET_RELEASE_DIR" | cut -d'_' -f1)
TARGET_IMAGE_REF=$(grep "^IMAGE_REF=" .env 2>/dev/null | cut -d'=' -f2- || echo "")

if [ -z "$TARGET_IMAGE_REF" ]; then
    log_warn "IMAGE_REF not found in .env, using placeholder"
    TARGET_IMAGE_REF="unknown"
fi

TARGET_IMAGE_DIGEST=$(echo "$TARGET_IMAGE_REF" | grep -oP 'sha256:[a-f0-9]{64}' || echo "unknown")

CURRENT_MANIFEST="$CURRENT_DIR/${STACK}.json"
DEPLOYED_AT_UTC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$CURRENT_MANIFEST" << EOF
{
  "stack": "$STACK",
  "env": "$ENV",
  "image_tag": "$TARGET_IMAGE_TAG",
  "image_ref": "$TARGET_IMAGE_REF",
  "image_digest": "$TARGET_IMAGE_DIGEST",
  "release_id": "$TARGET_RELEASE_ID",
  "release_dir": "$TARGET_RELEASE_DIR",
  "deployed_at_utc": "$DEPLOYED_AT_UTC",
  "actor": "$ACTOR",
  "run_id": "$RUN_ID",
  "action": "rollback",
  "rollback_from": "$CURRENT_RELEASE_ID",
  "break_glass": false,
  "break_glass_reason": ""
}
EOF

log_success "Current manifest written: $CURRENT_MANIFEST"

echo ""

# =============================================================================
# Step 5: Update Deployment History
# =============================================================================
log_step "Step 5: Update Deployment History"

NOTES="rollback from=$CURRENT_RELEASE_ID to=$TARGET_RELEASE_ID image_ref=$TARGET_IMAGE_REF"

# Write to history
if declare -f write_history &>/dev/null; then
    write_history "$STACK" "$ENV" "$TARGET_IMAGE_TAG" "rollback" "success" "$NOTES"
else
    mkdir -p "$(dirname "$HISTORY_FILE")"
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $STACK $ENV $TARGET_IMAGE_TAG rollback success actor=$ACTOR run_id=$RUN_ID $NOTES" >> "$HISTORY_FILE"
fi

log_success "Rollback recorded in history: $HISTORY_FILE"

echo ""

# =============================================================================
# SUCCESS
# =============================================================================
log_step "✅ ROLLBACK SUCCESSFUL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stack:           $STACK"
echo "Environment:     $ENV"
echo "Previous:        $CURRENT_RELEASE_ID (tag: $CURRENT_IMAGE_TAG)"
echo "Current:         $TARGET_RELEASE_ID (tag: $TARGET_IMAGE_TAG)"
echo "Release Dir:     $TARGET_RELEASE_DIR"
echo "Symlink:         $SYMLINK_TARGET -> $TARGET_RELEASE_DIR"
echo "Current Manifest: $CURRENT_MANIFEST"
if [ $RETRY_COUNT -gt 0 ]; then
    echo "⚠️  Retries:       $RETRY_COUNT (rolled back to older release)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_success "Rollback completed successfully!"

exit 0
