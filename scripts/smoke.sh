#!/bin/bash
# =============================================================================
# Smoke Test Script - Production-Grade Verification
# =============================================================================
# Usage: ./smoke.sh <stack> <env> <version>
# Example: ./smoke.sh odoo18-prod prod sha-19b9b98
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Help
if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: $0 <stack> <env> <version>"
    echo "Example: $0 odoo18-prod prod sha-19b9b98"
    exit 0
fi

# Parse arguments
STACK="${1:-}"
ENV="${2:-prod}"
VERSION="${3:-unknown}"

[ -z "$STACK" ] && fail "Usage: $0 <stack> <env> <version>"

log_step "Smoke Test: $STACK ($ENV) [$VERSION]"

STACK_DIR=$(resolve_stack_dir "$STACK")
cd "$STACK_DIR" || fail "Cannot cd to $STACK_DIR"

TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: Container status
log_info "Test 1: Checking container status..."
if docker compose ps | grep -q "Up\|running"; then
    log_success "Containers are running"
    ((TESTS_PASSED+=1))
else
    log_error "No containers running"
    ((TESTS_FAILED+=1))
fi

# Test 2: Health checks
log_info "Test 2: Checking container health..."
UNHEALTHY=$(docker compose ps --format json 2>/dev/null | jq -r 'select(.Health == "unhealthy") | .Name' || echo "")
if [ -n "$UNHEALTHY" ]; then
    log_error "Unhealthy containers: $UNHEALTHY"
    ((TESTS_FAILED+=1))
else
    log_success "All containers healthy (or no health checks defined)"
    ((TESTS_PASSED+=1))
fi

# Test 3: Domain accessibility
log_info "Test 3: Checking domain accessibility..."
DOMAIN=$(get_stack_domain "$STACK")
if [ -n "$DOMAIN" ]; then
    MAX_RETRIES=3
    RETRY_INTERVAL=5
    HTTP_CODE="000"
    for attempt in $(seq 1 $MAX_RETRIES); do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$DOMAIN" || echo "000")
        log_info "  Domain check $attempt/$MAX_RETRIES: HTTP $HTTP_CODE"
        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "303" ]; then
            break
        fi
        if [ $attempt -lt $MAX_RETRIES ]; then
            sleep $RETRY_INTERVAL
        fi
    done
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "303" ]; then
        log_success "Domain accessible: $DOMAIN (HTTP $HTTP_CODE)"
        ((TESTS_PASSED+=1))
    else
        log_error "Domain not accessible: $DOMAIN (HTTP $HTTP_CODE)"
        ((TESTS_FAILED+=1))
    fi
else
    log_info "No domain configured for $STACK (skipping)"
fi

# Test 4: OCR health (if OCR stack or has OCR dependency)
if [ "$STACK" = "ocr" ] || [ "$STACK" = "odoo18-prod" ] || [ "$STACK" = "odoo18-staging" ]; then
    log_info "Test 4: Checking OCR service..."
    
    # Try internal network first
    OCR_HEALTH=$(docker run --rm --network edge curlimages/curl:latest -s -o /dev/null -w "%{http_code}" --max-time 5 http://ocr-service:8080/health 2>/dev/null || echo "000")
    
    # Fallback to localhost
    if [ "$OCR_HEALTH" = "000" ]; then
        OCR_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:8180/health || echo "000")
    fi
    
    if [ "$OCR_HEALTH" = "200" ]; then
        log_success "OCR service healthy (HTTP 200)"
        ((TESTS_PASSED+=1))
    else
        log_error "OCR service not healthy (HTTP $OCR_HEALTH)"
        ((TESTS_FAILED+=1))
    fi
fi

# Summary
log_step "Test Summary"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -gt 0 ]; then
    log_error "❌ Smoke tests FAILED ($TESTS_FAILED failures)"
    exit 1
else
    log_success "✅ All smoke tests PASSED"
    exit 0
fi
