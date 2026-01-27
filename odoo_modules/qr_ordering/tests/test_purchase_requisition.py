# -*- coding: utf-8 -*-
"""
采购申请测试
============

测试范围：
- 库存低于阈值时自动生成采购申请
- 采购申请与供应商关联
- 采购数量计算

状态：⚠️ 功能待实现
"""

from odoo.tests.common import TransactionCase, tagged
from odoo.exceptions import UserError, ValidationError
import logging

_logger = logging.getLogger(__name__)


@tagged('post_install', '-at_install', 'qr_ordering', 'purchase')
class TestPurchaseRequisition(TransactionCase):
    """测试库存消耗后的采购申请生成"""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.company = cls.env.company

        # 检查相关模块是否安装
        cls.purchase_installed = 'purchase.order' in cls.env
        cls.purchase_requisition_installed = 'purchase.requisition' in cls.env
        cls.stock_installed = 'stock.move' in cls.env

        if not cls.purchase_installed:
            _logger.warning("⚠️ purchase 模块未安装，采购测试将被跳过")
            return

        # 创建供应商
        cls.vendor = cls.env['res.partner'].create({
            'name': '食材供应商 A',
            'is_company': True,
            'supplier_rank': 1,
        })

        # 创建原材料产品（带供应商信息和最小库存规则）
        cls.ingredient_noodle = cls.env['product.product'].create({
            'name': '拉面原材料 - 面条',
            'type': 'product',
            'list_price': 50.0,
            'standard_price': 30.0,
        })

        # 设置供应商信息
        if 'product.supplierinfo' in cls.env:
            cls.env['product.supplierinfo'].create({
                'product_tmpl_id': cls.ingredient_noodle.product_tmpl_id.id,
                'partner_id': cls.vendor.id,
                'min_qty': 10.0,
                'price': 25.0,  # 供应商价格
            })

        # 设置库存规则（最小库存）
        cls.warehouse = cls.env['stock.warehouse'].search([
            ('company_id', '=', cls.company.id)
        ], limit=1)

        if cls.warehouse and 'stock.warehouse.orderpoint' in cls.env:
            cls.orderpoint = cls.env['stock.warehouse.orderpoint'].create({
                'name': f'OP/{cls.ingredient_noodle.default_code or "NOODLE"}',
                'product_id': cls.ingredient_noodle.id,
                'warehouse_id': cls.warehouse.id,
                'location_id': cls.warehouse.lot_stock_id.id,
                'product_min_qty': 20.0,  # 最小库存 20
                'product_max_qty': 100.0,  # 最大库存 100
                'qty_multiple': 10.0,  # 采购倍数
            })

    def test_01_purchase_module_check(self):
        """检查 purchase 模块是否安装"""
        if not self.purchase_installed:
            self.skipTest("purchase 模块未安装")

        self.assertTrue(self.purchase_installed, "purchase 模块应该已安装")
        _logger.info("✓ purchase 模块检查通过")

    def test_02_vendor_setup(self):
        """验证供应商设置"""
        if not self.purchase_installed:
            self.skipTest("purchase 模块未安装")

        self.assertTrue(self.vendor, "供应商应该已创建")
        self.assertEqual(self.vendor.supplier_rank, 1, "供应商等级应该为 1")

        _logger.info(f"✓ 供应商设置验证通过: {self.vendor.name}")

    def test_03_orderpoint_setup(self):
        """验证库存规则（补货点）设置"""
        if not self.stock_installed:
            self.skipTest("stock 模块未安装")

        if not hasattr(self, 'orderpoint') or not self.orderpoint:
            self.skipTest("stock.warehouse.orderpoint 未创建")

        self.assertEqual(self.orderpoint.product_min_qty, 20.0, "最小库存应该是 20")
        self.assertEqual(self.orderpoint.product_max_qty, 100.0, "最大库存应该是 100")

        _logger.info(f"✓ 库存规则验证通过 - 最小:{self.orderpoint.product_min_qty}, 最大:{self.orderpoint.product_max_qty}")

    def test_04_auto_purchase_requisition_creation(self):
        """
        测试库存低于阈值时自动生成采购申请

        ⚠️ 当前状态：待实现

        预期行为：
        1. 库存消耗后低于 product_min_qty (20)
        2. 系统自动创建采购申请
        3. 申请数量 = max_qty - current_qty
        """
        if not self.purchase_installed:
            self.skipTest("purchase 模块未安装")

        # 检查 qr.order 是否有 _create_purchase_requisition 方法
        has_purchase_method = hasattr(self.env['qr.order'], '_create_purchase_requisition')

        if not has_purchase_method:
            _logger.warning("⚠️ qr.order 缺少 _create_purchase_requisition 方法，功能待实现")
            _logger.info("""
            待实现功能说明：
            ----------------
            需要在 qr_order.py 中添加采购申请生成方法：

            def _create_purchase_requisition(self):
                '''库存低于阈值时生成采购申请'''
                # 1. 获取消耗的原材料列表
                consumed_products = self._get_consumed_products()

                for product in consumed_products:
                    # 2. 检查库存是否低于最小值
                    orderpoint = self.env['stock.warehouse.orderpoint'].search([
                        ('product_id', '=', product.id),
                    ], limit=1)

                    if not orderpoint:
                        continue

                    current_qty = product.qty_available
                    if current_qty < orderpoint.product_min_qty:
                        # 3. 计算需要采购的数量
                        purchase_qty = orderpoint.product_max_qty - current_qty
                        purchase_qty = math.ceil(purchase_qty / orderpoint.qty_multiple) * orderpoint.qty_multiple

                        # 4. 创建采购申请
                        self._create_purchase_order_or_requisition(product, purchase_qty)
            """)
            self.skipTest("_create_purchase_requisition 方法待实现")

    def test_05_purchase_order_creation(self):
        """
        测试直接创建采购订单

        ⚠️ 当前状态：待实现

        预期行为：
        1. 如果产品有默认供应商，直接创建采购订单
        2. 采购订单状态为 draft
        3. 供应商从 product.supplierinfo 获取
        """
        if not self.purchase_installed:
            self.skipTest("purchase 模块未安装")

        _logger.warning("⚠️ 采购订单创建测试待实现")
        self.skipTest("采购订单创建逻辑待实现")

    def test_06_purchase_quantity_calculation(self):
        """
        测试采购数量计算

        ⚠️ 当前状态：待实现

        预期行为：
        1. 采购数量 = max_qty - current_qty
        2. 采购数量向上取整到 qty_multiple
        3. 采购数量不小于供应商的 min_qty
        """
        if not self.purchase_installed:
            self.skipTest("purchase 模块未安装")

        _logger.warning("⚠️ 采购数量计算测试待实现")
        self.skipTest("采购数量计算逻辑待实现")

    def test_07_purchase_requisition_with_vendor(self):
        """
        测试采购申请关联供应商

        ⚠️ 当前状态：待实现

        预期行为：
        1. 采购申请应该关联默认供应商
        2. 采购价格从 product.supplierinfo 获取
        """
        if not self.purchase_requisition_installed:
            self.skipTest("purchase_requisition 模块未安装")

        _logger.warning("⚠️ 采购申请供应商关联测试待实现")
        self.skipTest("采购申请供应商关联逻辑待实现")

    def test_08_no_duplicate_requisition(self):
        """
        测试避免重复创建采购申请

        ⚠️ 当前状态：待实现

        预期行为：
        1. 如果已有待处理的采购申请，不重复创建
        2. 检查现有 draft/sent 状态的采购订单
        """
        if not self.purchase_installed:
            self.skipTest("purchase 模块未安装")

        _logger.warning("⚠️ 采购申请去重测试待实现")
        self.skipTest("采购申请去重逻辑待实现")


@tagged('post_install', '-at_install', 'qr_ordering', 'purchase', 'scheduler')
class TestPurchaseScheduler(TransactionCase):
    """测试定时采购任务"""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.purchase_installed = 'purchase.order' in cls.env

    def test_01_scheduled_purchase_check(self):
        """
        测试定时任务检查库存并生成采购

        ⚠️ 当前状态：待实现

        预期行为：
        1. 定时任务每天运行一次
        2. 检查所有低于最小库存的产品
        3. 批量生成采购申请
        """
        if not self.purchase_installed:
            self.skipTest("purchase 模块未安装")

        # 检查是否有定时任务
        cron = self.env.ref('qr_ordering.ir_cron_check_stock_purchase', raise_if_not_found=False)

        if not cron:
            _logger.warning("⚠️ 定时采购任务未配置")
            _logger.info("""
            待实现功能说明：
            ----------------
            需要在 data/qr_ordering_data.xml 中添加定时任务：

            <record id="ir_cron_check_stock_purchase" model="ir.cron">
                <field name="name">检查库存并生成采购申请</field>
                <field name="model_id" ref="model_qr_order"/>
                <field name="state">code</field>
                <field name="code">model._cron_check_stock_and_purchase()</field>
                <field name="interval_number">1</field>
                <field name="interval_type">days</field>
                <field name="numbercall">-1</field>
                <field name="active">True</field>
            </record>
            """)
            self.skipTest("定时采购任务待配置")

        _logger.info("✓ 定时采购任务检查通过")
