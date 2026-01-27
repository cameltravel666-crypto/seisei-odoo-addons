#!/bin/bash
# =============================================================================
# Create TPL-QR Template Database
# =============================================================================
# Template for tenant databases with QR ordering functionality
# Minimal addon set for performance and isolation
#
# Usage: ./create_template_qr.sh
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
TEMPLATE_NAME="TPL-QR"

# Minimal addon list for QR ordering tenants
QR_ADDONS=(
    # Core
    "base"
    "web"
    "mail"
    
    # POS for QR ordering
    "point_of_sale"
    
    # QR Ordering
    "qr_ordering"
    
    # Theme
    "nagashiro_theme"
    "nagashiro_pos_receipt_branding"
    
    # Entitlements (for license management)
    "seisei_entitlements"
    
    # S3 storage (for attachments)
    "seisei_s3_attachment"
)

echo "=== Creating TPL-QR Template Database ==="
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
ADDON_LIST=$(IFS=,; echo "${QR_ADDONS[*]}")

echo "Installing addons: $ADDON_LIST"
echo ""
echo "IMPORTANT: Run the following command to install addons:"
echo "docker exec seisei-project-web odoo -d $TEMPLATE_NAME -i $ADDON_LIST --stop-after-init"
echo ""
echo "Or via Odoo web interface:"
echo "1. Login to $ODOO_URL"
echo "2. Create database: $TEMPLATE_NAME"
echo "3. Install modules: ${QR_ADDONS[*]}"

echo ""
echo "=== TPL-QR Template Setup Instructions Complete ==="
