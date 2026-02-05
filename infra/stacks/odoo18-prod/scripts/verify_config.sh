#!/bin/bash
# verify_config.sh - 验证生产环境配置完整性
# 用途：部署前/后验证所有必需配置项
# 执行时机：每次部署前必须运行

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$STACK_DIR/.env"
ODOO_CONF="$STACK_DIR/config/odoo.conf"

ERRORS=0
WARNINGS=0

echo "════════════════════════════════════════════════════════"
echo "  Odoo 18 Production Configuration Verification"
echo "════════════════════════════════════════════════════════"
echo ""

# 检查函数
check_required() {
    local var_name=$1
    local description=$2

    if grep -q "^${var_name}=" "$ENV_FILE" && [ -n "$(grep "^${var_name}=" "$ENV_FILE" | cut -d'=' -f2)" ]; then
        echo "✓ $description: OK"
        return 0
    else
        echo "✗ $description: MISSING"
        ((ERRORS++))
        return 1
    fi
}

check_warning() {
    local var_name=$1
    local description=$2

    if grep -q "^${var_name}=" "$ENV_FILE" && [ -n "$(grep "^${var_name}=" "$ENV_FILE" | cut -d'=' -f2)" ]; then
        echo "✓ $description: OK"
        return 0
    else
        echo "⚠ $description: MISSING (optional)"
        ((WARNINGS++))
        return 1
    fi
}

# 1. 数据库配置检查
echo "1. Database Configuration"
echo "─────────────────────────"
check_required "DB_HOST" "Database Host"
check_required "DB_USER" "Database User"
check_required "DB_PASSWORD" "Database Password"
check_required "DB_NAME" "Database Name"
check_required "DB_SSLMODE" "Database SSL Mode"

# 验证odoo.conf没有硬编码密码
echo ""
if grep -q "^db_password" "$ODOO_CONF" && ! grep -q "^#db_password" "$ODOO_CONF"; then
    echo "✗ CRITICAL: odoo.conf has hardcoded db_password"
    echo "  This will override environment variables!"
    echo "  Action: Comment out db_password in odoo.conf"
    ((ERRORS++))
else
    echo "✓ odoo.conf: No hardcoded passwords"
fi

# 2. S3配置检查
echo ""
echo "2. S3 Storage Configuration"
echo "────────────────────────────"
check_required "SEISEI_S3_BUCKET" "S3 Bucket Name"
check_required "SEISEI_S3_ACCESS_KEY" "S3 Access Key"
check_required "SEISEI_S3_SECRET_KEY" "S3 Secret Key"
check_warning "SEISEI_S3_REGION" "S3 Region"

# 验证S3 bucket存在
if command -v aws &> /dev/null; then
    S3_BUCKET=$(grep "^SEISEI_S3_BUCKET=" "$ENV_FILE" | cut -d'=' -f2)
    S3_ACCESS=$(grep "^SEISEI_S3_ACCESS_KEY=" "$ENV_FILE" | cut -d'=' -f2)
    S3_SECRET=$(grep "^SEISEI_S3_SECRET_KEY=" "$ENV_FILE" | cut -d'=' -f2)

    echo ""
    echo -n "Testing S3 connection... "
    if AWS_ACCESS_KEY_ID="$S3_ACCESS" AWS_SECRET_ACCESS_KEY="$S3_SECRET" \
       aws s3 ls "s3://$S3_BUCKET" --region ap-northeast-1 >/dev/null 2>&1; then
        echo "✓ OK"
    else
        echo "✗ FAILED"
        echo "  Cannot access S3 bucket: $S3_BUCKET"
        ((ERRORS++))
    fi
fi

# 3. 镜像配置检查
echo ""
echo "3. Docker Image Configuration"
echo "──────────────────────────────"
check_required "IMAGE_REF" "Docker Image Reference"

IMAGE_REF=$(grep "^IMAGE_REF=" "$ENV_FILE" | cut -d'=' -f2)
if [[ "$IMAGE_REF" == *"@sha256:"* ]]; then
    echo "✓ Image uses digest pinning (immutable)"
else
    echo "⚠ Image uses tag instead of digest"
    echo "  Recommendation: Use digest for production"
    ((WARNINGS++))
fi

# 4. OCR服务配置检查
echo ""
echo "4. OCR Service Configuration"
echo "─────────────────────────────"
check_warning "OCR_SERVICE_URL" "OCR Service URL"
check_warning "OCR_SERVICE_KEY" "OCR Service API Key"

# 5. 容器运行状态检查
echo ""
echo "5. Container Health Check"
echo "──────────────────────────"

if command -v docker &> /dev/null; then
    if docker ps --format "{{.Names}}" | grep -q "odoo18-prod-web"; then
        STATUS=$(docker inspect odoo18-prod-web --format='{{.State.Health.Status}}' 2>/dev/null || echo "no-healthcheck")
        if [ "$STATUS" = "healthy" ]; then
            echo "✓ Container: Running and Healthy"
        elif [ "$STATUS" = "no-healthcheck" ]; then
            echo "⚠ Container: Running (no health check configured)"
            ((WARNINGS++))
        else
            echo "✗ Container: Unhealthy ($STATUS)"
            ((ERRORS++))
        fi

        # 验证环境变量是否加载
        echo ""
        echo "Verifying environment variables in container:"
        docker exec odoo18-prod-web env | grep -E "^(DB_|SEISEI_S3)" | sed 's/PASSWORD=.*/PASSWORD=<hidden>/' | sed 's/SECRET_KEY=.*/SECRET_KEY=<hidden>/' | while read line; do
            echo "  ✓ $line"
        done
    else
        echo "⚠ Container: Not running"
        ((WARNINGS++))
    fi
fi

# 6. 网络连接检查
echo ""
echo "6. Network Connectivity"
echo "────────────────────────"

DB_HOST=$(grep "^DB_HOST=" "$ENV_FILE" | cut -d'=' -f2)
DB_PORT=$(grep "^DB_PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "5432")

echo -n "Database reachable... "
if timeout 5 bash -c "cat < /dev/null > /dev/tcp/$DB_HOST/$DB_PORT" 2>/dev/null; then
    echo "✓ OK"
else
    echo "✗ FAILED"
    echo "  Cannot reach $DB_HOST:$DB_PORT"
    ((ERRORS++))
fi

# 总结
echo ""
echo "════════════════════════════════════════════════════════"
echo "  Verification Summary"
echo "════════════════════════════════════════════════════════"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✓ ALL CHECKS PASSED"
    echo ""
    echo "Configuration is valid and ready for production."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "⚠ PASSED WITH $WARNINGS WARNING(S)"
    echo ""
    echo "Configuration is acceptable but has warnings."
    echo "Review warnings above."
    exit 0
else
    echo "✗ FAILED WITH $ERRORS ERROR(S) AND $WARNINGS WARNING(S)"
    echo ""
    echo "❌ CONFIGURATION IS NOT VALID FOR PRODUCTION"
    echo ""
    echo "Please fix all errors before deploying."
    exit 1
fi
