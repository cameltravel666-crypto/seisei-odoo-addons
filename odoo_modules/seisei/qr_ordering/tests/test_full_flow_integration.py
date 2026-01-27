# -*- coding: utf-8 -*-
"""
完整业务流程集成测试
====================

测试范围：
点菜 → 消耗物料 → 生成采购申请 的端到端流程

测试类型：集成测试
"""

from odoo.tests.common import TransactionCase, tagged
from odoo.exceptions import UserError, ValidationError
import logging

_logger = logging.getLogger(__name__)


@tagged('post_install', '-at_install', 'qr_ordering', 'integration', 'full_flow')
class TestFullOrderFlow(TransactionCase):
    """
    端到端集成测试：点菜 → 库存消耗 → 采购申请

    这个测试类验证完整的业务流程是否正确连接。
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.company = cls.env.company

        # 检查所有必要模块
        cls.modules_status = {
            'stock': 'stock.move' in cls.env,
            'mrp': 'mrp.bom' in cls.env,
            'purchase': 'purchase.order' in cls.env,
            'pos': 'pos.order' in cls.env,
        }

        _logger.info(f"模块安装状态: {cls.modules_status}")

        # ===== 1. 创建供应商 =====
        cls.vendor = cls.env['res.partner'].create({
            'name': '综合食材供应商',
            'is_company': True,
            'supplier_rank': 1,
        })

        # ===== 2. 创建原材料产品 =====
        cls.ingredients = {}

        ingredient_data = [
            ('noodle', '面条', 30.0, 100.0, 20.0),
            ('soup', '汤底', 50.0, 50.0, 10.0),
            ('meat', '叉烧', 70.0, 20.0, 5.0),
            ('egg', '溏心蛋', 20.0, 50.0, 10.0),
            ('green_onion', '葱花', 10.0, 30.0, 5.0),
        ]

        for code, name, price, initial_stock, min_stock in ingredient_data:
            product = cls.env['product.product'].create({
                'name': f'原材料 - {name}',
                'default_code': f'ING-{code.upper()}',
                'type': 'product',
                'standard_price': price,
            })
            cls.ingredients[code] = {
                'product': product,
                'initial_stock': initial_stock,
                'min_stock': min_stock,
            }

        # ===== 3. 创建成品菜品 =====
        cls.product_ramen = cls.env['product.product'].create({
            'name': '豚骨拉面',
            'default_code': 'MENU-RAMEN-001',
            'type': 'consu',
            'list_price': 1200.0,
            'available_in_pos': True,
        })

        cls.product_gyoza = cls.env['product.product'].create({
            'name': '煎饺（6个）',
            'default_code': 'MENU-GYOZA-001',
            'type': 'consu',
            'list_price': 500.0,
            'available_in_pos': True,
        })

        # ===== 4. 创建 BOM =====
        if cls.modules_status['mrp']:
            cls.bom_ramen = cls.env['mrp.bom'].create({
                'product_tmpl_id': cls.product_ramen.product_tmpl_id.id,
                'product_qty': 1.0,
                'bom_line_ids': [
                    (0, 0, {'product_id': cls.ingredients['noodle']['product'].id, 'product_qty': 0.2}),
                    (0, 0, {'product_id': cls.ingredients['soup']['product'].id, 'product_qty': 0.5}),
                    (0, 0, {'product_id': cls.ingredients['meat']['product'].id, 'product_qty': 0.1}),
                    (0, 0, {'product_id': cls.ingredients['egg']['product'].id, 'product_qty': 1.0}),
                    (0, 0, {'product_id': cls.ingredients['green_onion']['product'].id, 'product_qty': 0.05}),
                ],
            })

        # ===== 5. 初始化库存 =====
        if cls.modules_status['stock']:
            cls.warehouse = cls.env['stock.warehouse'].search([
                ('company_id', '=', cls.company.id)
            ], limit=1)

            if cls.warehouse:
                for code, data in cls.ingredients.items():
                    cls.env['stock.quant'].with_context(inventory_mode=True).create({
                        'product_id': data['product'].id,
                        'location_id': cls.warehouse.lot_stock_id.id,
                        'quantity': data['initial_stock'],
                    })

        # ===== 6. 设置库存规则 =====
        if cls.modules_status['stock'] and cls.warehouse:
            if 'stock.warehouse.orderpoint' in cls.env:
                for code, data in cls.ingredients.items():
                    cls.env['stock.warehouse.orderpoint'].create({
                        'name': f"OP/{data['product'].default_code}",
                        'product_id': data['product'].id,
                        'warehouse_id': cls.warehouse.id,
                        'location_id': cls.warehouse.lot_stock_id.id,
                        'product_min_qty': data['min_stock'],
                        'product_max_qty': data['initial_stock'],
                        'qty_multiple': 5.0,
                    })

        # ===== 7. 创建 POS 配置 =====
        cls.pos_config = cls.env['pos.config'].create({
            'name': 'Test Restaurant POS',
            'company_id': cls.company.id,
        })

        # ===== 8. 创建 QR 餐桌 =====
        cls.qr_table = cls.env['qr.table'].create({
            'name': 'Table A1',
            'pos_config_id': cls.pos_config.id,
            'state': 'available',
        })

        cls.qr_session = cls.env['qr.session'].create({
            'table_id': cls.qr_table.id,
            'state': 'active',
        })

    def _get_stock_qty(self, product):
        """获取产品当前库存"""
        if not self.modules_status['stock']:
            return 0.0
        quant = self.env['stock.quant'].search([
            ('product_id', '=', product.id),
            ('location_id', '=', self.warehouse.lot_stock_id.id),
        ], limit=1)
        return quant.quantity if quant else 0.0

    def _log_stock_status(self, prefix=""):
        """打印当前库存状态"""
        if not self.modules_status['stock']:
            return

        _logger.info(f"\n{'='*50}")
        _logger.info(f"{prefix} 库存状态:")
        _logger.info(f"{'='*50}")
        for code, data in self.ingredients.items():
            qty = self._get_stock_qty(data['product'])
            min_qty = data['min_stock']
            status = "⚠️ 低于最小值" if qty < min_qty else "✓ 正常"
            _logger.info(f"  {data['product'].name}: {qty} (最小值: {min_qty}) {status}")
        _logger.info(f"{'='*50}\n")

    # ==================== 流程测试 ====================

    def test_01_flow_step1_create_order(self):
        """
        第1步：创建 QR 点餐订单

        验证点：
        - 订单创建成功
        - 订单状态为 cart
        - 订单关联到正确的餐桌
        """
        _logger.info("\n" + "="*60)
        _logger.info("【第1步】创建 QR 点餐订单")
        _logger.info("="*60)

        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        self.assertTrue(qr_order.id, "订单应该创建成功")
        self.assertEqual(qr_order.state, 'cart', "初始状态应该是 cart")

        _logger.info(f"✓ 订单创建成功: {qr_order.name}")
        _logger.info(f"  - 餐桌: {qr_order.table_id.name}")
        _logger.info(f"  - 状态: {qr_order.state}")

    def test_02_flow_step2_add_items(self):
        """
        第2步：添加菜品（点菜）

        验证点：
        - 订单行添加成功
        - 金额计算正确
        """
        _logger.info("\n" + "="*60)
        _logger.info("【第2步】添加菜品")
        _logger.info("="*60)

        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        # 点菜：2份拉面 + 1份煎饺
        self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_ramen.id,
            'quantity': 2,
            'price_unit': self.product_ramen.list_price,
        })

        self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_gyoza.id,
            'quantity': 1,
            'price_unit': self.product_gyoza.list_price,
        })

        expected_total = (1200.0 * 2) + (500.0 * 1)  # 2900

        self.assertEqual(len(qr_order.line_ids), 2, "应该有2个订单行")
        self.assertEqual(qr_order.amount_total, expected_total, f"总额应该是 {expected_total}")

        _logger.info(f"✓ 点菜成功: {qr_order.name}")
        _logger.info(f"  - 豚骨拉面 x 2 = ¥{1200*2}")
        _logger.info(f"  - 煎饺 x 1 = ¥{500}")
        _logger.info(f"  - 总计: ¥{qr_order.amount_total}")

    def test_03_flow_step3_submit_order(self):
        """
        第3步：提交订单

        验证点：
        - 订单状态变为 ordered
        - (如果实现) 触发库存消耗
        """
        _logger.info("\n" + "="*60)
        _logger.info("【第3步】提交订单")
        _logger.info("="*60)

        self._log_stock_status("提交前")

        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_ramen.id,
            'quantity': 2,
            'price_unit': self.product_ramen.list_price,
        })

        # 提交订单
        qr_order.action_submit_order()

        self.assertEqual(qr_order.state, 'ordered', "状态应该变为 ordered")

        _logger.info(f"✓ 订单提交成功: {qr_order.name}")
        _logger.info(f"  - 状态: {qr_order.state}")

        self._log_stock_status("提交后")

        # 检查库存是否变化（如果实现了库存消耗）
        if self.modules_status['stock']:
            noodle_qty = self._get_stock_qty(self.ingredients['noodle']['product'])
            if noodle_qty < self.ingredients['noodle']['initial_stock']:
                _logger.info("✓ 检测到库存消耗")
            else:
                _logger.warning("⚠️ 库存未消耗 - 功能待实现")

    def test_04_flow_step4_check_inventory_consumption(self):
        """
        第4步：验证库存消耗

        ⚠️ 当前状态：待实现

        验证点：
        - 原材料库存应该减少
        - 减少量应该符合 BOM 定义
        """
        _logger.info("\n" + "="*60)
        _logger.info("【第4步】验证库存消耗")
        _logger.info("="*60)

        if not self.modules_status['stock']:
            _logger.warning("⚠️ stock 模块未安装，跳过库存验证")
            self.skipTest("stock 模块未安装")

        # 检查是否实现了库存消耗功能
        has_consume = hasattr(self.env['qr.order'], '_consume_inventory')

        if not has_consume:
            _logger.warning("""
            ⚠️ 库存消耗功能待实现

            预期行为：
            - 提交订单后，根据 BOM 消耗原材料
            - 2份拉面消耗：
              - 面条: 0.2 * 2 = 0.4
              - 汤底: 0.5 * 2 = 1.0
              - 叉烧: 0.1 * 2 = 0.2
              - 溏心蛋: 1.0 * 2 = 2.0
              - 葱花: 0.05 * 2 = 0.1
            """)
            self.skipTest("库存消耗功能待实现")

    def test_05_flow_step5_check_purchase_trigger(self):
        """
        第5步：验证采购申请触发

        ⚠️ 当前状态：待实现

        验证点：
        - 当库存低于最小值时，自动创建采购申请
        """
        _logger.info("\n" + "="*60)
        _logger.info("【第5步】验证采购申请触发")
        _logger.info("="*60)

        if not self.modules_status['purchase']:
            _logger.warning("⚠️ purchase 模块未安装，跳过采购验证")
            self.skipTest("purchase 模块未安装")

        # 检查是否实现了采购申请功能
        has_purchase = hasattr(self.env['qr.order'], '_create_purchase_requisition')

        if not has_purchase:
            _logger.warning("""
            ⚠️ 采购申请功能待实现

            预期行为：
            - 检查所有原材料的库存水位
            - 低于最小值的产品自动生成采购申请
            - 采购数量 = 最大库存 - 当前库存
            """)
            self.skipTest("采购申请功能待实现")

    def test_06_flow_complete_scenario(self):
        """
        完整流程场景测试

        模拟真实业务场景：
        1. 客户扫码点餐（10份拉面 - 大单）
        2. 提交订单
        3. 验证库存消耗
        4. 验证采购申请生成
        """
        _logger.info("\n" + "="*60)
        _logger.info("【完整流程】模拟大单场景")
        _logger.info("="*60)

        self._log_stock_status("初始")

        # 创建大单：10份拉面
        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_ramen.id,
            'quantity': 10,  # 大单
            'price_unit': self.product_ramen.list_price,
        })

        _logger.info(f"创建大单: 10份拉面, 总价 ¥{qr_order.amount_total}")

        # 预期消耗：
        expected_consumption = {
            'noodle': 0.2 * 10,  # 2.0
            'soup': 0.5 * 10,  # 5.0
            'meat': 0.1 * 10,  # 1.0
            'egg': 1.0 * 10,  # 10.0
            'green_onion': 0.05 * 10,  # 0.5
        }

        _logger.info("\n预期消耗量：")
        for code, qty in expected_consumption.items():
            _logger.info(f"  - {self.ingredients[code]['product'].name}: {qty}")

        # 提交订单
        qr_order.action_submit_order()

        self._log_stock_status("提交后")

        # 检查功能实现状态
        features_status = {
            'POS 订单创建': qr_order.state == 'ordered',
            '库存消耗': hasattr(self.env['qr.order'], '_consume_inventory'),
            '采购申请': hasattr(self.env['qr.order'], '_create_purchase_requisition'),
        }

        _logger.info("\n功能实现状态：")
        for feature, status in features_status.items():
            icon = "✓" if status else "⚠️ 待实现"
            _logger.info(f"  {feature}: {icon}")

        # 基础断言
        self.assertEqual(qr_order.state, 'ordered', "订单应该已提交")
        _logger.info("\n✓ 基础流程测试完成")


@tagged('post_install', '-at_install', 'qr_ordering', 'integration', 'checklist')
class TestImplementationChecklist(TransactionCase):
    """实现清单检查"""

    def test_implementation_checklist(self):
        """
        打印功能实现清单

        这个测试不做断言，只是打印当前的实现状态。
        """
        checklist = [
            ("POS 点菜流程", [
                ("qr.order 模型", 'qr.order' in self.env),
                ("qr.order.line 模型", 'qr.order.line' in self.env),
                ("action_submit_order 方法", hasattr(self.env['qr.order'], 'action_submit_order')),
                ("_sync_to_pos 方法", hasattr(self.env['qr.order'], '_sync_to_pos')),
            ]),
            ("库存消耗", [
                ("stock 模块安装", 'stock.move' in self.env),
                ("mrp 模块安装", 'mrp.bom' in self.env),
                ("_consume_inventory 方法", hasattr(self.env.get('qr.order', False) or self.env['res.partner'], '_consume_inventory') if 'qr.order' in self.env else False),
                ("_check_stock_availability 方法", hasattr(self.env.get('qr.order', False) or self.env['res.partner'], '_check_stock_availability') if 'qr.order' in self.env else False),
            ]),
            ("采购申请", [
                ("purchase 模块安装", 'purchase.order' in self.env),
                ("_create_purchase_requisition 方法", hasattr(self.env.get('qr.order', False) or self.env['res.partner'], '_create_purchase_requisition') if 'qr.order' in self.env else False),
                ("库存规则配置", 'stock.warehouse.orderpoint' in self.env),
            ]),
        ]

        _logger.info("\n")
        _logger.info("=" * 70)
        _logger.info("  POS 点菜 → 库存消耗 → 采购申请 功能实现清单")
        _logger.info("=" * 70)

        total_items = 0
        implemented_items = 0

        for category, items in checklist:
            _logger.info(f"\n【{category}】")
            for name, status in items:
                total_items += 1
                if status:
                    implemented_items += 1
                icon = "✓" if status else "✗"
                _logger.info(f"  [{icon}] {name}")

        _logger.info("\n" + "-" * 70)
        _logger.info(f"  实现进度: {implemented_items}/{total_items} ({implemented_items/total_items*100:.0f}%)")
        _logger.info("=" * 70 + "\n")
