#!/bin/bash
# Seisei 冒烟测试脚本
# 用法: ./smoke-test.sh [stack|all]

set -e

STACK=${1:-all}
FAILED=0
PASSED=0

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

check_url() {
    local url=$1
    local name=$2
    local expected=${3:-200}

    local status=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

    if [[ "$status" =~ ^(200|301|302|304)$ ]]; then
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

echo "============================================"
echo "Seisei Smoke Test"
echo "Target: ${STACK}"
echo "============================================"
echo ""

# URL 测试
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
        check_url "https://testodoo.seisei.tokyo/web/login" "Odoo18 Test" || true
        check_container "seisei-test-web" "Odoo Web" || true
        check_container "seisei-test-db" "Odoo DB" || true
        check_container "seisei-test-redis" "Odoo Redis" || true
        echo ""
        ;;&

    odoo18-prod|all)
        echo "--- Odoo18 Prod ---"
        check_container "seisei-project-web" "Odoo Web" || true
        check_container "seisei-project-db" "Odoo DB" || true
        check_container "seisei-project-redis" "Odoo Redis" || true
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

exit $FAILED
