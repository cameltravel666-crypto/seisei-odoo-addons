#!/bin/bash
# =============================================================================
# Seisei Smoke Test Script
# =============================================================================
# Usage: ./smoke-test.sh [stack|all]
#
# Environment variables (optional):
#   ODOO18_PROD_BASE_URL  - Base URL for Odoo18 prod (default: https://demo.erp.seisei.tokyo)
#   ODOO18_TEST_BASE_URL  - Base URL for Odoo18 test (default: https://testodoo.seisei.tokyo)
# =============================================================================

set -e

STACK=${1:-all}
FAILED=0
PASSED=0

# Default URLs (can be overridden via environment)
ODOO18_PROD_BASE_URL=${ODOO18_PROD_BASE_URL:-https://demo.erp.seisei.tokyo}
ODOO18_TEST_BASE_URL=${ODOO18_TEST_BASE_URL:-https://testodoo.seisei.tokyo}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_url() {
    local url=$1
    local name=$2
    local expected=${3:-200}

    local status=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

    if [[ "$status" =~ ^(200|301|302|303|304)$ ]]; then
        echo -e "${GREEN}✓${NC} ${name} (${url}) - ${status}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} ${name} (${url}) - ${status}"
        ((FAILED++))
        return 1
    fi
}

check_container() {
    local container=$1
    local name=$2

    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "running")
        if [[ "$health" == "healthy" || "$health" == "running" ]]; then
            echo -e "${GREEN}✓${NC} Container: ${name} (${container}) - ${health}"
            ((PASSED++))
            return 0
        fi
    fi
    echo -e "${RED}✗${NC} Container: ${name} (${container}) - not running/unhealthy"
    ((FAILED++))
    return 1
}

check_port() {
    local host=$1
    local port=$2
    local name=$3

    if nc -z -w 5 "$host" "$port" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Port: ${name} (${host}:${port}) - open"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} Port: ${name} (${host}:${port}) - closed/timeout"
        ((FAILED++))
        return 1
    fi
}

echo "============================================"
echo "Seisei Smoke Test"
echo "Target: ${STACK}"
echo "============================================"
echo ""

# URL tests
case $STACK in
    erp-seisei|all)
        echo "--- ERP Seisei ---"
        check_url "https://erp.seisei.tokyo" "ERP Main" || true
        check_url "https://biznexus.seisei.tokyo" "BizNexus" || true
        check_container "seisei-erp-app" "ERP App" || true
        check_container "seisei-erp-db" "ERP DB" || true
        echo ""
        ;;&

    web-seisei|all)
        echo "--- Web Seisei ---"
        check_url "https://seisei.tokyo" "Main Site" || true
        check_url "https://www.seisei.tokyo" "WWW" || true
        check_container "seisei-www" "WWW" || true
        echo ""
        ;;&

    odoo18-test|all)
        echo "--- Odoo18 Test ---"
        check_url "${ODOO18_TEST_BASE_URL}/web/login" "Odoo18 Test Login" || true
        check_url "${ODOO18_TEST_BASE_URL}/web/health" "Odoo18 Test Health" || true
        check_container "seisei-test-web" "Odoo Web" || true
        check_container "seisei-test-db" "Odoo DB" || true
        check_container "seisei-test-redis" "Odoo Redis" || true
        echo ""
        ;;&

    odoo18-prod|all)
        echo "--- Odoo18 Prod ---"
        # URL checks - 8069 main service
        check_url "${ODOO18_PROD_BASE_URL}/web/health" "Odoo18 Prod Health (8069)" || true
        check_url "${ODOO18_PROD_BASE_URL}/web/login" "Odoo18 Prod Login" || true

        # Container checks
        check_container "seisei-project-web" "Odoo Web" || true
        check_container "seisei-project-db" "Odoo DB" || true
        check_container "seisei-project-redis" "Odoo Redis" || true

        # Port 8072 longpolling/websocket check
        # Note: We check via Traefik route since direct port may not be exposed
        # The /longpolling endpoint should be accessible via the main URL
        echo -e "${YELLOW}Note:${NC} Longpolling (8072) is tested via Traefik route"
        check_url "${ODOO18_PROD_BASE_URL}/longpolling/poll" "Odoo18 Prod Longpolling" || true

        # Internal port check (if running on the server)
        if command -v nc &> /dev/null; then
            # Extract hostname from URL for port check
            ODOO_HOST=$(echo "$ODOO18_PROD_BASE_URL" | sed -E 's|https?://([^/]+).*|\1|')
            echo -e "${YELLOW}Note:${NC} Internal port checks (localhost) - skip if running remotely"
            check_port "localhost" "8069" "Odoo HTTP (internal)" 2>/dev/null || true
            check_port "localhost" "8072" "Odoo Longpolling (internal)" 2>/dev/null || true
        fi
        echo ""
        ;;&

    langbot|all)
        echo "--- LangBot ---"
        check_url "https://langbot.seisei.tokyo" "LangBot" || true
        check_container "langbot" "LangBot" || true
        echo ""
        ;;&

    ocr|all)
        echo "--- OCR Service ---"
        check_container "ocr-service" "OCR Service" || true
        check_container "ocr-db" "OCR DB" || true
        echo ""
        ;;&

    edge-traefik|all)
        echo "--- Traefik ---"
        check_container "traefik" "Traefik" || true
        echo ""
        ;;&
esac

echo "============================================"
echo "Results: ${PASSED} passed, ${FAILED} failed"
echo "============================================"

if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}SMOKE TEST FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}SMOKE TEST PASSED${NC}"
    exit 0
fi
