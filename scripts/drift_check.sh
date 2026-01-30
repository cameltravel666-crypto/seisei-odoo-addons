#!/usr/bin/env bash
# drift_check.sh - Compare runtime state against repo baseline
# Supports local mode (repo self-check) and server mode (SSH to production)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCKS_DIR="$REPO_ROOT/audit/locks"
RUNTIME_DIR="$REPO_ROOT/audit/runtime"
REPORT_FILE=""
JSON_REPORT=""

# Colors (safe for both bash and zsh)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Compare runtime state against repo baseline locks.

Modes:
  --local           Check repo locks consistency (default)
  --server HOST     SSH to server and compare runtime vs repo locks

Options:
  --ssh-key FILE    SSH private key for server mode
  --ssh-user USER   SSH username (default: ubuntu)
  --output DIR      Output directory for reports (default: audit/runtime)
  --help            Show this help

Examples:
  $(basename "$0") --local
  $(basename "$0") --server 54.65.127.141 --ssh-key ~/.ssh/id_rsa

EOF
    exit 0
}

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_info() { echo -e "[INFO] $1"; }

# Parse arguments
MODE="local"
SERVER_HOST=""
SSH_KEY=""
SSH_USER="ubuntu"
OUTPUT_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --local) MODE="local"; shift ;;
        --server) MODE="server"; SERVER_HOST="$2"; shift 2 ;;
        --ssh-key) SSH_KEY="$2"; shift 2 ;;
        --ssh-user) SSH_USER="$2"; shift 2 ;;
        --output) OUTPUT_DIR="$2"; shift 2 ;;
        --help|-h) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

# Setup output directory
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
if [[ -z "$OUTPUT_DIR" ]]; then
    OUTPUT_DIR="$RUNTIME_DIR/$TIMESTAMP"
fi
mkdir -p "$OUTPUT_DIR"
REPORT_FILE="$OUTPUT_DIR/drift_report.txt"
JSON_REPORT="$OUTPUT_DIR/drift_report.json"

# Initialize JSON report
echo '{"timestamp":"'"$TIMESTAMP"'","mode":"'"$MODE"'","checks":[]}' > "$JSON_REPORT"

add_check_result() {
    local name="$1"
    local status="$2"
    local details="${3:-}"

    # Append to JSON (using temp file for portability)
    local tmp_file
    tmp_file=$(mktemp)
    jq --arg name "$name" --arg status "$status" --arg details "$details" \
        '.checks += [{"name": $name, "status": $status, "details": $details}]' \
        "$JSON_REPORT" > "$tmp_file" && mv "$tmp_file" "$JSON_REPORT"
}

check_lock_files_exist() {
    log_info "Checking lock files exist..."

    local required_locks=(
        "docker_images.lock.json"
        "compose_sha256.lock.txt"
        "odoo_addons_modules.hash.txt"
    )

    local missing=0
    for lock in "${required_locks[@]}"; do
        if [[ ! -f "$LOCKS_DIR/$lock" ]]; then
            log_fail "Missing lock file: $lock"
            missing=$((missing + 1))
        fi
    done

    if [[ $missing -eq 0 ]]; then
        log_pass "All required lock files present"
        add_check_result "lock_files_exist" "PASS" ""
        return 0
    else
        add_check_result "lock_files_exist" "FAIL" "$missing files missing"
        return 1
    fi
}

check_compose_hashes() {
    log_info "Checking compose file hashes..."

    local lock_file="$LOCKS_DIR/compose_sha256.lock.txt"
    if [[ ! -f "$lock_file" ]]; then
        log_warn "No compose lock file found"
        add_check_result "compose_hashes" "SKIP" "No lock file"
        return 0
    fi

    local drifted=0
    local details=""

    while IFS= read -r line; do
        local expected_hash file_path
        expected_hash=$(echo "$line" | awk '{print $1}')
        file_path=$(echo "$line" | awk '{print $2}')

        local full_path="$REPO_ROOT/$file_path"
        if [[ -f "$full_path" ]]; then
            local current_hash
            current_hash=$(sha256sum "$full_path" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$full_path" | awk '{print $1}')

            if [[ "$current_hash" != "$expected_hash" ]]; then
                log_fail "Compose drift: $file_path"
                details="$details$file_path;"
                drifted=$((drifted + 1))
            fi
        else
            log_warn "Compose file not found: $file_path"
        fi
    done < "$lock_file"

    if [[ $drifted -eq 0 ]]; then
        log_pass "All compose files match baseline"
        add_check_result "compose_hashes" "PASS" ""
        return 0
    else
        add_check_result "compose_hashes" "FAIL" "$drifted files drifted: $details"
        return 1
    fi
}

check_addon_hashes() {
    log_info "Checking Odoo addon hashes..."

    local lock_file="$LOCKS_DIR/odoo_addons_modules.hash.txt"
    local addons_dir="$REPO_ROOT/odoo_modules/seisei"

    if [[ ! -f "$lock_file" ]]; then
        log_warn "No addons lock file found"
        add_check_result "addon_hashes" "SKIP" "No lock file"
        return 0
    fi

    if [[ ! -d "$addons_dir" ]]; then
        # Try alternative path
        addons_dir="$REPO_ROOT/odoo/addons/seisei"
    fi

    if [[ ! -d "$addons_dir" ]]; then
        log_warn "Addons directory not found"
        add_check_result "addon_hashes" "SKIP" "No addons dir"
        return 0
    fi

    local drifted=0
    local details=""

    while IFS= read -r line; do
        local expected_hash module_name
        expected_hash=$(echo "$line" | awk '{print $1}')
        module_name=$(echo "$line" | awk '{print $2}')

        local module_path="$addons_dir/$module_name"
        if [[ -d "$module_path" ]]; then
            local current_hash
            current_hash=$(find "$module_path" -type f -exec sha256sum {} \; 2>/dev/null | sort | sha256sum | awk '{print $1}' || \
                          find "$module_path" -type f -exec shasum -a 256 {} \; | sort | shasum -a 256 | awk '{print $1}')

            if [[ "$current_hash" != "$expected_hash" ]]; then
                log_fail "Addon drift: $module_name"
                details="$details$module_name;"
                drifted=$((drifted + 1))
            fi
        fi
    done < "$lock_file"

    if [[ $drifted -eq 0 ]]; then
        log_pass "All addon modules match baseline"
        add_check_result "addon_hashes" "PASS" ""
        return 0
    else
        add_check_result "addon_hashes" "FAIL" "$drifted modules drifted: $details"
        return 1
    fi
}

run_server_checks() {
    local host="$1"
    local key="$2"
    local user="$3"

    log_info "Running server-side drift checks on $host..."

    local ssh_opts="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
    if [[ -n "$key" ]]; then
        ssh_opts="$ssh_opts -i $key"
    fi

    # Collect server state
    ssh $ssh_opts "$user@$host" 'bash -s' << 'REMOTE_SCRIPT' > "$OUTPUT_DIR/server_state.json"
#!/bin/bash
echo "{"
echo '"docker_images": ['
first=true
for container in traefik seisei-odoo-router odoo18-prod-web seisei-erp-app qr-bff ocr-service seisei-db; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        if [ "$first" = true ]; then first=false; else echo ","; fi
        image=$(docker inspect "$container" --format '{{.Config.Image}}' 2>/dev/null || echo "unknown")
        image_id=$(docker inspect "$container" --format '{{.Image}}' 2>/dev/null || echo "unknown")
        printf '{"name":"%s","image":"%s","imageId":"%s"}' "$container" "$image" "$image_id"
    fi
done
echo '],'

echo '"compose_hashes": ['
first=true
for f in /srv/stacks/*/docker-compose.yml /opt/seisei-odoo/docker-compose.yml; do
    if [ -f "$f" ]; then
        if [ "$first" = true ]; then first=false; else echo ","; fi
        hash=$(sha256sum "$f" | cut -d' ' -f1)
        printf '{"file":"%s","hash":"%s"}' "$f" "$hash"
    fi
done
echo ']'
echo "}"
REMOTE_SCRIPT

    # Compare with local locks
    log_info "Comparing server state with repo locks..."

    if [[ -f "$OUTPUT_DIR/server_state.json" ]] && jq -e . "$OUTPUT_DIR/server_state.json" > /dev/null 2>&1; then
        log_pass "Server state collected successfully"
        add_check_result "server_collection" "PASS" ""

        # Compare docker images
        local server_images
        server_images=$(jq -r '.docker_images[] | "\(.name):\(.image)"' "$OUTPUT_DIR/server_state.json" 2>/dev/null || echo "")

        if [[ -f "$LOCKS_DIR/docker_images.lock.json" ]]; then
            local lock_images
            lock_images=$(jq -r '.images | to_entries[] | "\(.key):\(.value.image)"' "$LOCKS_DIR/docker_images.lock.json" 2>/dev/null || echo "")

            local image_diffs=0
            while IFS= read -r server_img; do
                if ! echo "$lock_images" | grep -q "^$server_img$"; then
                    log_fail "Image drift: $server_img"
                    image_diffs=$((image_diffs + 1))
                fi
            done <<< "$server_images"

            if [[ $image_diffs -eq 0 ]]; then
                log_pass "Docker images match baseline"
                add_check_result "docker_images" "PASS" ""
            else
                add_check_result "docker_images" "FAIL" "$image_diffs images differ"
            fi
        fi
    else
        log_fail "Failed to collect server state"
        add_check_result "server_collection" "FAIL" "SSH or JSON error"
        return 1
    fi
}

# Main execution
echo "========================================"
echo "  Drift Check - $TIMESTAMP"
echo "  Mode: $MODE"
echo "========================================"
echo ""

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

run_check() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if "$@"; then
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
}

if [[ "$MODE" == "local" ]]; then
    run_check check_lock_files_exist
    run_check check_compose_hashes
    run_check check_addon_hashes
elif [[ "$MODE" == "server" ]]; then
    if [[ -z "$SERVER_HOST" ]]; then
        echo "Error: --server requires a host"
        exit 1
    fi
    run_check check_lock_files_exist
    run_check run_server_checks "$SERVER_HOST" "$SSH_KEY" "$SSH_USER"
fi

# Summary
echo ""
echo "========================================"
echo "  SUMMARY"
echo "========================================"
echo "Total checks: $TOTAL_CHECKS"
echo "Passed: $PASSED_CHECKS"
echo "Failed: $FAILED_CHECKS"
echo ""

# Update JSON with summary
jq --arg passed "$PASSED_CHECKS" --arg failed "$FAILED_CHECKS" --arg total "$TOTAL_CHECKS" \
    '. + {"summary": {"total": ($total|tonumber), "passed": ($passed|tonumber), "failed": ($failed|tonumber)}}' \
    "$JSON_REPORT" > "$JSON_REPORT.tmp" && mv "$JSON_REPORT.tmp" "$JSON_REPORT"

# Final status
if [[ $FAILED_CHECKS -eq 0 ]]; then
    echo -e "${GREEN}OVERALL: PASS${NC}"
    jq '. + {"overall": "PASS"}' "$JSON_REPORT" > "$JSON_REPORT.tmp" && mv "$JSON_REPORT.tmp" "$JSON_REPORT"
    echo ""
    echo "Report: $JSON_REPORT"
    exit 0
else
    echo -e "${RED}OVERALL: FAIL${NC}"
    jq '. + {"overall": "FAIL"}' "$JSON_REPORT" > "$JSON_REPORT.tmp" && mv "$JSON_REPORT.tmp" "$JSON_REPORT"
    echo ""
    echo "Report: $JSON_REPORT"
    exit 1
fi
