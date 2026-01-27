# -*- coding: utf-8 -*-
"""
库存消耗测试
============

测试范围：
- 订单确认后触发库存扣减
- BOM 物料清单消耗计算
- 库存不足时的处理

状态：⚠️ 功能待实现
"""

from odoo.tests.common import TransactionCase, tagged
from odoo.exceptions import UserError, ValidationError
import logging

_logger = logging.getLogger(__name__)


@tagged('post_install', '-at_install', 'qr_ordering', 'inventory')
class TestInventoryConsumption(TransactionCase):
    """测试 POS 订单的库存消耗功能"""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.company = cls.env.company

        # 检查 stock 模块是否安装
        cls.stock_installed = 'stock.move' in cls.env
        cls.mrp_installed = 'mrp.bom' in cls.env

        if not cls.stock_installed:
            _logger.warning("⚠️ stock 模块未安装，库存消耗测试将被跳过")
            return

        # 创建仓库和库位
        cls.warehouse = cls.env['stock.warehouse'].search([
            ('company_id', '=', cls.company.id)
        ], limit=1)

        if cls.warehouse:
            cls.stock_location = cls.warehouse.lot_stock_id
        else:
            cls.stock_location = cls.env['stock.location'].search([
                ('usage', '=', 'internal'),
                ('company_id', '=', cls.company.id),
            ], limit=1)

        # 创建原材料产品
        cls.ingredient_noodle = cls.env['product.product'].create({
            'name': '拉面原材料 - 面条',
            'type': 'product',  # 可库存产品
            'list_price': 50.0,
            'standard_price': 30.0,
        })

        cls.ingredient_soup = cls.env['product.product'].create({
            'name': '拉面原材料 - 汤底',
            'type': 'product',
            'list_price': 80.0,
            'standard_price': 50.0,
        })

        cls.ingredient_meat = cls.env['product.product'].create({
            'name': '拉面原材料 - 叉烧',
            'type': 'product',
            'list_price': 100.0,
            'standard_price': 70.0,
        })

        # 创建成品产品（菜品）
        cls.product_ramen = cls.env['product.product'].create({
            'name': '豚骨拉面',
            'type': 'consu',  # 消耗品（菜品）
            'list_price': 1200.0,
            'available_in_pos': True,
        })

        # 创建 BOM（如果 mrp 模块已安装）
        if cls.mrp_installed:
            cls.bom_ramen = cls.env['mrp.bom'].create({
                'product_tmpl_id': cls.product_ramen.product_tmpl_id.id,
                'product_qty': 1.0,
                'type': 'normal',
                'bom_line_ids': [
                    (0, 0, {
                        'product_id': cls.ingredient_noodle.id,
                        'product_qty': 0.2,  # 200g 面条
                    }),
                    (0, 0, {
                        'product_id': cls.ingredient_soup.id,
                        'product_qty': 0.5,  # 500ml 汤底
                    }),
                    (0, 0, {
                        'product_id': cls.ingredient_meat.id,
                        'product_qty': 0.1,  # 100g 叉烧
                    }),
                ],
            })

        # 初始化库存
        if cls.stock_location:
            cls._set_stock_quantity(cls.ingredient_noodle, 100.0)
            cls._set_stock_quantity(cls.ingredient_soup, 50.0)
            cls._set_stock_quantity(cls.ingredient_meat, 20.0)

    @classmethod
    def _set_stock_quantity(cls, product, qty):
        """设置产品库存数量"""
        if 'stock.quant' in cls.env:
            cls.env['stock.quant'].with_context(inventory_mode=True).create({
                'product_id': product.id,
                'location_id': cls.stock_location.id,
                'quantity': qty,
            })

    def _get_stock_quantity(self, product):
        """获取产品当前库存"""
        if not self.stock_installed or not self.stock_location:
            return 0.0
        quant = self.env['stock.quant'].search([
            ('product_id', '=', product.id),
            ('location_id', '=', self.stock_location.id),
        ], limit=1)
        return quant.quantity if quant else 0.0

    def test_01_stock_module_check(self):
        """检查 stock 模块是否安装"""
        if not self.stock_installed:
            self.skipTest("stock 模块未安装")

        self.assertTrue(self.stock_installed, "stock 模块应该已安装")
        _logger.info("✓ stock 模块检查通过")

    def test_02_initial_stock_setup(self):
        """验证初始库存设置"""
        if not self.stock_installed:
            self.skipTest("stock 模块未安装")

        noodle_qty = self._get_stock_quantity(self.ingredient_noodle)
        soup_qty = self._get_stock_quantity(self.ingredient_soup)
        meat_qty = self._get_stock_quantity(self.ingredient_meat)

        self.assertEqual(noodle_qty, 100.0, "面条初始库存应该是 100")
        self.assertEqual(soup_qty, 50.0, "汤底初始库存应该是 50")
        self.assertEqual(meat_qty, 20.0, "叉烧初始库存应该是 20")

        _logger.info(f"✓ 初始库存验证通过 - 面条:{noodle_qty}, 汤底:{soup_qty}, 叉烧:{meat_qty}")

    def test_03_bom_existence(self):
        """验证 BOM 物料清单是否存在"""
        if not self.mrp_installed:
            self.skipTest("mrp 模块未安装")

        self.assertTrue(self.bom_ramen, "拉面 BOM 应该存在")
        self.assertEqual(len(self.bom_ramen.bom_line_ids), 3, "BOM 应该有 3 个原材料")

        _logger.info(f"✓ BOM 验证通过 - 原材料数量: {len(self.bom_ramen.bom_line_ids)}")

    def test_04_order_consume_inventory(self):
        """
        测试订单确认后消耗库存

        ⚠️ 当前状态：待实现

        预期行为：
        1. 创建 QR 订单，添加 1 份拉面
        2. 提交订单后，应该触发库存消耗
        3. 面条库存减少 0.2，汤底减少 0.5，叉烧减少 0.1
        """
        if not self.stock_installed:
            self.skipTest("stock 模块未安装")

        # 记录初始库存
        initial_noodle = self._get_stock_quantity(self.ingredient_noodle)
        initial_soup = self._get_stock_quantity(self.ingredient_soup)
        initial_meat = self._get_stock_quantity(self.ingredient_meat)

        # 检查 qr.order 是否有 _consume_inventory 方法
        has_consume_method = hasattr(self.env['qr.order'], '_consume_inventory')

        if not has_consume_method:
            _logger.warning("⚠️ qr.order 缺少 _consume_inventory 方法，功能待实现")
            _logger.info("""
            待实现功能说明：
            ----------------
            需要在 qr_order.py 中添加 _consume_inventory() 方法：

            def _consume_inventory(self):
                '''订单确认后消耗库存'''
                for line in self.line_ids:
                    product = line.product_id
                    # 1. 查找 BOM
                    bom = self.env['mrp.bom']._bom_find(product)
                    if bom:
                        # 2. 展开 BOM，获取原材料
                        for bom_line in bom.bom_line_ids:
                            consume_qty = bom_line.product_qty * line.quantity
                            # 3. 创建 stock.move 扣减库存
                            self._create_stock_move(bom_line.product_id, consume_qty)
                    else:
                        # 没有 BOM 的产品直接扣减
                        if product.type == 'product':
                            self._create_stock_move(product, line.quantity)
            """)
            self.skipTest("_consume_inventory 方法待实现")

        # 如果方法已实现，执行测试
        # TODO: 创建订单并验证库存变化

        _logger.info("✓ 库存消耗测试完成")

    def test_05_insufficient_stock_warning(self):
        """
        测试库存不足时的提示

        ⚠️ 当前状态：待实现

        预期行为：
        1. 设置叉烧库存为 0
        2. 创建拉面订单
        3. 提交时应该提示库存不足
        """
        if not self.stock_installed:
            self.skipTest("stock 模块未安装")

        # 检查是否有库存验证逻辑
        has_stock_check = hasattr(self.env['qr.order'], '_check_stock_availability')

        if not has_stock_check:
            _logger.warning("⚠️ qr.order 缺少 _check_stock_availability 方法，功能待实现")
            _logger.info("""
            待实现功能说明：
            ----------------
            需要在 qr_order.py 中添加库存检查方法：

            def _check_stock_availability(self):
                '''检查订单所需原材料是否有足够库存'''
                insufficient = []
                for line in self.line_ids:
                    bom = self.env['mrp.bom']._bom_find(line.product_id)
                    if bom:
                        for bom_line in bom.bom_line_ids:
                            required_qty = bom_line.product_qty * line.quantity
                            available_qty = bom_line.product_id.qty_available
                            if available_qty < required_qty:
                                insufficient.append({
                                    'product': bom_line.product_id.name,
                                    'required': required_qty,
                                    'available': available_qty,
                                })
                return insufficient
            """)
            self.skipTest("_check_stock_availability 方法待实现")

    def test_06_stock_move_creation(self):
        """
        测试库存移动记录创建

        ⚠️ 当前状态：待实现

        预期行为：
        1. 订单确认后创建 stock.move 记录
        2. 记录应该从内部库位移动到消耗库位
        3. 移动状态应该是 done
        """
        if not self.stock_installed:
            self.skipTest("stock 模块未安装")

        _logger.warning("⚠️ 库存移动记录测试待实现")
        self.skipTest("stock.move 创建逻辑待实现")

    def test_07_multi_product_order_consumption(self):
        """
        测试多产品订单的库存消耗

        ⚠️ 当前状态：待实现

        预期行为：
        1. 订单包含多种菜品
        2. 每种菜品的 BOM 原材料都应该被消耗
        3. 库存扣减应该汇总计算
        """
        if not self.stock_installed:
            self.skipTest("stock 模块未安装")

        _logger.warning("⚠️ 多产品库存消耗测试待实现")
        self.skipTest("多产品库存消耗逻辑待实现")


@tagged('post_install', '-at_install', 'qr_ordering', 'inventory', 'bom')
class TestBomExpansion(TransactionCase):
    """测试 BOM 展开逻辑"""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.mrp_installed = 'mrp.bom' in cls.env

    def test_01_bom_module_check(self):
        """检查 mrp 模块是否安装"""
        if not self.mrp_installed:
            _logger.warning("⚠️ mrp 模块未安装，BOM 测试将被跳过")
            self.skipTest("mrp 模块未安装")

        self.assertTrue(self.mrp_installed, "mrp 模块应该已安装")
        _logger.info("✓ mrp 模块检查通过")

    def test_02_bom_find_for_product(self):
        """测试根据产品查找 BOM"""
        if not self.mrp_installed:
            self.skipTest("mrp 模块未安装")

        # 创建测试产品和 BOM
        product = self.env['product.product'].create({
            'name': 'Test Product with BOM',
            'type': 'consu',
        })

        ingredient = self.env['product.product'].create({
            'name': 'Test Ingredient',
            'type': 'product',
        })

        bom = self.env['mrp.bom'].create({
            'product_tmpl_id': product.product_tmpl_id.id,
            'product_qty': 1.0,
            'bom_line_ids': [
                (0, 0, {'product_id': ingredient.id, 'product_qty': 2.0}),
            ],
        })

        # 查找 BOM
        found_bom = self.env['mrp.bom']._bom_find(product)
        self.assertEqual(found_bom, bom, "应该找到正确的 BOM")

        _logger.info("✓ BOM 查找测试通过")
