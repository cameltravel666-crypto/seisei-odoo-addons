#!/bin/bash
# =============================================================================
# Deploy Script - Image as Source of Truth (Release Solidification Mode)
# =============================================================================
# Usage: ./deploy.sh <stack> <env> <image_tag> --digest-file <path> [OPTIONS]
#
# Required Arguments:
#   <stack>              Stack name (e.g., odoo18-prod, erp-seisei)
#   <env>                Environment: staging | production
#   <image_tag>          Image tag (must be sha-xxxxxxx format)
#   --digest-file <path> Path to digest manifest JSON from build
#
# Optional Arguments:
#   --break-glass        Emergency bypass of verified gate (production only)
#   --reason "text"      Required reason when using --break-glass
#   --actor "name"       GitHub actor (for audit trail)
#   --run-id "id"        GitHub run ID (for audit trail)
#
# Examples:
#   ./deploy.sh odoo18-staging staging sha-abc123 \
#       --digest-file /tmp/image-digests.json \
#       --actor "github-actions" --run-id "123456"
#
#   ./deploy.sh odoo18-prod production sha-abc123 \
#       --digest-file /tmp/image-digests.json \
#       --actor "john@example.com" --run-id "manual"
#
#   ./deploy.sh odoo18-prod production sha-abc123 \
#       --digest-file /tmp/image-digests.json \
#       --break-glass --reason "Critical security patch" \
#       --actor "oncall@example.com" --run-id "emergency"
#
# Key Behaviors:
# 1. Release Solidification: Copies infra/stacks/<stack>/ to /srv/releases/stacks/<stack>/<release_id>/
# 2. Digest Pinning: Uses image@sha256:... from manifest, never falls back to tags
# 3. Production Verified Gate: Checks /srv/releases/verified/<image_tag> exists
# 4. Break-glass: Allows emergency bypass with mandatory reason logging
# 5. Current Manifest: Writes /srv/releases/current/<stack>.json after deployment
# 6. Atomic Symlink: /srv/stacks/<stack> -> /srv/releases/stacks/<stack>/<release_id>
# 7. Auto-rollback: Reverts to previous release if smoke tests fail
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# =============================================================================
# Help and Usage
# =============================================================================
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    cat << 'EOF'
Deploy Script - Image as Source of Truth

Usage: deploy.sh <stack> <env> <image_tag> --digest-file <path> [OPTIONS]

Required:
  <stack>              Stack name (odoo18-prod, odoo18-staging, erp-seisei, etc.)
  <env>                Environment: staging | production
  <image_tag>          Image tag in sha-xxxxxxx format
  --digest-file PATH   Path to digest manifest JSON from build workflow

Optional:
  --break-glass        Emergency bypass of verified gate (production only)
  --reason "TEXT"      Required reason when using --break-glass (non-empty)
  --actor "NAME"       GitHub actor or user email for audit trail
  --run-id "ID"        GitHub run ID or manual identifier

Examples:
  # Staging deployment
  deploy.sh odoo18-staging staging sha-abc123 \
      --digest-file /tmp/image-digests.json \
      --actor "github-actions" --run-id "123456"

  # Production deployment (requires verified)
  deploy.sh odoo18-prod production sha-abc123 \
      --digest-file /tmp/image-digests.json \
      --actor "deploy-bot" --run-id "789012"

  # Emergency production deployment
  deploy.sh odoo18-prod production sha-def456 \
      --digest-file /tmp/image-digests.json \
      --break-glass --reason "Critical security patch CVE-2024-1234" \
      --actor "oncall@example.com" --run-id "emergency"

Environment Rules:
  staging    - Deploys without verified gate, does NOT auto-create verified
  production - REQUIRES /srv/releases/verified/<image_tag> to exist
             - Use --break-glass with --reason to bypass (logged)

EOF
    exit 0
fi

# =============================================================================
# Parse Arguments
# =============================================================================
STACK="${1:-}"
ENV="${2:-}"
IMAGE_TAG="${3:-}"
DIGEST_FILE=""
BREAK_GLASS=false
BREAK_GLASS_REASON=""
ACTOR="unknown"
RUN_ID="unknown"

# Validate required positional arguments
[ -z "$STACK" ] && fail "Missing required argument: <stack>"
[ -z "$ENV" ] && fail "Missing required argument: <env>"
[ -z "$IMAGE_TAG" ] && fail "Missing required argument: <image_tag>"

# Validate environment
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    fail "Invalid environment '$ENV'. Must be 'staging' or 'production'"
fi

# Validate image tag format
if [[ ! "$IMAGE_TAG" =~ ^sha-[a-f0-9]{7}$ ]]; then
    fail "Invalid image_tag format '$IMAGE_TAG'. Must be 'sha-xxxxxxx' (7 hex chars)"
fi

# Parse optional arguments
shift 3
while [[ $# -gt 0 ]]; do
    case $1 in
        --digest-file)
            DIGEST_FILE="${2:-}"
            [ -z "$DIGEST_FILE" ] && fail "--digest-file requires a path argument"
            shift 2
            ;;
        --break-glass)
            BREAK_GLASS=true
            shift
            ;;
        --reason)
            BREAK_GLASS_REASON="${2:-}"
            [ -z "$BREAK_GLASS_REASON" ] && fail "--reason requires a non-empty text argument"
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

# Validate required --digest-file
[ -z "$DIGEST_FILE" ] && fail "Missing required argument: --digest-file <path>"
[ ! -f "$DIGEST_FILE" ] && fail "Digest file not found: $DIGEST_FILE"

# Validate break-glass logic
if [ "$BREAK_GLASS" = true ]; then
    [ -z "$BREAK_GLASS_REASON" ] && fail "--break-glass requires --reason \"<text>\""
    [ "$ENV" != "production" ] && log_warn "⚠️  --break-glass is only meaningful for production"
fi

# =============================================================================
# Helper: Check if stack is erp-seisei variant
# =============================================================================
is_erp_stack() {
    [[ "$STACK" == erp-seisei* ]]
}

# =============================================================================
# Helper: Health gate for erp-seisei stacks
# =============================================================================
run_health_gate() {
    local REQUIRED_SUCCESSES=3
    local MAX_ATTEMPTS=10
    local INTERVAL=5

    # Get app container IP (port 9527 not exposed to host, uses Traefik)
    local APP_CONTAINER
    APP_CONTAINER=$(docker compose ps -q app)
    if [ -z "$APP_CONTAINER" ]; then
        log_error "Health gate: app container not found"
        return 1
    fi

    local APP_IP
    APP_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{break}}{{end}}' "$APP_CONTAINER")
    if [ -z "$APP_IP" ]; then
        log_error "Health gate: cannot determine app container IP"
        return 1
    fi

    local HEALTH_URL="http://${APP_IP}:9527/api/health"
    log_info "Health gate: checking $HEALTH_URL ($REQUIRED_SUCCESSES consecutive 200s required)"

    local consecutive_ok=0
    local i
    for i in $(seq 1 $MAX_ATTEMPTS); do
        local HTTP_CODE
        HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" || echo "000")
        log_info "Health check $i/$MAX_ATTEMPTS: HTTP $HTTP_CODE (consecutive_ok=$consecutive_ok)"

        if [ "$HTTP_CODE" = "200" ]; then
            consecutive_ok=$((consecutive_ok + 1))
            if [ $consecutive_ok -ge $REQUIRED_SUCCESSES ]; then
                log_success "Health gate passed ($REQUIRED_SUCCESSES consecutive 200s)"
                break
            fi
        else
            consecutive_ok=0
        fi
        sleep $INTERVAL
    done

    if [ $consecutive_ok -lt $REQUIRED_SUCCESSES ]; then
        log_error "Health gate FAILED (only $consecutive_ok/$REQUIRED_SUCCESSES consecutive 200s)"
        return 1
    fi

    # Check PostgreSQL separately
    local PG_USER="${POSTGRES_USER:-seisei}"
    if ! docker compose exec -T db pg_isready -U "$PG_USER"; then
        log_error "Health gate: PostgreSQL not ready"
        return 1
    fi
    log_success "PostgreSQL is ready (pg_isready passed)"

    return 0
}

# =============================================================================
# Helper: Trigger rollback with logging
# =============================================================================
trigger_rollback() {
    local REASON="$1"
    local ROLLBACK_TAG=""

    if [ -n "$ROLLBACK_MANIFEST" ]; then
        ROLLBACK_TAG=$(echo "$ROLLBACK_MANIFEST" | jq -r '.image_tag // "unknown"')
    fi

    log_error "[ROLLBACK] Trigger: $REASON"
    log_error "[ROLLBACK] Target: ${ROLLBACK_TAG:-none}"

    # Record rollback trigger in deploy history
    if declare -f write_history &>/dev/null; then
        write_history "$STACK" "$ENV" "$IMAGE_TAG" "deploy" "failed" "trigger=$REASON rollback_target=$ROLLBACK_TAG"
    else
        mkdir -p "$(dirname "$HISTORY_FILE")"
        echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $STACK $ENV $IMAGE_TAG deploy failed actor=$ACTOR run_id=$RUN_ID trigger=$REASON rollback_target=$ROLLBACK_TAG" >> "$HISTORY_FILE"
    fi

    # Pre-check: is there a previous deployment to roll back to?
    local PREV_MANIFEST="$CURRENT_DIR/${STACK}.json"
    if [ ! -f "$PREV_MANIFEST" ]; then
        log_error "[ROLLBACK] No previous deployment found (first deploy?)"
        log_error "[ROLLBACK] Cannot auto-rollback. Manual intervention required."
        log_error "[ROLLBACK] Status: skipped (no rollback target)"
        return
    fi

    if [ -f "$SCRIPT_DIR/rollback.sh" ]; then
        if "$SCRIPT_DIR/rollback.sh" "$STACK" "$ENV" --steps 1; then
            log_error "[ROLLBACK] Status: success"
        else
            log_error "[ROLLBACK] Status: failed"
        fi
    else
        log_error "[ROLLBACK] rollback.sh not found, cannot auto-rollback"
        log_error "[ROLLBACK] Status: failed"
    fi
}

# =============================================================================
# Configuration
# =============================================================================
# REPO_ROOT is defined in lib.sh as readonly
SRC_STACK_DIR="$REPO_ROOT/infra/stacks/$STACK"
RELEASES_BASE="/srv/releases"
STACKS_BASE="/srv/stacks"
VERIFIED_DIR="$RELEASES_BASE/verified"
CURRENT_DIR="$RELEASES_BASE/current"
HISTORY_FILE="$RELEASES_BASE/deploy_history.log"

# Release ID: <image_tag>__<UTC_TIMESTAMP>
UTC_TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
RELEASE_ID="${IMAGE_TAG}__${UTC_TIMESTAMP}"
RELEASE_DIR="$RELEASES_BASE/stacks/$STACK/$RELEASE_ID"
SYMLINK_TARGET="$STACKS_BASE/$STACK"

# =============================================================================
# Step 0: Display Deployment Info
# =============================================================================
log_step "🚀 DEPLOY: $STACK ($ENV) [$IMAGE_TAG]"
echo "  Stack:        $STACK"
echo "  Environment:  $ENV"
echo "  Image Tag:    $IMAGE_TAG"
echo "  Release ID:   $RELEASE_ID"
echo "  Actor:        $ACTOR"
echo "  Run ID:       $RUN_ID"
if [ "$BREAK_GLASS" = true ]; then
    log_warn "  ⚠️  BREAK-GLASS: $BREAK_GLASS_REASON"
fi
echo ""

# =============================================================================
# Step 1: Parse Digest Manifest
# =============================================================================
log_step "Step 1: Parse Digest Manifest"

if ! command -v jq &> /dev/null; then
    fail "jq is not installed. Install with: apt-get install jq"
fi

# Read and validate JSON
if ! jq empty "$DIGEST_FILE" 2>/dev/null; then
    fail "Invalid JSON in digest file: $DIGEST_FILE"
fi

# Determine image key based on stack
case "$STACK" in
    odoo18-*|odoo18_*)
        IMAGE_KEY="seisei-odoo18"
        ;;
    erp-seisei*)
        IMAGE_KEY="seisei-erp"
        ;;
    ocr)
        IMAGE_KEY="seisei-ocr"
        ;;
    *)
        fail "Unknown stack type '$STACK'. Add mapping in deploy.sh for digest manifest parsing."
        ;;
esac

# Extract image reference with digest
IMAGE_REF=$(jq -r ".images.\"$IMAGE_KEY\".ref // empty" "$DIGEST_FILE")
IMAGE_DIGEST=$(jq -r ".images.\"$IMAGE_KEY\".digest // empty" "$DIGEST_FILE")

if [ -z "$IMAGE_REF" ] || [ -z "$IMAGE_DIGEST" ]; then
    log_error "Failed to extract image reference for '$IMAGE_KEY' from digest manifest"
    log_error "Manifest content:"
    cat "$DIGEST_FILE"
    fail "Digest manifest does not contain valid ref for '$IMAGE_KEY'"
fi

# Validate digest format
if [[ ! "$IMAGE_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    fail "Invalid digest format: $IMAGE_DIGEST (expected sha256:...)"
fi

log_success "Parsed digest manifest:"
echo "  Image Key:    $IMAGE_KEY"
echo "  Image Ref:    $IMAGE_REF"
echo "  Digest:       $IMAGE_DIGEST"
echo ""

# =============================================================================
# Step 2: Production Verified Gate
# =============================================================================
if [ "$ENV" = "production" ]; then
    log_step "Step 2: Production Verified Gate"

    VERIFIED_FILE="$VERIFIED_DIR/$IMAGE_TAG"

    if [ -f "$VERIFIED_FILE" ]; then
        log_success "✅ Version verified: $VERIFIED_FILE exists"
    else
        if [ "$BREAK_GLASS" = true ]; then
            log_warn "⚠️  BREAK-GLASS MODE ACTIVATED"
            log_warn "⚠️  Bypassing verified gate for: $IMAGE_TAG"
            log_warn "⚠️  Reason: $BREAK_GLASS_REASON"
            log_warn "⚠️  This action will be recorded in deployment history and current manifest"
        else
            log_error "❌ Production deployment BLOCKED"
            log_error "Version not verified: $VERIFIED_FILE does not exist"
            log_error ""
            log_error "To mark this version as verified, run:"
            log_error "  sudo touch $VERIFIED_FILE"
            log_error ""
            log_error "Or for emergency deployment, use:"
            log_error "  --break-glass --reason \"<explanation>\""
            fail "Production verified gate check failed"
        fi
    fi
else
    log_info "Step 2: Skipping verified gate (staging environment)"
fi
echo ""

# =============================================================================
# Step 3: Preflight Checks
# =============================================================================
log_step "Step 3: Preflight Checks"

# Validate source stack directory exists
if [ ! -d "$SRC_STACK_DIR" ]; then
    fail "Source stack directory not found: $SRC_STACK_DIR"
fi
log_success "Source stack directory exists: $SRC_STACK_DIR"

# Validate required files exist in source
if [ ! -f "$SRC_STACK_DIR/docker-compose.yml" ]; then
    fail "docker-compose.yml not found in $SRC_STACK_DIR"
fi
log_success "docker-compose.yml exists"

# Run additional preflight checks if script exists
if [ -f "$SCRIPT_DIR/preflight.sh" ]; then
    "$SCRIPT_DIR/preflight.sh" "$STACK" "$ENV" || fail "Preflight checks failed"
    log_success "Additional preflight checks passed"
fi

echo ""

# =============================================================================
# Step 4: Backup Current State
# =============================================================================
log_step "Step 4: Backup Current State"

BACKUP_PATH=""
if [ -f "$SCRIPT_DIR/backup.sh" ]; then
    BACKUP_PATH=$("$SCRIPT_DIR/backup.sh" "$STACK" "$ENV") || fail "Backup failed"
    log_success "Backup completed: $BACKUP_PATH"
else
    log_warn "backup.sh not found, skipping backup"
fi

# =============================================================================
# Step 4.5: Record Rollback Target
# =============================================================================
log_step "Step 4.5: Record Rollback Target"

ROLLBACK_MANIFEST=""
if [ -f "$CURRENT_DIR/${STACK}.json" ]; then
    ROLLBACK_MANIFEST=$(cat "$CURRENT_DIR/${STACK}.json")
    log_info "Rollback target: $(echo "$ROLLBACK_MANIFEST" | jq -r '.image_tag')"
else
    log_info "No previous manifest found — first deployment, no rollback target"
fi

echo ""

# =============================================================================
# Step 5: Release Solidification (Copy Stack to Release Directory)
# =============================================================================
log_step "Step 5: Release Solidification"

# Create releases directory structure
mkdir -p "$RELEASES_BASE/stacks/$STACK"
mkdir -p "$VERIFIED_DIR"
mkdir -p "$CURRENT_DIR"

# Copy source stack to release directory
log_info "Copying stack from $SRC_STACK_DIR to $RELEASE_DIR ..."
cp -a "$SRC_STACK_DIR" "$RELEASE_DIR" || fail "Failed to copy stack directory"
log_success "Stack copied to release directory: $RELEASE_DIR"

# Write IMAGE_REF to .env in release directory
ENV_FILE="$RELEASE_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.backup"
    log_info "Updating .env with IMAGE_REF ..."
else
    log_warn ".env not found in release, creating from .env.example ..."
    if [ -f "$RELEASE_DIR/.env.example" ]; then
        cp "$RELEASE_DIR/.env.example" "$ENV_FILE"
    else
        fail ".env.example not found in $RELEASE_DIR"
    fi
fi

# Update IMAGE_REF in .env
if grep -q "^IMAGE_REF=" "$ENV_FILE"; then
    sed -i "s|^IMAGE_REF=.*|IMAGE_REF=$IMAGE_REF|" "$ENV_FILE"
else
    echo "IMAGE_REF=$IMAGE_REF" >> "$ENV_FILE"
fi
log_success "Updated .env: IMAGE_REF=$IMAGE_REF"

# Inject S3 credentials from deployment environment (for staging)
log_info "[DEBUG] Checking S3 env vars: DEPLOY_S3_ACCESS_KEY=${DEPLOY_S3_ACCESS_KEY:-NOTSET} DEPLOY_S3_SECRET_KEY=${DEPLOY_S3_SECRET_KEY:-NOTSET} DEPLOY_S3_BUCKET=${DEPLOY_S3_BUCKET:-NOTSET}"
if [ -n "${DEPLOY_S3_ACCESS_KEY:-}" ] && [ -n "${DEPLOY_S3_SECRET_KEY:-}" ]; then
    log_info "Injecting S3 credentials from deployment environment ..."

    # Update or append S3 environment variables
    for var in "SEISEI_S3_ACCESS_KEY:$DEPLOY_S3_ACCESS_KEY" "SEISEI_S3_SECRET_KEY:$DEPLOY_S3_SECRET_KEY" "SEISEI_S3_BUCKET:${DEPLOY_S3_BUCKET:-seisei-staging}" "SEISEI_S3_REGION:${DEPLOY_S3_REGION:-ap-northeast-1}"; do
        KEY="${var%%:*}"
        VALUE="${var#*:}"
        if grep -q "^${KEY}=" "$ENV_FILE"; then
            sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" "$ENV_FILE"
        else
            echo "${KEY}=${VALUE}" >> "$ENV_FILE"
        fi
    done

    log_success "✅ S3 credentials injected into .env"
else
    log_info "No deployment S3 credentials provided (using .env defaults)"
fi

# Also update COMPOSE_PROJECT_NAME if not present (for isolation)
EXPECTED_PROJECT_NAME=""
case "$STACK" in
    odoo18-prod)
        EXPECTED_PROJECT_NAME="seisei-odoo18-prod"
        ;;
    odoo18-staging)
        EXPECTED_PROJECT_NAME="seisei-odoo18-staging"
        ;;
    erp-seisei)
        EXPECTED_PROJECT_NAME="seisei-erp-prod"
        ;;
    erp-seisei-staging)
        EXPECTED_PROJECT_NAME="seisei-erp-staging"
        ;;
    *)
        EXPECTED_PROJECT_NAME="seisei-${STACK}"
        ;;
esac

if ! grep -q "^COMPOSE_PROJECT_NAME=" "$ENV_FILE"; then
    echo "COMPOSE_PROJECT_NAME=$EXPECTED_PROJECT_NAME" >> "$ENV_FILE"
    log_success "Added COMPOSE_PROJECT_NAME=$EXPECTED_PROJECT_NAME"
fi

echo ""

# =============================================================================
# Step 6: Atomic Symlink Switch
# =============================================================================
log_step "Step 6: Atomic Symlink Switch"

# Safety check: ensure symlink does NOT point to /opt
if [ -L "$SYMLINK_TARGET" ]; then
    CURRENT_TARGET=$(readlink -f "$SYMLINK_TARGET" || readlink "$SYMLINK_TARGET")
    if [[ "$CURRENT_TARGET" == /opt/* ]]; then
        fail "SAFETY CHECK FAILED: $SYMLINK_TARGET points to /opt/* ($CURRENT_TARGET). Must point to /srv/releases/stacks/*"
    fi
fi

# Atomic symlink update
log_info "Switching $SYMLINK_TARGET -> $RELEASE_DIR ..."

# If target exists and is a directory (not a symlink), we need to remove it first
# ln -sfn will create a link INSIDE a directory instead of replacing it
if [ -e "$SYMLINK_TARGET" ] && [ ! -L "$SYMLINK_TARGET" ]; then
    log_warn "Target is a real directory, backing up and removing..."
    mv "$SYMLINK_TARGET" "${SYMLINK_TARGET}.backup-$(date +%Y%m%d-%H%M%S)" || fail "Failed to backup existing directory"
fi

# Create symlink atomically using temporary + mv approach
TEMP_LINK="${SYMLINK_TARGET}.tmp.$$"
ln -sfn "$RELEASE_DIR" "$TEMP_LINK" || fail "Failed to create temporary symlink"
mv -T "$TEMP_LINK" "$SYMLINK_TARGET" || fail "Failed to move symlink atomically"
log_success "Symlink updated: $SYMLINK_TARGET -> $RELEASE_DIR"

# Verify symlink
ACTUAL_TARGET=$(readlink -f "$SYMLINK_TARGET" || readlink "$SYMLINK_TARGET")
if [ "$ACTUAL_TARGET" != "$RELEASE_DIR" ]; then
    fail "Symlink verification failed: expected $RELEASE_DIR, got $ACTUAL_TARGET"
fi
log_success "Symlink verified"

echo ""

# =============================================================================
# Step 7a: Pull Images
# =============================================================================
log_step "Step 7a: Pull Images"

cd "$SYMLINK_TARGET" || fail "Cannot cd to $SYMLINK_TARGET"

log_info "Pulling image: $IMAGE_REF ..."
if ! docker compose pull; then
    log_error "Failed to pull image"
    fail "Image pull failed. Release directory: $RELEASE_DIR"
fi
log_success "Image pulled successfully"

echo ""

# =============================================================================
# Step 7b: Database Migration (erp-seisei stacks only)
# =============================================================================
MIGRATION_RAN=false
MIGRATION_OUTPUT=""

if is_erp_stack; then
    log_step "Step 7b: Database Migration (Prisma)"

    # Start postgres only
    log_info "Starting database container..."
    docker compose up -d db

    # Wait for DB health (max 30s, poll pg_isready)
    log_info "Waiting for PostgreSQL to be ready (max 30s)..."
    local_pg_user="${POSTGRES_USER:-seisei}"
    DB_READY=false
    for attempt in $(seq 1 6); do
        if docker compose exec -T db pg_isready -U "$local_pg_user" 2>/dev/null; then
            DB_READY=true
            break
        fi
        log_info "PostgreSQL not ready yet (attempt $attempt/6)..."
        sleep 5
    done

    if [ "$DB_READY" = false ]; then
        log_error "PostgreSQL failed to become ready within 30s"
        trigger_rollback "migration_failure"
        fail "Database not ready for migration. Rollback attempted."
    fi
    log_success "PostgreSQL is ready"

    # Run prisma migrate deploy
    log_info "Running: prisma migrate deploy ..."
    MIGRATION_OUTPUT=$(docker compose run --rm app npx prisma migrate deploy 2>&1) || {
        log_error "Prisma migrate deploy FAILED"
        log_error "Migration output:"
        echo "$MIGRATION_OUTPUT" >&2
        trigger_rollback "migration_failure"
        fail "Database migration failed. Rollback attempted."
    }
    MIGRATION_RAN=true
    log_success "Database migration completed"
    log_info "Migration output:"
    echo "$MIGRATION_OUTPUT" >&2
else
    log_info "Step 7b: Skipping database migration (not an erp-seisei stack)"
fi

echo ""

# =============================================================================
# Step 7c: Deploy Containers
# =============================================================================
log_step "Step 7c: Deploy Containers"

log_info "Deploying containers (force-recreate) ..."
if ! docker compose up -d --force-recreate; then
    log_error "Container deployment failed"
    log_error "Attempting automatic rollback..."
    trigger_rollback "container_start_failure"
    fail "Container deployment failed. Rollback attempted."
fi
log_success "Containers deployed"

echo ""

# =============================================================================
# Step 8: Health Check and Smoke Tests
# =============================================================================
log_step "Step 8: Health Check and Smoke Tests"

STACK_DIR=$(resolve_stack_dir "$STACK")
if ! wait_for_healthy "$STACK_DIR" 300 "web"; then
    log_warn "Container not healthy, proceeding to smoke test for final verdict..."
fi

if is_erp_stack; then
    # ERP stacks: use explicit health gate
    log_info "Running health gate for erp-seisei stack..."
    if ! run_health_gate; then
        log_error "Attempting automatic rollback..."
        trigger_rollback "health_gate_failure"
        fail "Health gate failed. Rollback attempted."
    fi
else
    # Non-ERP stacks: existing smoke.sh behavior
    if [ -f "$SCRIPT_DIR/smoke.sh" ]; then
        if ! "$SCRIPT_DIR/smoke.sh" "$STACK" "$ENV" "$IMAGE_TAG"; then
            log_error "Smoke tests FAILED"
            log_error "Attempting automatic rollback..."
            trigger_rollback "smoke_test_failure"
            fail "Smoke tests failed. Rollback attempted."
        fi
        log_success "Smoke tests PASSED"
    else
        log_warn "smoke.sh not found, performing basic health check..."

        CONTAINER_NAME=$(docker compose ps -q | head -n1)
        if [ -z "$CONTAINER_NAME" ]; then
            fail "No containers found for stack $STACK"
        fi

        if ! docker inspect "$CONTAINER_NAME" --format='{{.State.Status}}' | grep -q "running"; then
            fail "Container is not running"
        fi

        log_success "Basic health check passed"
    fi
fi

echo ""

# =============================================================================
# Step 9: Write Current Manifest
# =============================================================================
log_step "Step 9: Write Current Manifest"

CURRENT_MANIFEST="$CURRENT_DIR/${STACK}.json"
DEPLOYED_AT_UTC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$CURRENT_MANIFEST" << EOF
{
  "stack": "$STACK",
  "env": "$ENV",
  "image_tag": "$IMAGE_TAG",
  "image_ref": "$IMAGE_REF",
  "image_digest": "$IMAGE_DIGEST",
  "release_id": "$RELEASE_ID",
  "release_dir": "$RELEASE_DIR",
  "deployed_at_utc": "$DEPLOYED_AT_UTC",
  "actor": "$ACTOR",
  "run_id": "$RUN_ID",
  "break_glass": $( [ "$BREAK_GLASS" = true ] && echo "true" || echo "false" ),
  "break_glass_reason": "$BREAK_GLASS_REASON"
}
EOF

log_success "Current manifest written: $CURRENT_MANIFEST"

echo ""

# =============================================================================
# Step 10: Update Deployment History
# =============================================================================
log_step "Step 10: Update Deployment History"

# Prepare notes
NOTES="image_ref=$IMAGE_REF digest=$IMAGE_DIGEST"
if [ "$BREAK_GLASS" = true ]; then
    NOTES="$NOTES break_glass=true reason=\"$BREAK_GLASS_REASON\""
fi
if is_erp_stack; then
    if [ "$MIGRATION_RAN" = true ]; then
        NOTES="$NOTES migration=applied"
    else
        NOTES="$NOTES migration=skipped"
    fi
    NOTES="$NOTES health_gate=passed"
fi

# Write to history (use lib.sh function if available)
if declare -f write_history &>/dev/null; then
    write_history "$STACK" "$ENV" "$IMAGE_TAG" "deploy" "success" "$NOTES"
else
    # Fallback: write directly
    mkdir -p "$(dirname "$HISTORY_FILE")"
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $STACK $ENV $IMAGE_TAG deploy success actor=$ACTOR run_id=$RUN_ID $NOTES" >> "$HISTORY_FILE"
fi

log_success "Deployment recorded in history: $HISTORY_FILE"

# Staging does NOT auto-create verified (per Next.txt D0-5)
if [ "$ENV" = "staging" ]; then
    log_info "ℹ️  Staging deployment does NOT auto-create verified file"
    log_info "To mark as verified after testing, run:"
    log_info "  sudo touch $VERIFIED_DIR/$IMAGE_TAG"
fi

echo ""

# =============================================================================
# SUCCESS
# =============================================================================
log_step "✅ DEPLOYMENT SUCCESSFUL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stack:           $STACK"
echo "Environment:     $ENV"
echo "Image Tag:       $IMAGE_TAG"
echo "Image Ref:       $IMAGE_REF"
echo "Release ID:      $RELEASE_ID"
echo "Release Dir:     $RELEASE_DIR"
echo "Symlink:         $SYMLINK_TARGET -> $RELEASE_DIR"
echo "Current Manifest: $CURRENT_MANIFEST"
if [ -n "$BACKUP_PATH" ]; then
    echo "Backup:          $BACKUP_PATH"
fi
if [ "$BREAK_GLASS" = true ]; then
    echo "⚠️  Break-glass:   $BREAK_GLASS_REASON"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_success "Deployment completed successfully!"

exit 0
