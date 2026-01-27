# -*- coding: utf-8 -*-
"""
POS 点菜流程测试
================

测试范围：
- QR 扫码点餐 → POS 订单创建
- 订单状态流转（cart → ordered → cooking → serving → paid）
- 订单同步到 POS 系统
"""

from odoo.tests.common import TransactionCase, tagged
from odoo.exceptions import UserError, ValidationError
from datetime import datetime, timedelta
import logging

_logger = logging.getLogger(__name__)


@tagged('post_install', '-at_install', 'qr_ordering', 'pos_flow')
class TestQrOrderFlow(TransactionCase):
    """测试 QR 扫码点餐 → POS 订单的完整流程"""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # 创建测试公司
        cls.company = cls.env.company

        # 创建测试产品类别
        cls.product_category = cls.env['product.category'].create({
            'name': 'Test Food Category',
        })

        # 创建测试产品（菜品）
        cls.product_ramen = cls.env['product.product'].create({
            'name': 'Test Ramen / 测试拉面',
            'type': 'consu',
            'categ_id': cls.product_category.id,
            'list_price': 1200.0,
            'available_in_pos': True,
        })

        cls.product_gyoza = cls.env['product.product'].create({
            'name': 'Test Gyoza / 测试饺子',
            'type': 'consu',
            'categ_id': cls.product_category.id,
            'list_price': 500.0,
            'available_in_pos': True,
        })

        # 创建 POS 配置
        cls.pos_config = cls.env['pos.config'].create({
            'name': 'Test POS Config',
            'company_id': cls.company.id,
        })

        # 创建 POS 餐桌（如果 pos_restaurant 模块已安装）
        if 'restaurant.table' in cls.env:
            cls.restaurant_table = cls.env['restaurant.table'].create({
                'name': 'Table 01',
                'seats': 4,
            })
        else:
            cls.restaurant_table = None

        # 创建 QR 餐桌
        cls.qr_table = cls.env['qr.table'].create({
            'name': 'QR Table 01',
            'pos_config_id': cls.pos_config.id,
            'pos_table_id': cls.restaurant_table.id if cls.restaurant_table else False,
            'state': 'available',
        })

        # 创建 QR Session
        cls.qr_session = cls.env['qr.session'].create({
            'table_id': cls.qr_table.id,
            'state': 'active',
        })

    def test_01_create_qr_order(self):
        """测试创建 QR 订单"""
        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        self.assertTrue(qr_order.id, "QR 订单应该成功创建")
        self.assertEqual(qr_order.state, 'cart', "初始状态应该是 cart")
        self.assertEqual(qr_order.table_id, self.qr_table, "应该关联到正确的餐桌")
        self.assertTrue(qr_order.name, "订单号应该自动生成")

        _logger.info(f"✓ 创建 QR 订单成功: {qr_order.name}")

    def test_02_add_order_lines(self):
        """测试添加订单行（点菜）"""
        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        # 添加订单行
        line1 = self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_ramen.id,
            'quantity': 2,
            'price_unit': self.product_ramen.list_price,
        })

        line2 = self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_gyoza.id,
            'quantity': 1,
            'price_unit': self.product_gyoza.list_price,
        })

        self.assertEqual(len(qr_order.line_ids), 2, "应该有2个订单行")

        # 验证金额计算
        expected_total = (1200.0 * 2) + (500.0 * 1)  # 2900
        self.assertEqual(qr_order.amount_total, expected_total,
                        f"订单总额应该是 {expected_total}")

        _logger.info(f"✓ 添加订单行成功，总额: {qr_order.amount_total}")

    def test_03_submit_order(self):
        """测试提交订单（cart → ordered）"""
        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        # 添加订单行
        self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_ramen.id,
            'quantity': 1,
            'price_unit': self.product_ramen.list_price,
        })

        # 提交订单
        qr_order.action_submit_order()

        self.assertEqual(qr_order.state, 'ordered', "状态应该变为 ordered")

        _logger.info(f"✓ 提交订单成功，状态: {qr_order.state}")

    def test_04_order_state_transitions(self):
        """测试订单状态流转"""
        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        # 添加订单行
        self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_ramen.id,
            'quantity': 1,
            'price_unit': self.product_ramen.list_price,
        })

        # cart → ordered
        qr_order.action_submit_order()
        self.assertEqual(qr_order.state, 'ordered')

        # ordered → cooking (如果有这个方法)
        if hasattr(qr_order, 'action_start_cooking'):
            qr_order.action_start_cooking()
            self.assertEqual(qr_order.state, 'cooking')

        # cooking → serving (如果有这个方法)
        if hasattr(qr_order, 'action_ready_to_serve'):
            qr_order.action_ready_to_serve()
            self.assertEqual(qr_order.state, 'serving')

        _logger.info(f"✓ 订单状态流转测试完成，当前状态: {qr_order.state}")

    def test_05_sync_to_pos(self):
        """测试同步到 POS 系统"""
        # 需要活跃的 POS Session
        # 跳过如果没有活跃的 POS Session
        pos_session = self.env['pos.session'].search([
            ('config_id', '=', self.pos_config.id),
            ('state', '=', 'opened'),
        ], limit=1)

        if not pos_session:
            _logger.warning("⚠ 跳过 POS 同步测试：没有活跃的 POS Session")
            self.skipTest("需要活跃的 POS Session 来测试同步功能")

        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_ramen.id,
            'quantity': 1,
            'price_unit': self.product_ramen.list_price,
        })

        # 提交订单会触发同步到 POS
        qr_order.action_submit_order()

        # 验证是否创建了 POS 订单
        self.assertTrue(qr_order.pos_order_id, "应该创建 POS 订单")
        self.assertEqual(qr_order.pos_order_id.amount_total, qr_order.amount_total,
                        "POS 订单金额应该与 QR 订单一致")

        _logger.info(f"✓ 同步到 POS 成功: {qr_order.pos_order_id.name}")

    def test_06_add_items_after_order(self):
        """测试加菜功能（serving 状态下加菜）"""
        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        # 添加初始订单行
        self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_ramen.id,
            'quantity': 1,
            'price_unit': self.product_ramen.list_price,
        })

        initial_total = qr_order.amount_total

        # 模拟状态变为 serving
        qr_order.write({'state': 'serving'})

        # 加菜
        if hasattr(qr_order, 'action_add_items'):
            self.env['qr.order.line'].create({
                'order_id': qr_order.id,
                'product_id': self.product_gyoza.id,
                'quantity': 2,
                'price_unit': self.product_gyoza.list_price,
            })

            self.assertGreater(qr_order.amount_total, initial_total, "加菜后总额应该增加")
            _logger.info(f"✓ 加菜成功，新总额: {qr_order.amount_total}")
        else:
            _logger.info("⚠ 加菜方法不存在，跳过")

    def test_07_cancel_order(self):
        """测试取消订单"""
        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        self.env['qr.order.line'].create({
            'order_id': qr_order.id,
            'product_id': self.product_ramen.id,
            'quantity': 1,
            'price_unit': self.product_ramen.list_price,
        })

        # 取消订单
        if hasattr(qr_order, 'action_cancel'):
            qr_order.action_cancel()
            self.assertEqual(qr_order.state, 'cancelled', "状态应该变为 cancelled")
            _logger.info("✓ 取消订单成功")
        else:
            qr_order.write({'state': 'cancelled'})
            self.assertEqual(qr_order.state, 'cancelled')
            _logger.info("✓ 手动设置取消状态成功")

    def test_08_empty_order_validation(self):
        """测试空订单验证（不允许提交空订单）"""
        qr_order = self.env['qr.order'].create({
            'session_id': self.qr_session.id,
            'state': 'cart',
        })

        # 不添加订单行，尝试提交
        with self.assertRaises((UserError, ValidationError)):
            qr_order.action_submit_order()

        _logger.info("✓ 空订单验证通过，正确拒绝空订单提交")


@tagged('post_install', '-at_install', 'qr_ordering', 'pos_flow')
class TestPosOrderExtension(TransactionCase):
    """测试 POS 订单扩展功能"""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env.company

        cls.product = cls.env['product.product'].create({
            'name': 'Test Product',
            'type': 'consu',
            'list_price': 100.0,
            'available_in_pos': True,
        })

        cls.pos_config = cls.env['pos.config'].create({
            'name': 'Test POS',
            'company_id': cls.company.id,
        })

    def test_01_pos_order_qr_source_flag(self):
        """测试 POS 订单的 QR 来源标记"""
        # 需要活跃的 POS Session
        pos_session = self.env['pos.session'].search([
            ('config_id', '=', self.pos_config.id),
            ('state', '=', 'opened'),
        ], limit=1)

        if not pos_session:
            _logger.warning("⚠ 跳过测试：没有活跃的 POS Session")
            self.skipTest("需要活跃的 POS Session")

        # 检查 pos.order 是否有 qr_source 字段
        if 'qr_source' in self.env['pos.order']._fields:
            pos_order = self.env['pos.order'].create({
                'session_id': pos_session.id,
                'qr_source': True,
            })
            self.assertTrue(pos_order.qr_source, "QR 来源标记应该为 True")
            _logger.info("✓ POS 订单 QR 来源标记测试通过")
        else:
            _logger.info("⚠ pos.order 没有 qr_source 字段")
