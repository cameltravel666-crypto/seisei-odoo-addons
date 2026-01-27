#!/bin/bash
# =============================================================================
# Verify Three-Chain Routing
# =============================================================================
# Tests the three isolated routing chains:
# 1. TRY_OCR - Public OCR demo
# 2. TENANT - Normal tenant operations
# 3. ADMIN - Admin backend access
#
# Usage: ./verify-routing.sh [environment]
#   environment: local | staging | prod (default: local)
# =============================================================================

set -e

ENV="${1:-local}"

# URLs based on environment
case "$ENV" in
    local)
        BIZNEXUS_URL="http://localhost:3000"
        ODOO_URL="http://localhost:8069"
        TENANT_SUBDOMAIN="demo"
        ;;
    staging)
        BIZNEXUS_URL="https://staging.biznexus.seisei.tokyo"
        ODOO_URL="https://testodoo.seisei.tokyo"
        TENANT_SUBDOMAIN="test"
        ;;
    prod)
        BIZNEXUS_URL="https://biznexus.seisei.tokyo"
        ODOO_URL="https://demo.erp.seisei.tokyo"
        TENANT_SUBDOMAIN="demo"
        ;;
    *)
        echo "Unknown environment: $ENV"
        exit 1
        ;;
esac

echo "=== Verifying Three-Chain Routing ($ENV) ==="
echo ""

PASS_COUNT=0
FAIL_COUNT=0

check() {
    local name="$1"
    local result="$2"
    if [ "$result" = "PASS" ]; then
        echo "[PASS] $name"
        ((PASS_COUNT++))
    else
        echo "[FAIL] $name"
        ((FAIL_COUNT++))
    fi
}

# -----------------------------------------------------------------
# Chain 1: TRY_OCR - Public OCR Demo
# -----------------------------------------------------------------
echo "--- Chain 1: TRY_OCR ---"

# Test 1.1: Try-OCR page is accessible
RESULT="FAIL"
if curl -sf "$BIZNEXUS_URL/try-ocr" > /dev/null 2>&1; then
    RESULT="PASS"
fi
check "TRY_OCR: /try-ocr page accessible" "$RESULT"

# Test 1.2: Public session API works
RESULT="FAIL"
RESPONSE=$(curl -sf "$BIZNEXUS_URL/api/public/session" 2>/dev/null || echo "ERROR")
if echo "$RESPONSE" | grep -q '"success":true'; then
    RESULT="PASS"
fi
check "TRY_OCR: /api/public/session returns success" "$RESULT"

# Test 1.3: DB override parameter is rejected
RESULT="FAIL"
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$BIZNEXUS_URL/api/public/session?db=evil" 2>/dev/null || echo "000")
# Should return 400 if db param is rejected
if [ "$HTTP_CODE" = "400" ]; then
    RESULT="PASS"
fi
check "TRY_OCR: db parameter override rejected (HTTP $HTTP_CODE, expect 400)" "$RESULT"

echo ""

# -----------------------------------------------------------------
# Chain 2: TENANT - Normal Tenant Operations
# -----------------------------------------------------------------
echo "--- Chain 2: TENANT ---"

# Test 2.1: Login page accessible
RESULT="FAIL"
if curl -sf "$BIZNEXUS_URL/login" > /dev/null 2>&1; then
    RESULT="PASS"
fi
check "TENANT: /login page accessible" "$RESULT"

# Test 2.2: Auth endpoint exists
RESULT="FAIL"
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$BIZNEXUS_URL/api/auth/me" 2>/dev/null || echo "000")
# Should return 401 without auth, not 404
if [ "$HTTP_CODE" = "401" ]; then
    RESULT="PASS"
fi
check "TENANT: /api/auth/me returns 401 without auth (HTTP $HTTP_CODE)" "$RESULT"

echo ""

# -----------------------------------------------------------------
# Chain 3: ADMIN - Admin Backend Access
# -----------------------------------------------------------------
echo "--- Chain 3: ADMIN ---"

# Test 3.1: Admin domain requires authentication
RESULT="FAIL"
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$ODOO_URL/web" 2>/dev/null || echo "000")
# Should redirect to login (302) or show login page (200)
if [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "200" ]; then
    RESULT="PASS"
fi
check "ADMIN: $ODOO_URL/web responds (HTTP $HTTP_CODE)" "$RESULT"

# Test 3.2: Odoo health check
RESULT="FAIL"
if curl -sf "$ODOO_URL/web/health" > /dev/null 2>&1; then
    RESULT="PASS"
fi
check "ADMIN: Odoo health check at $ODOO_URL/web/health" "$RESULT"

echo ""

# -----------------------------------------------------------------
# Summary
# -----------------------------------------------------------------
echo "=== Verification Summary ==="
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "RESULT: SOME CHECKS FAILED"
    exit 1
else
    echo "RESULT: ALL CHECKS PASSED"
    exit 0
fi
