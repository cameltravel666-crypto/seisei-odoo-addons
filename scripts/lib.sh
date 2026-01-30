#!/bin/bash
# =============================================================================
# Production-Grade Deployment Library
# =============================================================================
# Common functions for all deployment scripts
# Source this file: source "$(dirname "$0")/lib.sh"
# =============================================================================

set -euo pipefail

# Colors
readonly COLOR_RED='\033[0;31m'
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[1;33m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_CYAN='\033[0;36m'
readonly COLOR_NC='\033[0m'

# Paths (can be overridden by environment)
readonly REPO_ROOT="${REPO_ROOT:-/opt/seisei-odoo-addons}"
readonly RUN_ROOT="${RUN_ROOT:-/srv/stacks}"
readonly BACKUP_ROOT="${BACKUP_ROOT:-/srv/backups}"
readonly RELEASE_ROOT="${RELEASE_ROOT:-/srv/releases}"
readonly DEPLOY_HISTORY="${DEPLOY_HISTORY:-/srv/deploy-history.log}"

# Stack mapping: stack_name => run_directory
# This prevents cd'ing into wrong directories
declare -gA STACK_MAP=(
    ["edge-traefik"]="/srv/stacks/edge-traefik"
    ["langbot"]="/srv/stacks/langbot"
    ["ocr"]="/srv/stacks/ocr"
    ["odoo18-prod"]="/srv/stacks/odoo18-prod"
    ["odoo18-staging"]="/srv/stacks/odoo18-staging"
    ["web-seisei"]="/srv/stacks/web-seisei"
)

# Domain mapping for smoke tests
declare -gA DOMAIN_MAP=(
    ["edge-traefik"]=""  # No direct domain
    ["langbot"]=""
    ["ocr"]="http://172.17.0.1:8180/health"
    ["odoo18-prod"]="https://demo.nagashiro.top"
    ["odoo18-staging"]="https://staging.erp.seisei.tokyo"
    ["web-seisei"]="https://biznexus.seisei.tokyo"
)

# =============================================================================
# Logging Functions
# =============================================================================

log_info() {
    echo -e "${COLOR_BLUE}[INFO]${COLOR_NC} $(timestamp) $*" >&2
}

log_success() {
    echo -e "${COLOR_GREEN}[✓]${COLOR_NC} $(timestamp) $*" >&2
}

log_warn() {
    echo -e "${COLOR_YELLOW}[!]${COLOR_NC} $(timestamp) $*" >&2
}

log_error() {
    echo -e "${COLOR_RED}[✗]${COLOR_NC} $(timestamp) $*" >&2
}

log_step() {
    echo "" >&2
    echo -e "${COLOR_CYAN}═══════════════════════════════════════${COLOR_NC}" >&2
    echo -e "${COLOR_CYAN}  $*${COLOR_NC}" >&2
    echo -e "${COLOR_CYAN}═══════════════════════════════════════${COLOR_NC}" >&2
}

# Fail with error message and exit
fail() {
    log_error "$*"
    exit 1
}

# =============================================================================
# Utility Functions
# =============================================================================

timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

# Check if command exists
require_cmd() {
    local cmd="$1"
    if ! command -v "$cmd" &> /dev/null; then
        fail "Required command not found: $cmd"
    fi
}

# Check if running as root/sudo
require_root() {
    if [ "$EUID" -ne 0 ]; then
        fail "This script must be run as root or with sudo"
    fi
}

# Resolve stack directory from stack name
resolve_stack_dir() {
    local stack="$1"

    if [[ -v STACK_MAP["$stack"] ]]; then
        echo "${STACK_MAP[$stack]}"
    else
        fail "Unknown stack: $stack. Valid stacks: ${!STACK_MAP[*]}"
    fi
}

# Get domain for stack
get_stack_domain() {
    local stack="$1"

    if [[ -v DOMAIN_MAP["$stack"] ]]; then
        echo "${DOMAIN_MAP[$stack]}"
    else
        echo ""
    fi
}

# =============================================================================
# Deployment History Functions
# =============================================================================

write_history() {
    local stack="$1"
    local env="${2:-prod}"
    local version="$3"
    local action="${4:-deploy}"
    local status="${5:-success}"
    local notes="${6:-}"

    # Ensure directory exists
    mkdir -p "$(dirname "$DEPLOY_HISTORY")"

    # Format: timestamp | stack | env | action | version | status | notes
    echo "$(timestamp) | $stack | $env | $action | $version | $status | $notes" >> "$DEPLOY_HISTORY"
}

# Get last successful deployment for stack
get_last_deployment() {
    local stack="$1"
    local env="${2:-prod}"

    if [ ! -f "$DEPLOY_HISTORY" ]; then
        echo ""
        return
    fi

    # Find last successful deploy for this stack/env
    grep "| $stack | $env | deploy | .* | success |" "$DEPLOY_HISTORY" | tail -1 | awk -F'|' '{print $5}' | tr -d ' '
}

# =============================================================================
# Promotion (Verified Release) Functions
# =============================================================================

# Mark version as verified in staging
mark_verified() {
    local stack="$1"
    local version="$2"

    mkdir -p "$RELEASE_ROOT/verified"
    echo "$version" > "$RELEASE_ROOT/verified/$stack.txt"
    log_success "Marked $stack:$version as verified in staging"
}

# Get verified version for stack

# Promotion source (which staging stack certifies which prod stack)
# Example: odoo18-prod must be verified by odoo18-staging
declare -gA VERIFIED_ALIAS
VERIFIED_ALIAS["odoo18-prod"]="odoo18-staging"

resolve_verified_stack() {
    local stack="$1"
    if [[ -n "${VERIFIED_ALIAS[$stack]+_}" ]]; then
        echo "${VERIFIED_ALIAS[$stack]}"
    else
        echo "$stack"
    fi
}
get_verified_file() {
    local stack="$1"
    local src
    src="$(resolve_verified_stack "$stack")"
    echo "$RELEASE_ROOT/verified/${src}.txt"
}

# Get verified version for stack (returns version string, empty if not found)
get_verified() {
    local stack="$1"
    local verified_file
    verified_file="$(get_verified_file "$stack")"

    if [ -f "$verified_file" ]; then
        cat "$verified_file"
    else
        echo ""
    fi
}

# Check if version is verified (for production deployment)
check_verified() {
    local stack="$1"
    local version="$2"
    local force="${3:-false}"

    if [ "$force" = "true" ]; then
        log_warn "FORCE MODE ENABLED - Skipping promotion check"
        return 0
    fi

    local verified
    verified="$(get_verified "$stack")"

    if [ -z "$verified" ]; then
        log_error "No verified version found for $stack. Deploy to staging first."
        return 1
    fi

    if [ "$verified" != "$version" ]; then
        log_error "Version $version is NOT verified for $stack (verified: $verified)"
        return 1
    fi

    log_success "Version $version is verified for $stack"
    return 0
}

# =============================================================================
# Docker/Compose Functions
# =============================================================================

# Get current image tag from running container
get_current_image() {
    local stack="$1"
    local container_name="${stack}-web"

    # Try common container naming patterns
    for name in "${stack}-web" "${stack}" "$(echo $stack | tr '-' '_')_web_1"; do
        if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
            docker inspect --format='{{.Config.Image}}' "$name" 2>/dev/null && return
        fi
    done

    echo "unknown"
}

# Extract tag from image string
extract_tag() {
    local image="$1"
    echo "$image" | awk -F: '{print $NF}'
}

# Extract digest from image string
extract_digest() {
    local image="$1"
    if [[ "$image" =~ @sha256: ]]; then
        echo "$image" | awk -F@ '{print $NF}'
    else
        echo ""
    fi
}

# Check if Docker Compose file is valid
validate_compose() {
    local compose_dir="$1"

    cd "$compose_dir" || fail "Cannot cd to $compose_dir"

    if ! docker compose config > /dev/null 2>&1; then
        fail "Invalid docker-compose.yml in $compose_dir"
    fi

    log_success "docker-compose.yml is valid"
}

# Check for 'build:' directive in compose file
check_no_build() {
    local compose_file="$1"

    if grep -q "^\s*build:" "$compose_file"; then
        fail "FORBIDDEN: 'build:' directive found in $compose_file. Production must only pull images!"
    fi

    log_success "No 'build:' directive found (production-grade ✓)"
}

# Check for ':latest' tags in compose file
check_no_latest() {
    local compose_file="$1"
    local allow_latest="${2:-false}"

    if [ "$allow_latest" = "true" ]; then
        log_warn "Allowing :latest tags (staging environment)"
        return 0
    fi

    # Check for :latest in image declarations
    if grep -E "^\s*image:.*:latest" "$compose_file"; then
        fail "FORBIDDEN: ':latest' tag found in $compose_file. Production must use sha/digest tags!"
    fi

    log_success "No ':latest' tags found (production-grade ✓)"
}

# =============================================================================
# Network Functions
# =============================================================================

check_network_exists() {
    local network="$1"

    if ! docker network inspect "$network" > /dev/null 2>&1; then
        fail "Required network '$network' does not exist"
    fi

    log_success "Network '$network' exists"
}

# =============================================================================
# Disk Space Functions
# =============================================================================

check_disk_space() {
    local threshold="${1:-80}"  # Default 80%
    local usage
    usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

    if [ "$usage" -gt "$threshold" ]; then
        fail "Disk usage is ${usage}% (threshold: ${threshold}%)"
    fi

    log_success "Disk usage: ${usage}% (threshold: ${threshold}%)"
}

# =============================================================================
# Initialization
# =============================================================================

# Check required commands on load
for cmd in docker jq; do
    require_cmd "$cmd"
done

# Export functions for use in scripts
export -f log_info log_success log_warn log_error log_step fail
export -f timestamp require_cmd require_root
export -f resolve_stack_dir get_stack_domain
export -f write_history get_last_deployment
export -f mark_verified get_verified check_verified
export -f get_current_image extract_tag extract_digest
export -f validate_compose check_no_build check_no_latest
export -f check_network_exists check_disk_space
