#!/usr/bin/env bash
# validate_routes.sh - Check for Traefik routing conflicts
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Check for Traefik routing conflicts.

Modes:
  --local           Analyze file provider configs in repo (default)
  --server HOST     Query live Traefik API
  --ssh-key FILE    SSH key for server mode

Options:
  --fix             Output suggested fixes
  --json            Output in JSON format
  --help            Show this help

Examples:
  $(basename "$0")
  $(basename "$0") --server 54.65.127.141 --ssh-key ~/.ssh/key.pem
  $(basename "$0") --local --fix

EOF
    exit 0
}

log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_conflict() { echo -e "${RED}[CONFLICT]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }

# Parse arguments
MODE="local"
SERVER_HOST=""
SSH_KEY=""
SHOW_FIX=false
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --local) MODE="local"; shift ;;
        --server) MODE="server"; SERVER_HOST="$2"; shift 2 ;;
        --ssh-key) SSH_KEY="$2"; shift 2 ;;
        --fix) SHOW_FIX=true; shift ;;
        --json) JSON_OUTPUT=true; shift ;;
        --help|-h) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

# Arrays to track routes
declare -A ROUTES
declare -A ROUTE_SOURCES
CONFLICTS=()

parse_file_provider_routes() {
    local config_dir="$REPO_ROOT/infra/stacks/edge-traefik/dynamic"

    if [[ ! -d "$config_dir" ]]; then
        config_dir="$REPO_ROOT/infra/traefik/dynamic"
    fi

    if [[ ! -d "$config_dir" ]]; then
        log_warn "No traefik dynamic config directory found"
        return
    fi

    log_info "Scanning file provider configs in: $config_dir"

    for yml_file in "$config_dir"/*.yml "$config_dir"/*.yaml; do
        [[ -f "$yml_file" ]] || continue
        [[ "$yml_file" == *".disabled"* ]] && continue

        local filename
        filename=$(basename "$yml_file")

        # Parse router rules using grep/sed (portable)
        while IFS= read -r line; do
            # Match lines with rule: Host(...) or PathPrefix(...)
            if [[ "$line" =~ rule:[[:space:]]*[\"\']?(.+)[\"\']? ]]; then
                local rule="${BASH_REMATCH[1]}"

                # Extract Host and PathPrefix
                local host=""
                local path=""

                if [[ "$rule" =~ Host\(\`([^\`]+)\`\) ]]; then
                    host="${BASH_REMATCH[1]}"
                fi
                if [[ "$rule" =~ PathPrefix\(\`([^\`]+)\`\) ]]; then
                    path="${BASH_REMATCH[1]}"
                fi

                if [[ -n "$host" ]]; then
                    local route_key="$host$path"
                    local route_desc="Host: $host, Path: ${path:-/}"

                    if [[ -n "${ROUTES[$route_key]:-}" ]]; then
                        # Conflict found!
                        CONFLICTS+=("$route_key")
                        ROUTE_SOURCES["$route_key"]="${ROUTE_SOURCES[$route_key]}, $filename"
                    else
                        ROUTES["$route_key"]="$route_desc"
                        ROUTE_SOURCES["$route_key"]="$filename"
                    fi
                fi
            fi
        done < "$yml_file"
    done
}

parse_docker_labels() {
    local stacks_dir="$REPO_ROOT/infra/stacks"

    if [[ ! -d "$stacks_dir" ]]; then
        return
    fi

    log_info "Scanning Docker compose labels in: $stacks_dir"

    for compose_file in "$stacks_dir"/*/docker-compose.yml; do
        [[ -f "$compose_file" ]] || continue

        local stack_name
        stack_name=$(basename "$(dirname "$compose_file")")

        # Parse traefik labels
        while IFS= read -r line; do
            if [[ "$line" =~ traefik\.http\.routers\.[^\.]+\.rule.*Host\(\`([^\`]+)\`\) ]]; then
                local host="${BASH_REMATCH[1]}"
                local path=""

                if [[ "$line" =~ PathPrefix\(\`([^\`]+)\`\) ]]; then
                    path="${BASH_REMATCH[1]}"
                fi

                local route_key="$host$path"
                local route_desc="Host: $host, Path: ${path:-/}"

                if [[ -n "${ROUTES[$route_key]:-}" ]]; then
                    CONFLICTS+=("$route_key")
                    ROUTE_SOURCES["$route_key"]="${ROUTE_SOURCES[$route_key]}, $stack_name (labels)"
                else
                    ROUTES["$route_key"]="$route_desc"
                    ROUTE_SOURCES["$route_key"]="$stack_name (labels)"
                fi
            fi
        done < "$compose_file"
    done
}

query_traefik_api() {
    local host="$1"
    local ssh_opts=""

    if [[ -n "$SSH_KEY" ]]; then
        ssh_opts="-i $SSH_KEY"
    fi

    log_info "Querying Traefik API on $host..."

    local routers
    routers=$(ssh $ssh_opts "ubuntu@$host" 'curl -s http://localhost:8888/api/http/routers' 2>/dev/null || echo "[]")

    if [[ "$routers" == "[]" ]]; then
        log_warn "No routers returned from API"
        return
    fi

    echo "$routers" | jq -r '.[] | "\(.name)|\(.rule)|\(.service)"' 2>/dev/null | while IFS='|' read -r name rule service; do
        local host=""
        local path=""

        if [[ "$rule" =~ Host\(\`([^\`]+)\`\) ]]; then
            host="${BASH_REMATCH[1]}"
        fi
        if [[ "$rule" =~ PathPrefix\(\`([^\`]+)\`\) ]]; then
            path="${BASH_REMATCH[1]}"
        fi

        if [[ -n "$host" ]]; then
            local route_key="$host$path"

            if [[ -n "${ROUTES[$route_key]:-}" ]]; then
                CONFLICTS+=("$route_key")
                ROUTE_SOURCES["$route_key"]="${ROUTE_SOURCES[$route_key]}, $name (API)"
            else
                ROUTES["$route_key"]="Host: $host, Path: ${path:-/}"
                ROUTE_SOURCES["$route_key"]="$name"
            fi
        fi
    done
}

check_common_conflicts() {
    log_info "Checking for known problematic patterns..."

    # Check for /qr vs /qr_ordering conflict
    local qr_routes=()
    for key in "${!ROUTES[@]}"; do
        if [[ "$key" == *"/qr"* ]]; then
            qr_routes+=("$key -> ${ROUTE_SOURCES[$key]}")
        fi
    done

    if [[ ${#qr_routes[@]} -gt 1 ]]; then
        log_warn "Multiple /qr* routes found - verify priority:"
        for r in "${qr_routes[@]}"; do
            echo "    $r"
        done
    fi

    # Check for missing trailing slash issues
    for key in "${!ROUTES[@]}"; do
        if [[ "$key" =~ /[a-z]+$ ]] && [[ -n "${ROUTES[$key/]:-}" ]]; then
            log_warn "Possible slash conflict: $key vs $key/"
        fi
    done
}

print_summary() {
    echo ""
    echo "========================================"
    echo "  Route Validation Summary"
    echo "========================================"
    echo ""

    echo "Total routes found: ${#ROUTES[@]}"
    echo ""

    if [[ ${#CONFLICTS[@]} -eq 0 ]]; then
        log_ok "No routing conflicts detected"
    else
        log_conflict "Found ${#CONFLICTS[@]} potential conflicts:"
        echo ""

        for conflict in "${CONFLICTS[@]}"; do
            echo "  Route: $conflict"
            echo "  Defined in: ${ROUTE_SOURCES[$conflict]}"
            echo ""
        done
    fi

    if $SHOW_FIX && [[ ${#CONFLICTS[@]} -gt 0 ]]; then
        echo ""
        echo "Suggested fixes:"
        echo "1. Use priority in file provider to control matching order"
        echo "2. Use more specific PathPrefix (e.g., /qr-ordering instead of /qr)"
        echo "3. Avoid defining same route in both file provider and docker labels"
        echo "4. Add StripPrefix middleware when needed"
        echo ""
        echo "Example priority fix in traefik dynamic config:"
        echo '  my-router:'
        echo '    rule: "Host(`example.com`) && PathPrefix(`/api`)"'
        echo '    priority: 100  # Higher number = higher priority'
    fi
}

print_json_output() {
    echo "{"
    echo '  "routes": ['

    local first=true
    for key in "${!ROUTES[@]}"; do
        if ! $first; then echo ","; fi
        first=false
        printf '    {"route": "%s", "description": "%s", "sources": "%s"}' \
            "$key" "${ROUTES[$key]}" "${ROUTE_SOURCES[$key]}"
    done

    echo ""
    echo "  ],"
    echo '  "conflicts": ['

    first=true
    for conflict in "${CONFLICTS[@]}"; do
        if ! $first; then echo ","; fi
        first=false
        printf '    {"route": "%s", "sources": "%s"}' "$conflict" "${ROUTE_SOURCES[$conflict]}"
    done

    echo ""
    echo "  ],"
    echo "  \"total_routes\": ${#ROUTES[@]},"
    echo "  \"total_conflicts\": ${#CONFLICTS[@]},"
    echo "  \"status\": \"$(if [[ ${#CONFLICTS[@]} -eq 0 ]]; then echo "PASS"; else echo "FAIL"; fi)\""
    echo "}"
}

# Main execution
if [[ "$MODE" == "local" ]]; then
    parse_file_provider_routes
    parse_docker_labels
elif [[ "$MODE" == "server" ]]; then
    if [[ -z "$SERVER_HOST" ]]; then
        echo "Error: --server requires a host"
        exit 1
    fi
    query_traefik_api "$SERVER_HOST"
fi

check_common_conflicts

if $JSON_OUTPUT; then
    print_json_output
else
    print_summary
fi

# Exit code based on conflicts
if [[ ${#CONFLICTS[@]} -gt 0 ]]; then
    exit 1
fi
exit 0
