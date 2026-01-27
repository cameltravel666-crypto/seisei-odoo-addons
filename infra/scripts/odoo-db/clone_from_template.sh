#!/bin/bash
# =============================================================================
# Clone Database from Template
# =============================================================================
# Creates a new database by cloning from a template
#
# Usage: ./clone_from_template.sh <template_name> <new_db_name>
#
# Examples:
#   ./clone_from_template.sh TPL-FULL TEN-OCR-DEMO
#   ./clone_from_template.sh TPL-QR TEN-ABCD1234
#
# Environment variables:
#   PG_HOST     - PostgreSQL host (default: localhost)
#   PG_PORT     - PostgreSQL port (default: 5432)
#   PG_USER     - PostgreSQL user (default: odoo)
#   PG_PASSWORD - PostgreSQL password (required)
# =============================================================================

set -e

# Arguments
TEMPLATE_NAME="${1:?Template name required (e.g., TPL-FULL or TPL-QR)}"
NEW_DB_NAME="${2:?New database name required (e.g., TEN-ABCD1234)}"

# Configuration from environment
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-odoo}"
PG_PASSWORD="${PG_PASSWORD:?PG_PASSWORD is required}"

echo "=== Cloning Database from Template ==="
echo "Template: $TEMPLATE_NAME"
echo "New DB:   $NEW_DB_NAME"
echo "Host:     $PG_HOST:$PG_PORT"

# Check if template exists
if ! PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -lqt | cut -d \| -f 1 | grep -qw "$TEMPLATE_NAME"; then
    echo "ERROR: Template $TEMPLATE_NAME does not exist."
    echo "Available databases:"
    PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -lqt | cut -d \| -f 1 | grep -v "^\s*$"
    exit 1
fi

# Check if new DB already exists
if PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -lqt | cut -d \| -f 1 | grep -qw "$NEW_DB_NAME"; then
    echo "ERROR: Database $NEW_DB_NAME already exists."
    exit 1
fi

# Validate naming convention
if [[ "$NEW_DB_NAME" == TEN-OCR-DEMO ]]; then
    if [[ "$TEMPLATE_NAME" != "TPL-FULL" ]]; then
        echo "WARNING: TEN-OCR-DEMO should be cloned from TPL-FULL, not $TEMPLATE_NAME"
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
elif [[ "$NEW_DB_NAME" == TEN-* ]]; then
    # Regular tenant - can use either template
    echo "Creating tenant database from $TEMPLATE_NAME..."
fi

# Clone the database
echo "Cloning database..."
PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -c \
    "CREATE DATABASE \"$NEW_DB_NAME\" WITH TEMPLATE \"$TEMPLATE_NAME\";"

echo ""
echo "=== Database Clone Complete ==="
echo "New database: $NEW_DB_NAME"
echo "Cloned from:  $TEMPLATE_NAME"
echo ""
echo "Next steps:"
echo "1. Update Odoo dbfilter if needed"
echo "2. Configure tenant mapping in BizNexus"
echo "3. Set up user accounts in the new database"
