#!/bin/bash
# =============================================================================
# Server Bootstrap - Create Deployer User with Minimal Privileges
# =============================================================================
# Usage: ./server_bootstrap_deployer.sh [--user <name>] [--pubkey <path>]
# Example: ./server_bootstrap_deployer.sh --user deployer --pubkey ~/.ssh/id_rsa.pub
#
# This script is idempotent and can be run multiple times safely.
# =============================================================================

set -euo pipefail

# Defaults
DEPLOY_USER="${DEPLOY_USER:-deployer}"
DEPLOY_PUBKEY="${DEPLOY_PUBKEY:-}"
REPO_PATH="/opt/seisei-odoo-addons"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

fail() {
    log_error "$1"
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --user)
            DEPLOY_USER="$2"
            shift 2
            ;;
        --pubkey)
            DEPLOY_PUBKEY="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--user <name>] [--pubkey <path>]"
            echo ""
            echo "Options:"
            echo "  --user <name>      Username for deploy user (default: deployer)"
            echo "  --pubkey <path>    Path to SSH public key file"
            echo ""
            echo "Environment variables:"
            echo "  DEPLOY_USER        Same as --user"
            echo "  DEPLOY_PUBKEY      Same as --pubkey"
            exit 0
            ;;
        *)
            fail "Unknown argument: $1"
            ;;
    esac
done

# Require root
if [ "$(id -u)" -ne 0 ]; then
    fail "This script must be run as root"
fi

log_info "=== Seisei Deployer Bootstrap ==="
log_info "Deploy user: $DEPLOY_USER"

# Step 1: Create user if not exists
if id "$DEPLOY_USER" &>/dev/null; then
    log_info "User $DEPLOY_USER already exists"
else
    log_info "Creating user: $DEPLOY_USER"
    useradd --system --shell /bin/bash --create-home "$DEPLOY_USER"
    log_info "✅ User $DEPLOY_USER created"
fi

# Step 2: Setup SSH authorized_keys
USER_HOME=$(eval echo "~$DEPLOY_USER")
SSH_DIR="$USER_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ -n "$DEPLOY_PUBKEY" ]; then
    if [ -f "$DEPLOY_PUBKEY" ]; then
        log_info "Adding SSH public key from: $DEPLOY_PUBKEY"

        # Read pubkey content
        PUBKEY_CONTENT=$(cat "$DEPLOY_PUBKEY")

        # Check if key already exists
        if [ -f "$AUTH_KEYS" ] && grep -qF "$PUBKEY_CONTENT" "$AUTH_KEYS"; then
            log_info "SSH key already present in authorized_keys"
        else
            echo "$PUBKEY_CONTENT" >> "$AUTH_KEYS"
            log_info "✅ SSH key added to authorized_keys"
        fi

        chmod 600 "$AUTH_KEYS"
        chown -R "$DEPLOY_USER:$DEPLOY_USER" "$SSH_DIR"
    else
        log_warn "Public key file not found: $DEPLOY_PUBKEY"
        log_warn "You can add it later to: $AUTH_KEYS"
    fi
else
    log_warn "No public key provided (use --pubkey)"
    log_warn "Manual setup required: add SSH key to $AUTH_KEYS"
fi

# Step 3: Configure sudoers
SUDOERS_FILE="/etc/sudoers.d/seisei-deployer"

log_info "Configuring sudo permissions: $SUDOERS_FILE"

# Detect docker paths
DOCKER_BIN=$(which docker 2>/dev/null || echo "/usr/bin/docker")
DOCKER_COMPOSE_BIN=$(which docker-compose 2>/dev/null || echo "/usr/bin/docker-compose")

cat > "$SUDOERS_FILE" <<EOF
# =============================================================================
# Seisei Deployer - Minimal Privilege Sudo Rules
# =============================================================================
# Created: $(date)
# User: $DEPLOY_USER
#
# This file grants $DEPLOY_USER NOPASSWD sudo access to deployment scripts only.
# =============================================================================

# Allow deployment scripts
$DEPLOY_USER ALL=(ALL) NOPASSWD: $REPO_PATH/scripts/deploy.sh
$DEPLOY_USER ALL=(ALL) NOPASSWD: $REPO_PATH/scripts/rollback.sh
$DEPLOY_USER ALL=(ALL) NOPASSWD: $REPO_PATH/scripts/sync_to_srv.sh
$DEPLOY_USER ALL=(ALL) NOPASSWD: $REPO_PATH/scripts/backup.sh
$DEPLOY_USER ALL=(ALL) NOPASSWD: $REPO_PATH/scripts/smoke.sh
$DEPLOY_USER ALL=(ALL) NOPASSWD: $REPO_PATH/scripts/preflight.sh

# Allow Docker commands
$DEPLOY_USER ALL=(ALL) NOPASSWD: $DOCKER_BIN
$DEPLOY_USER ALL=(ALL) NOPASSWD: $DOCKER_COMPOSE_BIN

# Allow systemctl for nginx reload (if nginx managed by systemd)
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl status nginx
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx
$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl status nginx

# Allow nginx -t for config validation
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/nginx -t

# Disable requiretty (allows sudo in non-interactive SSH)
Defaults:$DEPLOY_USER !requiretty
EOF

# Validate sudoers syntax
if visudo -c -f "$SUDOERS_FILE" &>/dev/null; then
    chmod 440 "$SUDOERS_FILE"
    log_info "✅ Sudoers file created and validated: $SUDOERS_FILE"
else
    log_error "Sudoers file syntax error!"
    rm -f "$SUDOERS_FILE"
    fail "Failed to create sudoers file"
fi

# Step 4: Create required directories
log_info "Creating required directories"

mkdir -p /srv/stacks
mkdir -p /srv/backups
mkdir -p /srv/releases/verified
touch /srv/deploy-history.log

# Set ownership for deploy user to access these directories
chown -R "$DEPLOY_USER:$DEPLOY_USER" /srv/stacks /srv/backups /srv/releases
chown "$DEPLOY_USER:$DEPLOY_USER" /srv/deploy-history.log

log_info "✅ Required directories created"

# Step 5: Ensure repo scripts are executable
if [ -d "$REPO_PATH/scripts" ]; then
    chmod +x "$REPO_PATH"/scripts/*.sh
    log_info "✅ Scripts made executable"
else
    log_warn "Repo scripts not found at: $REPO_PATH/scripts"
fi

# Step 6: Summary
echo ""
log_info "=== Bootstrap Complete ==="
echo ""
log_info "Deploy user: $DEPLOY_USER"
log_info "SSH config: $SSH_DIR/authorized_keys"
log_info "Sudoers: $SUDOERS_FILE"
echo ""
log_info "Allowed commands:"
log_info "  - $REPO_PATH/scripts/deploy.sh"
log_info "  - $REPO_PATH/scripts/rollback.sh"
log_info "  - $REPO_PATH/scripts/sync_to_srv.sh"
log_info "  - $DOCKER_BIN"
log_info "  - docker-compose / docker compose"
log_info "  - systemctl reload nginx"
log_info "  - nginx -t"
echo ""
log_info "Next steps:"
log_info "  1. Test SSH login: ssh $DEPLOY_USER@<server-ip>"
log_info "  2. Test sudo: ssh $DEPLOY_USER@<server-ip> sudo $REPO_PATH/scripts/deploy.sh --help"
log_info "  3. Add DEPLOY_SSH_KEY to GitHub Secrets"
echo ""

exit 0
