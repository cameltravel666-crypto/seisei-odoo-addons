#!/bin/bash
# Test QR-BFF API flow

set -e

QR_BFF_URL="${QR_BFF_URL:-http://localhost:3100}"
TOKEN="${1:-R8YxZM3IsfFwYz6qp1C5_g}"
CLIENT_ORDER_ID="test-$(date +%s)"

echo "================================================"
echo "Testing QR-BFF API Flow"
echo "================================================"
echo "URL: ${QR_BFF_URL}"
echo "Token: ${TOKEN}"
echo ""

# Health check
echo "1) Health Check"
echo "---"
curl -s "${QR_BFF_URL}/v1/qr/health" | jq .
echo ""

# Get context
echo "2) GET /v1/qr/:token/context"
echo "---"
CONTEXT=$(curl -s "${QR_BFF_URL}/v1/qr/${TOKEN}/context")
echo "$CONTEXT" | jq .

TENANT_DB=$(echo "$CONTEXT" | jq -r '.tenant_db')
if [ "$TENANT_DB" == "null" ] || [ -z "$TENANT_DB" ]; then
  echo "ERROR: Failed to get tenant_db from context"
  exit 1
fi
echo "tenant_db: ${TENANT_DB}"
echo ""

# Get menu
echo "3) GET /v1/qr/:token/menu"
echo "---"
MENU=$(curl -s "${QR_BFF_URL}/v1/qr/${TOKEN}/menu")
ITEM_COUNT=$(echo "$MENU" | jq '.items | length')
echo "Menu items count: ${ITEM_COUNT}"
echo "First 3 items:"
echo "$MENU" | jq '.items[:3]'
echo ""

# Create order (if menu has items)
if [ "$ITEM_COUNT" -gt 0 ]; then
  FIRST_PRODUCT_ID=$(echo "$MENU" | jq '.items[0].id')

  echo "4) POST /v1/qr/:token/order"
  echo "---"
  echo "Creating order with product_id=${FIRST_PRODUCT_ID}, client_order_id=${CLIENT_ORDER_ID}"

  ORDER=$(curl -s -X POST "${QR_BFF_URL}/v1/qr/${TOKEN}/order" \
    -H "Content-Type: application/json" \
    -d "{
      \"items\": [{\"product_id\": ${FIRST_PRODUCT_ID}, \"qty\": 1}],
      \"client_order_id\": \"${CLIENT_ORDER_ID}\"
    }")

  echo "$ORDER" | jq .

  ORDER_ID=$(echo "$ORDER" | jq -r '.order_id')

  if [ "$ORDER_ID" != "null" ] && [ -n "$ORDER_ID" ]; then
    echo ""
    echo "5) GET /v1/qr/:token/order/:orderId"
    echo "---"
    curl -s "${QR_BFF_URL}/v1/qr/${TOKEN}/order/${ORDER_ID}" | jq .

    echo ""
    echo "6) Idempotency test - same client_order_id"
    echo "---"
    ORDER2=$(curl -s -X POST "${QR_BFF_URL}/v1/qr/${TOKEN}/order" \
      -H "Content-Type: application/json" \
      -d "{
        \"items\": [{\"product_id\": ${FIRST_PRODUCT_ID}, \"qty\": 2}],
        \"client_order_id\": \"${CLIENT_ORDER_ID}\"
      }")

    ORDER2_ID=$(echo "$ORDER2" | jq -r '.order_id')

    if [ "$ORDER_ID" == "$ORDER2_ID" ]; then
      echo "PASS: Same order_id returned (${ORDER_ID})"
    else
      echo "FAIL: Different order_id (${ORDER_ID} vs ${ORDER2_ID})"
    fi
  else
    echo "WARN: Order creation returned no order_id"
  fi
else
  echo "SKIP: No menu items available for order test"
fi

echo ""
echo "================================================"
echo "Test completed!"
echo "================================================"
