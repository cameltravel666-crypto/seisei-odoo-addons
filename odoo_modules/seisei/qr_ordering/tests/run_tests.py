#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
POS 点菜 → 库存消耗 → 采购申请 自动化测试运行器

用法：
    python run_tests.py              # 运行所有测试
    python run_tests.py pos_flow     # 只运行 POS 流程测试
    python run_tests.py inventory    # 只运行库存测试
    python run_tests.py purchase     # 只运行采购测试
    python run_tests.py integration  # 只运行集成测试
    python run_tests.py checklist    # 只运行实现清单检查

环境变量：
    ODOO_BIN      - odoo-bin 路径
    ODOO_CONF     - odoo.conf 路径
    DATABASE      - 测试数据库名 (默认: seisei_test)
"""

import os
import sys
import subprocess
from pathlib import Path


# 颜色定义
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color


def print_header():
    print(f"{Colors.BLUE}")
    print("=" * 60)
    print("  POS 点菜 → 库存消耗 → 采购申请")
    print("  自动化测试运行器")
    print("=" * 60)
    print(f"{Colors.NC}")


def print_section(title):
    print(f"\n{Colors.CYAN}{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}{Colors.NC}\n")


def get_test_config(tag):
    """获取测试配置"""
    configs = {
        'pos_flow': {
            'tags': 'pos_flow',
            'description': 'POS 点菜流程测试',
            'tests': [
                'test_pos_order_flow.TestQrOrderFlow',
                'test_pos_order_flow.TestPosOrderExtension',
            ]
        },
        'inventory': {
            'tags': 'inventory',
            'description': '库存消耗测试',
            'tests': [
                'test_inventory_consumption.TestInventoryConsumption',
                'test_inventory_consumption.TestBomExpansion',
            ]
        },
        'purchase': {
            'tags': 'purchase',
            'description': '采购申请测试',
            'tests': [
                'test_purchase_requisition.TestPurchaseRequisition',
                'test_purchase_requisition.TestPurchaseScheduler',
            ]
        },
        'integration': {
            'tags': 'integration',
            'description': '集成测试',
            'tests': [
                'test_full_flow_integration.TestFullOrderFlow',
            ]
        },
        'full_flow': {
            'tags': 'full_flow',
            'description': '完整流程测试',
            'tests': [
                'test_full_flow_integration.TestFullOrderFlow',
            ]
        },
        'checklist': {
            'tags': 'checklist',
            'description': '实现清单检查',
            'tests': [
                'test_full_flow_integration.TestImplementationChecklist',
            ]
        },
        'all': {
            'tags': 'qr_ordering',
            'description': '所有 QR 点餐测试',
            'tests': ['所有测试']
        },
    }
    return configs.get(tag, configs['all'])


def find_odoo_bin():
    """查找 odoo-bin"""
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent

    possible_paths = [
        os.environ.get('ODOO_BIN'),
        project_root / 'odoo-bin',
        project_root / 'odoo' / 'odoo-bin',
        Path('/opt/odoo/odoo-bin'),
        Path.home() / 'odoo' / 'odoo-bin',
    ]

    for path in possible_paths:
        if path and Path(path).exists():
            return str(path)

    return None


def find_odoo_conf():
    """查找 odoo.conf"""
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent.parent

    possible_paths = [
        os.environ.get('ODOO_CONF'),
        project_root / 'odoo.conf',
        project_root / 'config' / 'odoo.conf',
        Path('/etc/odoo/odoo.conf'),
        Path.home() / '.odoorc',
    ]

    for path in possible_paths:
        if path and Path(path).exists():
            return str(path)

    return None


def run_odoo_tests(odoo_bin, odoo_conf, database, tags):
    """运行 Odoo 测试"""
    cmd = [
        sys.executable, odoo_bin,
        '-d', database,
        '--test-tags', tags,
        '--stop-after-init',
        '--log-level=info',
        '-i', 'qr_ordering',
    ]

    if odoo_conf:
        cmd.extend(['-c', odoo_conf])

    print(f"{Colors.YELLOW}执行命令：{Colors.NC}")
    print(f"  {' '.join(cmd)}\n")

    result = subprocess.run(cmd, capture_output=False)
    return result.returncode == 0


def print_test_plan():
    """打印测试计划"""
    print_section("测试计划")

    plan = """
    ┌─────────────────────────────────────────────────────────┐
    │  测试类型          │  测试内容                          │
    ├─────────────────────────────────────────────────────────┤
    │  1. pos_flow      │  QR 点餐订单创建、提交、状态流转    │
    │  2. inventory     │  库存消耗、BOM 展开（待实现）       │
    │  3. purchase      │  采购申请自动生成（待实现）         │
    │  4. integration   │  端到端完整流程测试                 │
    │  5. checklist     │  功能实现状态检查                   │
    └─────────────────────────────────────────────────────────┘
    """
    print(plan)


def print_implementation_status():
    """打印实现状态"""
    print_section("当前实现状态")

    status = """
    ┌──────────────────────────────────────────────────────────┐
    │  功能                        │  状态                     │
    ├──────────────────────────────────────────────────────────┤
    │  QR 扫码点餐                 │  ✓ 已实现                 │
    │  订单同步到 POS              │  ✓ 已实现                 │
    │  厨房打印                    │  ✓ 已实现                 │
    │  ─────────────────────────────────────────────────────── │
    │  订单触发库存消耗            │  ✗ 待实现                 │
    │  BOM 物料清单展开            │  ✗ 待实现                 │
    │  库存不足提示                │  ✗ 待实现                 │
    │  ─────────────────────────────────────────────────────── │
    │  自动生成采购申请            │  ✗ 待实现                 │
    │  采购数量计算                │  ✗ 待实现                 │
    │  定时采购检查任务            │  ✗ 待实现                 │
    └──────────────────────────────────────────────────────────┘
    """
    print(status)


def main():
    print_header()

    # 获取测试标签
    tag = sys.argv[1] if len(sys.argv) > 1 else 'all'

    if tag == '--help' or tag == '-h':
        print(__doc__)
        print_test_plan()
        return 0

    if tag == '--status':
        print_implementation_status()
        return 0

    # 获取配置
    config = get_test_config(tag)
    database = os.environ.get('DATABASE', 'seisei_test')

    # 查找 Odoo
    odoo_bin = find_odoo_bin()
    odoo_conf = find_odoo_conf()

    print(f"{Colors.YELLOW}配置信息：{Colors.NC}")
    print(f"  ODOO_BIN:   {odoo_bin or '未找到'}")
    print(f"  ODOO_CONF:  {odoo_conf or '未找到'}")
    print(f"  DATABASE:   {database}")
    print(f"  TEST_TAG:   {config['tags']}")
    print(f"  描述:       {config['description']}")
    print()

    if not odoo_bin:
        print(f"{Colors.RED}错误: 未找到 odoo-bin{Colors.NC}")
        print("请设置 ODOO_BIN 环境变量")
        return 1

    print_section(f"运行测试: {config['description']}")

    print(f"{Colors.CYAN}包含的测试：{Colors.NC}")
    for test in config['tests']:
        print(f"  • {test}")
    print()

    # 运行测试
    success = run_odoo_tests(odoo_bin, odoo_conf, database, config['tags'])

    print()
    if success:
        print(f"{Colors.GREEN}{'=' * 60}")
        print("  测试完成！")
        print(f"{'=' * 60}{Colors.NC}")
        return 0
    else:
        print(f"{Colors.RED}{'=' * 60}")
        print("  测试失败！请检查上面的错误信息")
        print(f"{'=' * 60}{Colors.NC}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
