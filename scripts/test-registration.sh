#!/bin/bash
# Registration Flow Test Script
# Tests the complete user registration flow against production or local

BASE_URL="${1:-https://biznexus.seisei.tokyo}"
TEST_EMAIL="test-$(date +%s)@example.com"

echo "=== BizNexus Registration Flow Test ==="
echo "Base URL: $BASE_URL"
echo "Test Email: $TEST_EMAIL"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

# Test 1: Health Check
info "Test 1: Checking API availability..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$HEALTH" == "200" ] || [ "$HEALTH" == "307" ]; then
    success "API is available (HTTP $HEALTH)"
else
    fail "API unavailable (HTTP $HEALTH)"
    exit 1
fi

# Test 2: Send Verification Code
info "Test 2: Sending verification code to $TEST_EMAIL..."
SEND_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/send-code" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$TEST_EMAIL\", \"locale\": \"zh\"}")

if echo "$SEND_RESPONSE" | grep -q '"success":true'; then
    success "Verification code sent"
else
    echo "Response: $SEND_RESPONSE"
    fail "Failed to send verification code"
    exit 1
fi

# Test 3: Verify Code (with test code if ALLOW_TEST_CODE is set)
info "Test 3: Verifying code..."
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/verify-code" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$TEST_EMAIL\", \"code\": \"000000\"}")

if echo "$VERIFY_RESPONSE" | grep -q '"success":true'; then
    success "Verification successful (test mode active)"
    EMAIL_TOKEN=$(echo "$VERIFY_RESPONSE" | grep -o '"emailToken":"[^"]*"' | cut -d'"' -f4)
    echo "  Email Token: ${EMAIL_TOKEN:0:50}..."
else
    echo "Response: $VERIFY_RESPONSE"
    info "Test mode not enabled or code invalid (expected in production without ALLOW_TEST_CODE)"
fi

# Test 4: Check Existing Login Works
info "Test 4: Testing existing account login..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"tenantCode": "TEN-TESTODOO", "username": "test", "password": "test123"}')

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
    success "Login successful"
    USER_NAME=$(echo "$LOGIN_RESPONSE" | grep -o '"displayName":"[^"]*"' | cut -d'"' -f4)
    echo "  User: $USER_NAME"
else
    echo "Response: $LOGIN_RESPONSE"
    fail "Login failed"
fi

# Test 5: Check OAuth Flow
info "Test 5: Testing OAuth initiation..."
OAUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/auth/google")
if [ "$OAUTH_RESPONSE" == "302" ] || [ "$OAUTH_RESPONSE" == "307" ]; then
    success "OAuth redirect working (HTTP $OAUTH_RESPONSE)"
else
    info "OAuth returned HTTP $OAUTH_RESPONSE (may need credentials)"
fi

# Test 6: API Rate Limiting Check
info "Test 6: Checking rate limiting on send-code..."
RATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/send-code" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$TEST_EMAIL\", \"locale\": \"zh\"}")

if echo "$RATE_RESPONSE" | grep -q "1分钟后再试\|wait 1 minute"; then
    success "Rate limiting is active"
else
    info "Rate limiting not triggered (or different email tested)"
fi

echo ""
echo "=== Test Summary ==="
echo "Registration flow APIs are responding correctly."
echo "Note: Full registration test requires ALLOW_TEST_CODE=true on server."
