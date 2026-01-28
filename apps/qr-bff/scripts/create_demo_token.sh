#!/bin/bash
# Create demo token in Redis for testing

set -e

REDIS_HOST="${REDIS_HOST:-odoo-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_DB="${REDIS_DB:-1}"

# Demo token (should match a qr_token in qr_table)
DEMO_TOKEN="${1:-R8YxZM3IsfFwYz6qp1C5_g}"
TENANT_DB="${2:-ten_testodoo}"

echo "Creating demo token mapping..."
echo "Token: ${DEMO_TOKEN}"
echo "Database: ${TENANT_DB}"

# Create JSON payload
TOKEN_DATA=$(cat <<EOF
{
  "tenantDb": "${TENANT_DB}",
  "status": "active",
  "tableName": "Demo Table"
}
EOF
)

# Set in Redis
if [ -n "$REDIS_PASSWORD" ]; then
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" -n "$REDIS_DB" \
    SETEX "qr:token:${DEMO_TOKEN}" 31536000 "$TOKEN_DATA"
else
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" \
    SETEX "qr:token:${DEMO_TOKEN}" 31536000 "$TOKEN_DATA"
fi

echo "Token created successfully!"

# Verify
echo ""
echo "Verifying token..."
if [ -n "$REDIS_PASSWORD" ]; then
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" -n "$REDIS_DB" \
    GET "qr:token:${DEMO_TOKEN}"
else
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" \
    GET "qr:token:${DEMO_TOKEN}"
fi
