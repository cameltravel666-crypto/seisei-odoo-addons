#!/bin/bash
#
# POS 点菜 → 库存消耗 → 采购申请 自动化测试脚本
#
# 用法：
#   ./run_tests.sh              # 运行所有测试
#   ./run_tests.sh pos_flow     # 只运行 POS 流程测试
#   ./run_tests.sh inventory    # 只运行库存测试
#   ./run_tests.sh purchase     # 只运行采购测试
#   ./run_tests.sh integration  # 只运行集成测试
#   ./run_tests.sh checklist    # 只运行实现清单检查
#
# 环境变量：
#   ODOO_BIN      - odoo-bin 路径 (默认: ../../../odoo-bin)
#   ODOO_CONF     - odoo.conf 路径 (默认: ../../../odoo.conf)
#   DATABASE      - 测试数据库名 (默认: seisei_test)
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

ODOO_BIN="${ODOO_BIN:-$PROJECT_ROOT/odoo-bin}"
ODOO_CONF="${ODOO_CONF:-$PROJECT_ROOT/odoo.conf}"
DATABASE="${DATABASE:-seisei_test}"

# 测试标签
TEST_TAG="${1:-qr_ordering}"

echo -e "${BLUE}"
echo "========================================================"
echo "  POS 完整流程自动化测试"
echo "========================================================"
echo -e "${NC}"

echo -e "${YELLOW}配置信息：${NC}"
echo "  ODOO_BIN:   $ODOO_BIN"
echo "  ODOO_CONF:  $ODOO_CONF"
echo "  DATABASE:   $DATABASE"
echo "  TEST_TAG:   $TEST_TAG"
echo ""

# 检查 odoo-bin 是否存在
if [ ! -f "$ODOO_BIN" ]; then
    echo -e "${RED}错误: odoo-bin 不存在: $ODOO_BIN${NC}"
    echo "请设置 ODOO_BIN 环境变量"
    exit 1
fi

# 检查配置文件是否存在
if [ ! -f "$ODOO_CONF" ]; then
    echo -e "${YELLOW}警告: odoo.conf 不存在: $ODOO_CONF${NC}"
    echo "将使用默认配置"
    CONF_ARG=""
else
    CONF_ARG="-c $ODOO_CONF"
fi

# 构建测试命令
case "$TEST_TAG" in
    "pos_flow")
        TAGS="pos_flow"
        DESC="POS 点菜流程测试"
        ;;
    "inventory")
        TAGS="inventory"
        DESC="库存消耗测试"
        ;;
    "purchase")
        TAGS="purchase"
        DESC="采购申请测试"
        ;;
    "integration")
        TAGS="integration"
        DESC="集成测试"
        ;;
    "full_flow")
        TAGS="full_flow"
        DESC="完整流程测试"
        ;;
    "checklist")
        TAGS="checklist"
        DESC="实现清单检查"
        ;;
    *)
        TAGS="qr_ordering"
        DESC="所有 QR 点餐测试"
        ;;
esac

echo -e "${BLUE}运行测试: ${DESC}${NC}"
echo ""

# 运行测试
python3 "$ODOO_BIN" $CONF_ARG \
    -d "$DATABASE" \
    --test-tags "$TAGS" \
    --stop-after-init \
    --log-level=info \
    -i qr_ordering \
    2>&1 | tee /tmp/odoo_test_output.log

# 检查测试结果
if grep -q "FAIL\|ERROR" /tmp/odoo_test_output.log; then
    echo ""
    echo -e "${RED}========================================================"
    echo "  测试失败！请检查上面的错误信息"
    echo "========================================================${NC}"
    exit 1
else
    echo ""
    echo -e "${GREEN}========================================================"
    echo "  测试完成！"
    echo "========================================================${NC}"
fi
