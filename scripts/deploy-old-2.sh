#!/bin/bash
# =============================================================================
# Safe Deployment Script with Automatic Rollback
# =============================================================================
# Usage: ./deploy.sh <stack> <git_sha> [--skip-backup] [--skip-tests]
# Example: ./deploy.sh odoo18-prod sha-19b9b98
# Example: ./deploy.sh odoo18-staging latest --skip-backup
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="${1}"
NEW_TAG="${2}"
SKIP_BACKUP="${3}"
SKIP_TESTS="${4}"

REPO_ROOT="/root/seisei-odoo-addons"
BACKUP_DIR="/root/backups"
SMOKE_TEST_SCRIPT="$REPO_ROOT/scripts/smoke-test.sh"

# Validate arguments
if [ -z "$STACK_NAME" ] || [ -z "$NEW_TAG" ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo "Usage: $0 <stack> <git_sha> [--skip-backup] [--skip-tests]"
    echo ""
    echo "Examples:"
    echo "  $0 odoo18-prod sha-19b9b98"
    echo "  $0 odoo18-staging latest"
    echo "  $0 odoo18-prod sha-abc1234 --skip-backup"
    exit 1
fi

# Validate stack name
STACK_DIR="$REPO_ROOT/infra/stacks/$STACK_NAME"
if [ ! -d "$STACK_DIR" ]; then
    echo -e "${RED}Error: Stack '$STACK_NAME' not found at $STACK_DIR${NC}"
    exit 1
fi

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_step() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
}

# Get current image tag from running container
get_current_tag() {
    local CONTAINER_NAME="${STACK_NAME}-web"
    local CURRENT_IMAGE=$(docker inspect --format='{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || echo "")

    if [ -n "$CURRENT_IMAGE" ]; then
        # Extract tag from image name (e.g., "ghcr.io/owner/repo:tag" -> "tag")
        echo "$CURRENT_IMAGE" | awk -F: '{print $NF}'
    else
        echo "unknown"
    fi
}

# Backup database
backup_database() {
    if [ "$SKIP_BACKUP" == "--skip-backup" ]; then
        log_warning "Skipping database backup (--skip-backup flag)"
        return 0
    fi

    log_step "STEP 2: Backup Database"

    mkdir -p "$BACKUP_DIR"
    local TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    local BACKUP_FILE="$BACKUP_DIR/${STACK_NAME}_db_${TIMESTAMP}.sql.gz"

    log_info "Creating database backup..."

    # Determine database container and name based on stack
    local DB_CONTAINER="seisei-db"
    local DB_USER="odoo"

    # Get list of databases to backup
    local DATABASES=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -t -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres');" | tr -d ' ')

    if [ -z "$DATABASES" ]; then
        log_error "No databases found to backup"
        return 1
    fi

    # Backup all databases
    docker exec "$DB_CONTAINER" pg_dumpall -U "$DB_USER" | gzip > "$BACKUP_FILE"

    if [ $? -eq 0 ]; then
        local BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log_success "Database backup created: $BACKUP_FILE ($BACKUP_SIZE)"

        # Keep only last 10 backups
        log_info "Cleaning up old backups (keeping last 10)..."
        ls -t "$BACKUP_DIR"/${STACK_NAME}_db_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm
        return 0
    else
        log_error "Database backup failed"
        return 1
    fi
}

# Rollback to previous tag
rollback() {
    local PREVIOUS_TAG="$1"

    log_step "ROLLBACK: Reverting to Previous Version"

    log_error "Deployment failed - rolling back to $PREVIOUS_TAG"

    cd "$STACK_DIR"

    # Update .env file with previous tag
    if [ -f .env ]; then
        sed -i "s/ODOO18_IMAGE_TAG=.*/ODOO18_IMAGE_TAG=$PREVIOUS_TAG/" .env
        log_info "Reverted .env to tag: $PREVIOUS_TAG"
    fi

    # Pull and restart with old image
    log_info "Pulling previous image..."
    docker compose pull

    log_info "Restarting with previous version..."
    docker compose up -d

    # Wait for service to start
    log_info "Waiting for service to stabilize..."
    sleep 10

    # Verify rollback
    local ROLLED_BACK_TAG=$(get_current_tag)
    if [ "$ROLLED_BACK_TAG" == "$PREVIOUS_TAG" ]; then
        log_success "Successfully rolled back to $PREVIOUS_TAG"
        return 0
    else
        log_error "Rollback verification failed (running: $ROLLED_BACK_TAG, expected: $PREVIOUS_TAG)"
        return 1
    fi
}

# =============================================================================
# Main Deployment Flow
# =============================================================================

echo "=========================================="
echo "  Safe Deployment with Auto-Rollback"
echo "=========================================="
echo "Stack:    $STACK_NAME"
echo "New Tag:  $NEW_TAG"
echo "Directory: $STACK_DIR"
echo "=========================================="
echo ""

# Step 1: Record current state
log_step "STEP 1: Record Current State"
PREVIOUS_TAG=$(get_current_tag)
log_info "Current image tag: $PREVIOUS_TAG"

if [ "$PREVIOUS_TAG" == "$NEW_TAG" ]; then
    log_warning "New tag ($NEW_TAG) is same as current tag"
    log_info "Proceeding anyway (may be re-deploying after fix)"
fi

# Step 2: Backup database
backup_database || {
    log_error "Backup failed - aborting deployment"
    exit 1
}

# Step 3: Update configuration
log_step "STEP 3: Update Configuration"
cd "$STACK_DIR"

if [ -f .env ]; then
    # Backup current .env
    cp .env .env.backup
    log_info "Backed up current .env"

    # Update image tag in .env
    sed -i "s/ODOO18_IMAGE_TAG=.*/ODOO18_IMAGE_TAG=$NEW_TAG/" .env
    log_success "Updated .env with new tag: $NEW_TAG"

    # Show the change
    log_info "Configuration change:"
    echo "  Old: ODOO18_IMAGE_TAG=$PREVIOUS_TAG"
    echo "  New: ODOO18_IMAGE_TAG=$NEW_TAG"
else
    log_error ".env file not found in $STACK_DIR"
    exit 1
fi

# Step 4: Pull new image
log_step "STEP 4: Pull New Docker Image"
log_info "Pulling image: ghcr.io/*/seisei-odoo18:$NEW_TAG"

docker compose pull || {
    log_error "Failed to pull new image"
    log_info "Restoring .env from backup"
    mv .env.backup .env
    exit 1
}

log_success "Image pulled successfully"

# Step 5: Deploy
log_step "STEP 5: Deploy New Version"
log_info "Starting deployment..."

docker compose up -d || {
    log_error "Deployment failed"
    rollback "$PREVIOUS_TAG"
    exit 1
}

log_success "Containers restarted"

# Step 6: Wait for service to start
log_step "STEP 6: Wait for Service Startup"
log_info "Waiting 15 seconds for service to initialize..."
sleep 15

# Step 7: Run smoke tests
if [ "$SKIP_TESTS" == "--skip-tests" ]; then
    log_warning "Skipping smoke tests (--skip-tests flag)"
    SMOKE_TEST_RESULT=0
else
    log_step "STEP 7: Run Smoke Tests"

    # Determine base URL based on stack
    if [ "$STACK_NAME" == "odoo18-prod" ]; then
        BASE_URL="https://demo.nagashiro.top"
    elif [ "$STACK_NAME" == "odoo18-staging" ]; then
        BASE_URL="https://staging.erp.seisei.tokyo"
    else
        BASE_URL="http://localhost:8069"
    fi

    log_info "Running smoke tests against: $BASE_URL"

    if [ -f "$SMOKE_TEST_SCRIPT" ]; then
        bash "$SMOKE_TEST_SCRIPT" "$STACK_NAME" "$BASE_URL"
        SMOKE_TEST_RESULT=$?
    else
        log_warning "Smoke test script not found at $SMOKE_TEST_SCRIPT"
        log_warning "Performing basic health check instead..."

        # Basic health check
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BASE_URL}/web/health" || echo "000")

        if [ "$HTTP_CODE" == "200" ]; then
            log_success "Basic health check passed (HTTP 200)"
            SMOKE_TEST_RESULT=0
        else
            log_error "Basic health check failed (HTTP $HTTP_CODE)"
            SMOKE_TEST_RESULT=1
        fi
    fi

    if [ $SMOKE_TEST_RESULT -eq 0 ]; then
        log_success "Smoke tests passed"
    else
        log_error "Smoke tests failed"
        rollback "$PREVIOUS_TAG"
        exit 1
    fi
fi

# Step 8: Cleanup
log_step "STEP 8: Cleanup"
log_info "Removing backup .env file..."
rm -f .env.backup

log_info "Pruning unused Docker images..."
docker image prune -f

log_success "Cleanup completed"

# Summary
echo ""
log_step "✅ DEPLOYMENT SUCCESSFUL"
echo ""
echo "Stack:        $STACK_NAME"
echo "Previous Tag: $PREVIOUS_TAG"
echo "New Tag:      $NEW_TAG"
echo "Backup:       $BACKUP_DIR/${STACK_NAME}_db_$(date +%Y%m%d)*.sql.gz"
echo ""
log_success "Deployment completed successfully!"
echo ""

# Show running containers
log_info "Running containers:"
docker compose ps

exit 0
