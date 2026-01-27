# POS 点菜 → 库存消耗 → 采购申请 测试套件

## 概述

本测试套件验证 POS 点菜到采购申请的完整业务流程：

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  QR 点餐    │ ──▶ │  库存消耗   │ ──▶ │  采购申请   │
│  (已实现)   │     │  (待实现)   │     │  (待实现)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

## 快速开始

### 运行所有测试

```bash
# 使用 Python 运行器
python run_tests.py

# 或使用 Shell 脚本
./run_tests.sh
```

### 运行特定测试

```bash
# POS 点菜流程测试
python run_tests.py pos_flow

# 库存消耗测试
python run_tests.py inventory

# 采购申请测试
python run_tests.py purchase

# 集成测试
python run_tests.py integration

# 查看实现状态
python run_tests.py --status
```

### 使用 Odoo 命令直接运行

```bash
./odoo-bin -c odoo.conf -d seisei_test \
    --test-tags qr_ordering \
    --stop-after-init \
    -i qr_ordering
```

## 测试文件说明

| 文件 | 描述 | 标签 |
|-----|------|------|
| `test_pos_order_flow.py` | POS 点菜流程测试 | `pos_flow` |
| `test_inventory_consumption.py` | 库存消耗测试 | `inventory` |
| `test_purchase_requisition.py` | 采购申请测试 | `purchase` |
| `test_full_flow_integration.py` | 端到端集成测试 | `integration`, `full_flow` |

## 当前实现状态

### ✅ 已实现

- [x] QR 扫码点餐 (`qr.order`)
- [x] 订单状态管理 (cart → ordered → cooking → serving → paid)
- [x] 订单同步到 POS (`_sync_to_pos`)
- [x] 厨房打印集成
- [x] 加菜功能

### ⚠️ 待实现

- [ ] 订单确认后消耗库存 (`_consume_inventory`)
- [ ] BOM 物料清单展开
- [ ] 库存可用性检查 (`_check_stock_availability`)
- [ ] 自动生成采购申请 (`_create_purchase_requisition`)
- [ ] 采购数量计算
- [ ] 定时采购检查任务

## 待实现功能说明

### 1. 库存消耗 (`_consume_inventory`)

需要在 `qr_order.py` 中添加：

```python
def _consume_inventory(self):
    """订单确认后消耗库存"""
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
```

### 2. 库存检查 (`_check_stock_availability`)

```python
def _check_stock_availability(self):
    """检查订单所需原材料是否有足够库存"""
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
```

### 3. 采购申请生成 (`_create_purchase_requisition`)

```python
def _create_purchase_requisition(self):
    """库存低于阈值时生成采购申请"""
    consumed_products = self._get_consumed_products()

    for product in consumed_products:
        orderpoint = self.env['stock.warehouse.orderpoint'].search([
            ('product_id', '=', product.id),
        ], limit=1)

        if not orderpoint:
            continue

        current_qty = product.qty_available
        if current_qty < orderpoint.product_min_qty:
            purchase_qty = orderpoint.product_max_qty - current_qty
            purchase_qty = math.ceil(purchase_qty / orderpoint.qty_multiple) * orderpoint.qty_multiple
            self._create_purchase_order_or_requisition(product, purchase_qty)
```

## 测试数据

测试会自动创建以下测试数据：

### 产品

| 产品 | 类型 | 价格 |
|-----|------|------|
| 豚骨拉面 | 消耗品 | ¥1,200 |
| 煎饺（6个） | 消耗品 | ¥500 |

### 原材料

| 原材料 | 初始库存 | 最小库存 |
|-------|---------|---------|
| 面条 | 100 | 20 |
| 汤底 | 50 | 10 |
| 叉烧 | 20 | 5 |
| 溏心蛋 | 50 | 10 |
| 葱花 | 30 | 5 |

### BOM (豚骨拉面)

| 原材料 | 用量/份 |
|-------|--------|
| 面条 | 0.2 |
| 汤底 | 0.5 |
| 叉烧 | 0.1 |
| 溏心蛋 | 1.0 |
| 葱花 | 0.05 |

## 环境变量

| 变量 | 说明 | 默认值 |
|-----|------|-------|
| `ODOO_BIN` | odoo-bin 路径 | 自动查找 |
| `ODOO_CONF` | odoo.conf 路径 | 自动查找 |
| `DATABASE` | 测试数据库名 | `seisei_test` |

## 依赖模块

测试完整功能需要安装以下模块：

| 模块 | 用途 | 必需 |
|-----|------|------|
| `point_of_sale` | POS 系统 | ✓ |
| `pos_restaurant` | 餐厅 POS | ✓ |
| `stock` | 库存管理 | 推荐 |
| `mrp` | BOM 管理 | 推荐 |
| `purchase` | 采购管理 | 推荐 |

## 测试覆盖率

运行带覆盖率的测试：

```bash
pip install coverage

coverage run --source=. run_tests.py
coverage report -m
coverage html  # 生成 HTML 报告
```
