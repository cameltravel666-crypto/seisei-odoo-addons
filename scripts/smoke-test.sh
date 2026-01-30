#!/bin/bash
# =============================================================================
# Smoke Test Script - Validate Odoo Deployment
# =============================================================================
# Usage: ./smoke-test.sh [stack_name] [base_url]
# Example: ./smoke-test.sh odoo18-staging https://staging.erp.seisei.tokyo
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STACK_NAME="${1:-odoo18-staging}"
BASE_URL="${2:-https://staging.erp.seisei.tokyo}"
TIMEOUT=10

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# =============================================================================
# Test Functions
# =============================================================================

test_health_endpoint() {
    log_info "Testing health endpoint..."

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "${BASE_URL}/web/health" || echo "000")

    if [ "$HTTP_CODE" == "200" ]; then
        log_success "Health endpoint returned 200 OK"
        return 0
    else
        log_error "Health endpoint returned $HTTP_CODE (expected 200)"
        return 1
    fi
}

test_web_login_page() {
    log_info "Testing web login page..."

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "${BASE_URL}/web/login" || echo "000")

    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "303" ]; then
        log_success "Login page accessible (HTTP $HTTP_CODE)"
        return 0
    else
        log_error "Login page returned $HTTP_CODE"
        return 1
    fi
}

test_static_resources() {
    log_info "Testing static resources..."

    # Test if static CSS/JS are served
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "${BASE_URL}/web/static/src/scss/primary_variables.scss" || echo "000")

    if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "304" ]; then
        log_success "Static resources accessible"
        return 0
    else
        log_warning "Static resources might not be cached (HTTP $HTTP_CODE)"
        return 0  # Not critical
    fi
}

test_database_connectivity() {
    log_info "Testing database connectivity..."

    # Check if web interface loads (implies DB connection)
    RESPONSE=$(curl -s --max-time $TIMEOUT "${BASE_URL}/web/database/selector" || echo "")

    if echo "$RESPONSE" | grep -q "database" || echo "$RESPONSE" | grep -q "odoo"; then
        log_success "Database connectivity verified"
        return 0
    else
        log_error "Cannot verify database connectivity"
        return 1
    fi
}

test_container_running() {
    log_info "Testing if containers are running..."

    # Check if web container is running
    if docker ps | grep -q "${STACK_NAME}-web"; then
        log_success "Web container is running"
    else
        log_error "Web container is not running"
        return 1
    fi

    # Check if redis container is running
    if docker ps | grep -q "${STACK_NAME}-redis"; then
        log_success "Redis container is running"
    else
        log_warning "Redis container might not be running"
    fi

    return 0
}

test_container_health() {
    log_info "Testing container health status..."

    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "${STACK_NAME}-web" 2>/dev/null || echo "unknown")

    if [ "$HEALTH_STATUS" == "healthy" ]; then
        log_success "Container health check: healthy"
        return 0
    elif [ "$HEALTH_STATUS" == "starting" ]; then
        log_warning "Container health check: starting (wait and retry)"
        return 0
    else
        log_error "Container health check: $HEALTH_STATUS"
        return 1
    fi
}

test_ocr_integration() {
    log_info "Testing OCR service integration..."

    # This is a basic check - actual OCR upload test would require authentication
    # Just verify the OCR service is accessible from the container
    OCR_SERVICE=$(docker exec "${STACK_NAME}-web" printenv OCR_SERVICE_URL 2>/dev/null || echo "")

    if [ -n "$OCR_SERVICE" ]; then
        log_success "OCR service configuration found: $OCR_SERVICE"
        return 0
    else
        log_warning "OCR service URL not configured"
        return 0  # Not critical for basic smoke test
    fi
}

test_qr_ordering_module() {
    log_info "Testing QR ordering module..."

    # Check if QR ordering static files exist in container
    docker exec "${STACK_NAME}-web" test -d /mnt/extra-addons/seisei/qr_ordering 2>/dev/null

    if [ $? -eq 0 ]; then
        log_success "QR ordering module files present"
        return 0
    else
        log_warning "QR ordering module not found"
        return 0  # Not critical
    fi
}

test_response_time() {
    log_info "Testing response time..."

    START_TIME=$(date +%s%N)
    curl -s --max-time $TIMEOUT "${BASE_URL}/web/health" > /dev/null
    END_TIME=$(date +%s%N)

    RESPONSE_TIME=$(( (END_TIME - START_TIME) / 1000000 ))  # Convert to milliseconds

    if [ $RESPONSE_TIME -lt 3000 ]; then
        log_success "Response time: ${RESPONSE_TIME}ms (good)"
        return 0
    elif [ $RESPONSE_TIME -lt 5000 ]; then
        log_warning "Response time: ${RESPONSE_TIME}ms (acceptable)"
        return 0
    else
        log_warning "Response time: ${RESPONSE_TIME}ms (slow)"
        return 0
    fi
}

test_ssl_certificate() {
    log_info "Testing SSL certificate..."

    if [[ "$BASE_URL" == https://* ]]; then
        SSL_OUTPUT=$(echo | timeout 5 openssl s_client -servername $(echo $BASE_URL | sed 's|https://||' | sed 's|/.*||') -connect $(echo $BASE_URL | sed 's|https://||' | sed 's|/.*||'):443 2>&1 || echo "")

        if echo "$SSL_OUTPUT" | grep -q "Verify return code: 0"; then
            log_success "SSL certificate is valid"
            return 0
        else
            log_warning "SSL certificate validation unclear"
            return 0
        fi
    else
        log_info "Skipping SSL test (HTTP URL)"
        return 0
    fi
}

# =============================================================================
# Main Test Execution
# =============================================================================

echo "=========================================="
echo "  Smoke Test - $STACK_NAME"
echo "=========================================="
echo "Stack: $STACK_NAME"
echo "URL: $BASE_URL"
echo "Timeout: ${TIMEOUT}s"
echo "=========================================="
echo ""

# Run all tests
test_container_running
test_container_health
test_health_endpoint
test_web_login_page
test_database_connectivity
test_static_resources
test_response_time
test_ssl_certificate
test_ocr_integration
test_qr_ordering_module

# Summary
echo ""
echo "=========================================="
echo "  Test Summary"
echo "=========================================="
echo -e "Total tests:  $TESTS_TOTAL"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
echo "=========================================="

# Exit with error if any tests failed
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}❌ Smoke tests FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}✅ All smoke tests PASSED${NC}"
    exit 0
fi
