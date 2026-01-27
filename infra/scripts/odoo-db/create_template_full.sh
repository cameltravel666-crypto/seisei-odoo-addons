#!/bin/bash
# =============================================================================
# Create TPL-FULL Template Database
# =============================================================================
# Template for OCR demo database (TEN-OCR-DEMO) and full-featured tenants
# Installs all addons including OCR, entitlements, etc.
#
# Usage: ./create_template_full.sh
#
# Environment variables:
#   PG_HOST     - PostgreSQL host (default: localhost)
#   PG_PORT     - PostgreSQL port (default: 5432)
#   PG_USER     - PostgreSQL user (default: odoo)
#   PG_PASSWORD - PostgreSQL password (required)
#   ODOO_URL    - Odoo URL (default: http://localhost:8069)
# =============================================================================

set -e

# Configuration from environment
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-odoo}"
PG_PASSWORD="${PG_PASSWORD:?PG_PASSWORD is required}"
ODOO_URL="${ODOO_URL:-http://localhost:8069}"
TEMPLATE_NAME="TPL-FULL"

# Full addon list for OCR demo and full-featured tenants
FULL_ADDONS=(
    # Core
    "base"
    "web"
    "mail"
    
    # Accounting
    "account"
    "account_accountant"
    
    # Purchase/Sales
    "purchase"
    "sale"
    "sale_management"
    
    # OCR related
    "odoo_ocr_final"
    "custom_ocr_finance"
    "ocr_file"
    "invoice_ocr"
    
    # Entitlements
    "seisei_entitlements"
    
    # Other Seisei modules
    "seisei_s3_attachment"
    "seisei_admin_gate"
    
    # POS (for QR if needed)
    "point_of_sale"
    
    # Google integration
    "seisei_gdoc_import"
    
    # Accounting extras
    "base_accounting_kit"
    "accounting_report_xlsx"
)

echo "=== Creating TPL-FULL Template Database ==="
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

# Initialize Odoo database with base
echo "Initializing Odoo database..."
# Note: This requires Odoo CLI access. If running in Docker:
# docker exec seisei-project-web odoo -d TPL-FULL -i base --stop-after-init

# Build addon list for installation
ADDON_LIST=$(IFS=,; echo "${FULL_ADDONS[*]}")

echo "Installing addons: $ADDON_LIST"
echo ""
echo "IMPORTANT: Run the following command to install addons:"
echo "docker exec seisei-project-web odoo -d $TEMPLATE_NAME -i $ADDON_LIST --stop-after-init"
echo ""
echo "Or via Odoo web interface:"
echo "1. Login to $ODOO_URL"
echo "2. Create database: $TEMPLATE_NAME"
echo "3. Install modules: ${FULL_ADDONS[*]}"

echo ""
echo "=== TPL-FULL Template Setup Instructions Complete ==="
