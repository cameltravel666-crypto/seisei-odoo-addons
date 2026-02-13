#!/bin/bash
# =============================================================================
# Create B2B Template Database (ten_tpl_b2b_v1)
# =============================================================================
# Unified B2B template for all industry tenants.
# Includes: Accounting (JP CoA), OCR, POS, HR/Payroll, nagashiro_theme
#
# Usage: ./create_template_full.sh
#
# Environment variables:
#   PG_HOST     - PostgreSQL host (default: localhost)
#   PG_PORT     - PostgreSQL port (default: 5432)
#   PG_USER     - PostgreSQL user (default: odoo)
#   PG_PASSWORD - PostgreSQL password (required)
#   ODOO_URL    - Odoo URL (default: http://localhost:8069)
#
# NOTE: This script creates an EMPTY database and prints instructions.
#       The actual module installation must be done via Odoo CLI or XML-RPC.
#       Alternatively, clone from an existing working database.
# =============================================================================

set -e

# Configuration from environment
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-odoo}"
PG_PASSWORD="${PG_PASSWORD:?PG_PASSWORD is required}"
ODOO_URL="${ODOO_URL:-http://localhost:8069}"
TEMPLATE_NAME="ten_tpl_b2b_v1"

# Module list matching the production B2B template
# Excluded: ai_companion (not production-ready)
#           account_accountant (Odoo Enterprise, not available)
#           seisei_theme (conflicts with nagashiro_theme)
#           seisei_admin_gate (per-tenant config, not for template)
#           seisei_hr_menu (needs seisei_hr_menu fix deployed first)
B2B_ADDONS=(
    # Core
    "base" "web" "mail"

    # Accounting & Japan localization
    "account" "l10n_jp" "l10n_jp_seisei"
    "account_financial_report" "report_xlsx" "date_range"

    # Purchase/Sales
    "purchase" "sale" "sale_management"

    # OCR
    "odoo_ocr_final" "custom_ocr_finance" "ocr_file"

    # Entitlements & Infrastructure
    "seisei_entitlements" "seisei_s3_attachment"
    "seisei_db_router" "seisei_chartjs_loader" "seisei_mutex_toggle"

    # POS
    "point_of_sale" "seisei_pos_printer"

    # Google integration
    "seisei_gdoc_import"

    # Theme
    "nagashiro_theme"

    # Accounting & Reports
    "seisei_account_reports" "seisei_ar_ap_netting"
    "seisei_bank_statement_ocr"

    # Contact & HR/Payroll
    "seisei_contact_api"
    "bi_hr_payroll" "bi_hr_payroll_jp"

    # Communication & Print
    "seisei_multilang_send" "seisei_print_manager"

    # Utilities
    "product_image_clipboard" "report_lang_api" "web_patch"
)

echo "=== Creating B2B Template Database ==="
echo "Host: $PG_HOST:$PG_PORT"
echo "User: $PG_USER"
echo "Template: $TEMPLATE_NAME"

# Check if template already exists
if PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -lqt | cut -d \| -f 1 | grep -qw "$TEMPLATE_NAME"; then
    echo "Template $TEMPLATE_NAME already exists. Drop it first if you want to recreate."
    echo "Run: PGPASSWORD=xxx psql -h $PG_HOST -p $PG_PORT -U $PG_USER -c 'DROP DATABASE \"$TEMPLATE_NAME\";'"
    exit 1
fi

# Create empty database
echo "Creating database $TEMPLATE_NAME..."
PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -c "CREATE DATABASE \"$TEMPLATE_NAME\";"

# Build addon list for installation
ADDON_LIST=$(IFS=,; echo "${B2B_ADDONS[*]}")

echo ""
echo "Database created. Install modules with one of these methods:"
echo ""
echo "Method 1 - Docker CLI (requires stopping web first):"
echo "  docker compose stop web"
echo "  docker compose run --rm web odoo -d $TEMPLATE_NAME -i $ADDON_LIST --stop-after-init"
echo "  docker compose up -d web"
echo ""
echo "Method 2 - XML-RPC to running Odoo (no downtime):"
echo "  Use the Odoo XML-RPC API to install modules one by one"
echo ""
echo "Post-install steps:"
echo "  1. Set company country=JP, currency=JPY"
echo "  2. Apply chart of accounts: res.config.settings chart_template='jp'"
echo "  3. Reset admin password"
echo "  4. Clear web.base.url"
echo ""
echo "=== B2B Template Setup Instructions Complete ==="
