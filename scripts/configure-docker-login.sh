#!/bin/bash
# =============================================================================
# Configure Docker Login for GHCR on EC2 Instances
# =============================================================================
# This script configures Docker to authenticate with GitHub Container Registry
# on both Staging and Production EC2 instances.
# =============================================================================

set -euo pipefail

# Colors
readonly COLOR_RED='\033[0;31m'
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[1;33m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_NC='\033[0m'

log_info() {
    echo -e "${COLOR_BLUE}[INFO]${COLOR_NC} $*" >&2
}

log_success() {
    echo -e "${COLOR_GREEN}[✓]${COLOR_NC} $*" >&2
}

log_error() {
    echo -e "${COLOR_RED}[✗]${COLOR_NC} $*" >&2
}

log_warn() {
    echo -e "${COLOR_YELLOW}[!]${COLOR_NC} $*" >&2
}

# Configuration
readonly SSH_KEY="/Users/taozhang/Projects/Pem/odoo-2025.pem"
readonly SSH_USER="ubuntu"
readonly STAGING_HOST="13.231.24.250"
readonly PRODUCTION_HOST="54.65.127.141"
readonly GHCR_USERNAME="cameltravel666-crypto"
readonly TEST_IMAGE="ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:1db6436ca7e084705cffcf3e760b6659cce449bd636edf94917b28de2df3fbe5"

# =============================================================================
# Main Script
# =============================================================================

echo ""
log_info "GitHub Container Registry (GHCR) Docker Login Configuration"
echo ""

# Get GHCR PAT from environment or prompt
if [ -z "${GHCR_PAT:-}" ]; then
    log_warn "You need your GitHub Personal Access Token (PAT) with 'read:packages' scope"
    log_info "Find it at: https://github.com/settings/tokens"
    echo ""
    read -sp "Enter your GHCR PAT (ghp_...): " GHCR_PAT
    echo ""
fi

if [[ ! "$GHCR_PAT" =~ ^ghp_ ]]; then
    log_error "Invalid token format. Token should start with 'ghp_'"
    log_error "Usage: GHCR_PAT=ghp_xxx ./scripts/configure-docker-login.sh"
    exit 1
fi

log_success "Token format validated"
echo ""

# Function to configure Docker login on a server
configure_server() {
    local host="$1"
    local name="$2"

    log_info "Configuring Docker login on $name ($host)..."

    # Test SSH connectivity
    if ! ssh -i "$SSH_KEY" -o ConnectTimeout=5 "${SSH_USER}@${host}" "echo 'SSH connection OK'" &>/dev/null; then
        log_error "Cannot connect to $host via SSH"
        return 1
    fi
    log_success "SSH connection to $name verified"

    # Configure Docker login
    ssh -i "$SSH_KEY" "${SSH_USER}@${host}" <<EOF
        echo "Configuring Docker login for GHCR..."
        echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

        echo "Verifying GHCR access by pulling test image..."
        docker pull "$TEST_IMAGE"

        echo "Listing GHCR images..."
        docker images | grep ghcr.io || true
EOF

    if [ $? -eq 0 ]; then
        log_success "$name Docker login configured successfully!"
        return 0
    else
        log_error "Failed to configure Docker login on $name"
        return 1
    fi
}

# Configure Staging
echo "═══════════════════════════════════════"
echo "  STAGING EC2 (13.231.24.250)"
echo "═══════════════════════════════════════"
if configure_server "$STAGING_HOST" "Staging EC2"; then
    STAGING_OK=1
else
    STAGING_OK=0
fi
echo ""

# Configure Production
echo "═══════════════════════════════════════"
echo "  PRODUCTION EC2 (54.65.127.141)"
echo "═══════════════════════════════════════"
if configure_server "$PRODUCTION_HOST" "Production EC2"; then
    PRODUCTION_OK=1
else
    PRODUCTION_OK=0
fi
echo ""

# Summary
echo "═══════════════════════════════════════"
echo "  SUMMARY"
echo "═══════════════════════════════════════"
if [ $STAGING_OK -eq 1 ]; then
    log_success "Staging EC2: Configured ✓"
else
    log_error "Staging EC2: Failed ✗"
fi

if [ $PRODUCTION_OK -eq 1 ]; then
    log_success "Production EC2: Configured ✓"
else
    log_error "Production EC2: Failed ✗"
fi
echo ""

if [ $STAGING_OK -eq 1 ] && [ $PRODUCTION_OK -eq 1 ]; then
    log_success "All servers configured successfully!"
    echo ""
    log_info "Next steps:"
    echo "  1. Update Staging to use custom GHCR image"
    echo "  2. Verify Odoo functionality"
    echo "  3. Proceed to Phase 2: Database Migration"
    exit 0
else
    log_error "Some servers failed to configure"
    exit 1
fi
