#!/bin/bash
# =============================================================================
# tenant_create.sh - Create new tenant by cloning from industry template
# =============================================================================
# Usage:
#   ./tenant_create.sh <TENANT_CODE> <INDUSTRY>
#
# Arguments:
#   TENANT_CODE  - Tenant code in format TEN-XXXXXXX (7-8位英数混合)
#   INDUSTRY     - Industry template: food | trade | service
#
# Examples:
#   ./tenant_create.sh TEN-MKQZYN0 food
#   ./tenant_create.sh TEN-MKT0940 trade
#   ./tenant_create.sh TEN-ABCD123 service
#
# Environment variables:
#   PG_HOST     - PostgreSQL host (default: localhost)
#   PG_PORT     - PostgreSQL port (default: 5432)
#   PG_USER     - PostgreSQL user (default: odoo)
#   PG_PASSWORD - PostgreSQL password (required)
#   BASE_DOMAIN - Base domain (default: erp.seisei.tokyo)
#
# Templates:
#   ten_tpl_food_v1    - Restaurant/Food service template
#   ten_tpl_trade_v1   - Trading/Retail template
#   ten_tpl_service_v1 - General service template
# =============================================================================

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Print functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Arguments
TENANT_CODE="${1:-}"
INDUSTRY="${2:-}"

# Configuration
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-odoo}"
PG_PASSWORD="${PG_PASSWORD:-}"
BASE_DOMAIN="${BASE_DOMAIN:-erp.seisei.tokyo}"

# Template mapping
declare -A TEMPLATES=(
    ["food"]="ten_tpl_food_v1"
    ["trade"]="ten_tpl_trade_v1"
    ["service"]="ten_tpl_service_v1"
)

# Validate arguments
validate_args() {
    if [[ -z "$TENANT_CODE" ]]; then
        log_error "Missing tenant code"
        echo "Usage: $0 <TENANT_CODE> <INDUSTRY>"
        echo "  TENANT_CODE: TEN-XXXXXXXX format"
        echo "  INDUSTRY: food | trade | service"
        exit 1
    fi

    if [[ -z "$INDUSTRY" ]]; then
        log_error "Missing industry type"
        echo "Available industries: food, trade, service"
        exit 1
    fi

    if [[ -z "$PG_PASSWORD" ]]; then
        log_error "PG_PASSWORD environment variable is required"
        exit 1
    fi
}

# Validate tenant code format (TEN-XXXXXXX, 7-8 alphanumeric)
validate_tenant_code() {
    if [[ ! "$TENANT_CODE" =~ ^TEN-[A-Za-z0-9]{7,8}$ ]]; then
        log_error "Invalid tenant code format: $TENANT_CODE"
        echo "Expected format: TEN-XXXXXXX (7-8 alphanumeric characters after TEN-)"
        echo "Examples: TEN-MKQZYN0, TEN-MKT0940, TEN-ABCD123"
        exit 1
    fi
}

# Validate industry and get template
get_template() {
    local industry_lower="${INDUSTRY,,}"  # lowercase

    if [[ -z "${TEMPLATES[$industry_lower]:-}" ]]; then
        log_error "Invalid industry: $INDUSTRY"
        echo "Available industries:"
        for key in "${!TEMPLATES[@]}"; do
            echo "  - $key (template: ${TEMPLATES[$key]})"
        done
        exit 1
    fi

    echo "${TEMPLATES[$industry_lower]}"
}

# Extract subdomain from tenant code
# TEN-MKQZYN00 -> mkqzyn00
extract_subdomain() {
    local code="$1"
    local subdomain="${code#TEN-}"  # Remove TEN- prefix
    echo "${subdomain,,}"  # lowercase
}

# Generate database name from tenant code
# TEN-MKQZYN00 -> ten_mkqzyn00
generate_db_name() {
    local code="$1"
    local subdomain
    subdomain=$(extract_subdomain "$code")
    echo "ten_${subdomain}"
}

# Check if database exists
db_exists() {
    local db_name="$1"
    PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
        -lqt | cut -d \| -f 1 | grep -qw "$db_name"
}

# Check if template exists
check_template() {
    local template="$1"

    if ! db_exists "$template"; then
        log_error "Template database does not exist: $template"
        echo ""
        echo "Available databases:"
        PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
            -lqt | cut -d \| -f 1 | grep -v "^\s*$" | sed 's/^/  /'
        echo ""
        echo "To create templates, run:"
        echo "  ./create_template_full.sh  # Creates ten_tpl_food_v1"
        exit 1
    fi
}

# Clone database from template
clone_database() {
    local template="$1"
    local new_db="$2"

    log_info "Cloning database: $template -> $new_db"

    PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -c \
        "CREATE DATABASE \"$new_db\" WITH TEMPLATE \"$template\";"
}

# Print tenant info
print_tenant_info() {
    local tenant_code="$1"
    local db_name="$2"
    local subdomain="$3"
    local template="$4"

    echo ""
    echo "========================================"
    echo " Tenant Created Successfully"
    echo "========================================"
    echo ""
    echo "  Tenant Code:  $tenant_code"
    echo "  Database:     $db_name"
    echo "  Subdomain:    $subdomain"
    echo "  Domain:       https://${subdomain}.${BASE_DOMAIN}"
    echo "  Template:     $template"
    echo ""
    echo "========================================"
    echo ""
}

# Print rollback command
print_rollback() {
    local db_name="$1"

    echo "To rollback (delete this tenant):"
    echo "  PGPASSWORD=\"\$PG_PASSWORD\" psql -h $PG_HOST -p $PG_PORT -U $PG_USER -c \"DROP DATABASE \\\"$db_name\\\";\""
    echo ""
}

# Main execution
main() {
    echo ""
    echo "=============================================="
    echo " Seisei Tenant Creation"
    echo "=============================================="
    echo ""

    validate_args
    validate_tenant_code

    local template
    template=$(get_template)

    local subdomain
    subdomain=$(extract_subdomain "$TENANT_CODE")

    local db_name
    db_name=$(generate_db_name "$TENANT_CODE")

    log_info "Tenant Code:  $TENANT_CODE"
    log_info "Industry:     $INDUSTRY"
    log_info "Template:     $template"
    log_info "Database:     $db_name"
    log_info "Subdomain:    $subdomain"
    log_info "Domain:       https://${subdomain}.${BASE_DOMAIN}"
    echo ""

    # Check if database already exists
    if db_exists "$db_name"; then
        log_error "Database already exists: $db_name"
        exit 1
    fi

    # Check if template exists
    check_template "$template"

    # Clone database
    clone_database "$template" "$db_name"

    log_success "Database created: $db_name"

    # Reset feature gate trial start to now (template carries its own install_date)
    log_info "Resetting feature gate trial start date..."
    PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db_name" -c \
        "UPDATE ir_config_parameter SET value = NOW()::text WHERE key = 'seisei_feature_gate.install_date';" \
        2>/dev/null && log_success "Trial start date reset to now" \
        || log_warn "Feature gate not installed in template — skipped"

    print_tenant_info "$TENANT_CODE" "$db_name" "$subdomain" "$template"
    print_rollback "$db_name"

    echo "Next steps:"
    echo "  1. Register tenant in BizNexus (if not auto-provisioned)"
    echo "  2. Configure initial admin user in database"
    echo "  3. Test access at https://${subdomain}.${BASE_DOMAIN}"
    echo ""
}

main "$@"
