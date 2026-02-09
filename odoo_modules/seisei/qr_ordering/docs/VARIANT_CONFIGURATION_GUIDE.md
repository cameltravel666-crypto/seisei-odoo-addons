# Product Variants Configuration Guide for QR Ordering
# 产品变体配置指南（QR扫码点餐）

**Version**: 18.0.1.0.2
**Last Updated**: 2026-02-09
**Module**: `qr_ordering`

---

## Executive Summary / 概述

This guide explains how to correctly configure product variants in Odoo 18 CE for the QR Ordering system, ensuring that drink sizes (e.g., Medium/Large) are displayed and ordered correctly.

本指南解释如何在 Odoo 18 CE 中正确配置产品变体用于 QR 扫码点餐系统，确保饮品规格（如中杯/大杯）正确显示和下单。

---

## Table of Contents / 目录

1. [Understanding Odoo Product Variants](#understanding-odoo-product-variants)
2. [Configuration Checklist](#configuration-checklist)
3. [QR Ordering Data Flow](#qr-ordering-data-flow)
4. [Troubleshooting](#troubleshooting)
5. [Technical Details](#technical-details)

---

## 1. Understanding Odoo Product Variants
## 1. 理解 Odoo 产品变体

### Odoo Data Model / Odoo 数据模型

In Odoo 18, products with variants use the following structure:

在 Odoo 18 中，带变体的产品使用以下结构：

```
product.template (产品模板)
    └── product.product (产品变体)
            ├── product_template_attribute_value_ids (属性值)
            └── Each variant has its own ID, price, stock
                每个变体都有自己的 ID、价格、库存
```

### Example: JJ Drink with Size Variants
### 示例：JJ 饮品带尺寸变体

**Product Template**: JJ
**Attribute**: Size (尺寸)
**Attribute Values**:
- 中杯/350ml (Medium/350ml) - Price: ¥530
- 大杯/500ml (Large/500ml) - Price: ¥630

This creates **two product variants**:
1. `product.product` ID=123: JJ [Size: 中杯/350ml]
2. `product.product` ID=124: JJ [Size: 大杯/500ml]

---

## 2. Configuration Checklist
## 2. 配置检查清单

### Step 1: Create Product Attributes / 创建产品属性

**Navigate to**: Sales > Configuration > Products > Attributes
**导航到**: 销售 > 配置 > 产品 > 属性

1. **Create Attribute** (创建属性)
   - Name: `Size` (尺寸)
   - Display Type: `Radio` (单选) or `Select` (下拉)
   - Variants Creation Mode: `Instantly` (立即创建)

2. **Add Attribute Values** (添加属性值)
   - Value 1: `中杯/350ml` (Medium/350ml)
   - Value 2: `大杯/500ml` (Large/500ml)

### Step 2: Configure Product Template / 配置产品模板

**Navigate to**: Sales > Products > Products
**导航到**: 销售 > 产品 > 产品

1. **Create/Edit Product Template**
   - Name: `JJ`
   - Product Type: `Consumable` or `Storable Product`
   - ✅ Can be Sold
   - ✅ Available in POS

2. **Add Attributes & Values** (添加属性和值)
   - Go to "Attributes & Variants" tab (属性和变体标签页)
   - Click "Add a line" (添加一行)
   - Select Attribute: `Size`
   - Select Values: `中杯/350ml`, `大杯/500ml`
   - **Result**: Odoo automatically creates 2 product variants

3. **Configure QR Ordering Settings** (配置 QR 点餐设置)
   - Go to "QR Ordering" tab (QR点餐标签页)
   - ✅ Available for QR Ordering (可扫码点餐)
   - ❌ Sold Out (售罄) - leave unchecked
   - Add short description (optional)
   - Add product image
   - Add category (e.g., Drinks/饮品)

### Step 3: Set Variant Prices / 设置变体价格

**Navigate to**: Product > Variants
**导航到**: 产品 > 变体

1. Click on variant: `JJ [Size: 中杯/350ml]`
   - Set Sales Price: `¥530`
   - Set Cost (optional)

2. Click on variant: `JJ [Size: 大杯/500ml]`
   - Set Sales Price: `¥630`
   - Set Cost (optional)

### Step 4: Configure POS Settings / 配置 POS 设置

**Navigate to**: Point of Sale > Configuration > Point of Sale
**导航到**: 销售点 > 配置 > 销售点

1. Select your POS Configuration
2. Ensure:
   - ✅ Product variants are available
   - ✅ Fiscal position is configured (for tax calculation)
   - ✅ POS session is open

### Step 5: Configure QR Table / 配置 QR 餐桌

**Navigate to**: QR Ordering > Tables
**导航到**: QR点餐 > 餐桌

1. Create/Edit Table
2. Link to POS Configuration
3. Print QR code
4. Test scanning QR code

---

## 3. QR Ordering Data Flow
## 3. QR 点餐数据流

### Architecture Overview / 架构概览

```
┌─────────────────┐
│  Odoo Backend   │
│  (Python)       │
├─────────────────┤
│ product.product │ ← Product variants with attributes
│ (Variant Model) │   产品变体（含属性）
└────────┬────────┘
         │
         ├─ get_qr_ordering_data()
         │  └─ Returns:
         │     - id (product.product ID)
         │     - name (Full name: "JJ [Size: 中杯/350ml]")
         │     - variant_display_name ("中杯/350ml")
         │     - attribute_values ([{attribute_name: "Size", attribute_value: "中杯/350ml"}])
         │     - price (¥530)
         │     - price_with_tax (¥583)
         │
         ▼
┌─────────────────┐
│ QR Controller   │
│ (HTTP API)      │
├─────────────────┤
│ GET /qr/api/    │
│     init        │ ← Returns menu with product templates & variants
│                 │   返回菜单（含产品模板和变体）
└────────┬────────┘
         │
         ├─ menu.templates[].variants[]
         │  └─ Each variant has:
         │     - id: 123
         │     - variant_display_name: "中杯/350ml"
         │     - price_with_tax: 583
         │
         ▼
┌─────────────────┐
│  Frontend JS    │
│  (qr_ordering.  │
│   js)           │
├─────────────────┤
│ Product Modal   │ ← User sees:
│ (Variant        │   - Template name: "JJ"
│  Selection)     │   - Variant buttons: "中杯/350ml ¥583" | "大杯/500ml ¥693"
└────────┬────────┘
         │
         ├─ User selects: "中杯/350ml"
         ├─ User clicks: "Add to Cart"
         │
         ▼
┌─────────────────┐
│ POST /qr/api/   │
│      cart/add   │
├─────────────────┤
│ Payload:        │
│ {               │
│   product_id:   │ ← Correct variant ID (123, not template ID)
│     123,        │   正确的变体 ID（123，不是模板 ID）
│   qty: 1        │
│ }               │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ QR Order Line   │
│ (qr.order.line) │
├─────────────────┤
│ - product_id:   │ ← References correct product.product (variant)
│     123         │   引用正确的 product.product（变体）
│ - price_unit:   │
│     530         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ POS Order Line  │
│ (pos.order.line)│
├─────────────────┤
│ - product_id:   │ ← Same variant ID
│     123         │   相同的变体 ID
│ - full_product_ │
│   name: "JJ     │
│   [Size: 中杯   │
│   /350ml]"      │
│ - price_subtotal│
│   _incl: 583    │
└─────────────────┘
```

### Key Points / 关键点

1. **Backend returns variants with attribute information**
   后端返回带属性信息的变体

2. **Frontend displays variant options clearly**
   前端清晰显示变体选项

3. **User selects specific variant (product.product ID)**
   用户选择特定变体（product.product ID）

4. **Order line uses correct variant ID, not template ID**
   订单行使用正确的变体 ID，而非模板 ID

5. **POS receives order with correct variant and price**
   POS 接收到正确变体和价格的订单

---

## 4. Troubleshooting
## 4. 问题排查

### Issue 1: Variants not showing in QR menu
### 问题 1: 变体未在 QR 菜单中显示

**Symptoms** / 症状:
- Only one size shows up
- 只显示一个尺寸

**Solution** / 解决方案:
1. Check that product template has attribute lines configured
   检查产品模板是否配置了属性行
2. Verify both variants are:
   验证两个变体是否都：
   - ✅ Available in POS (可在 POS 中使用)
   - ✅ Not archived (未归档)
   - ✅ Template has "QR Available" checked (模板勾选了"可扫码点餐")
3. Clear browser cache and reload QR page
   清除浏览器缓存并重新加载 QR 页面

### Issue 2: Wrong product or price in order
### 问题 2: 订单中产品或价格错误

**Symptoms** / 症状:
- Selected 中杯 but 大杯 was ordered
- 选择了中杯但下单了大杯
- Price doesn't match selection
- 价格与选择不匹配

**Solution** / 解决方案:
1. **Verify frontend is sending correct product_id**:
   验证前端发送的 product_id 是否正确：
   - Open browser DevTools > Network tab
   - Submit order
   - Check `/qr/api/cart/add` request payload
   - Ensure `product_id` matches the selected variant ID

2. **Verify variant prices are set correctly**:
   验证变体价格设置是否正确：
   - Go to Product > Variants
   - Check each variant's Sales Price

3. **Check tax configuration**:
   检查税收配置：
   - Verify POS fiscal position
   - Ensure taxes are applied correctly

### Issue 3: Variant display name not clear
### 问题 3: 变体显示名称不清晰

**Symptoms** / 症状:
- Shows "JJ [Size: 中杯/350ml]" instead of just "中杯/350ml"
- 显示"JJ [Size: 中杯/350ml]"而非"中杯/350ml"

**Solution** / 解决方案:
1. Ensure you're running module version **18.0.1.0.2** or higher
   确保运行模块版本 **18.0.1.0.2** 或更高
2. Upgrade the `qr_ordering` module:
   升级 `qr_ordering` 模块：
   ```bash
   # In Odoo
   Apps > qr_ordering > Upgrade
   ```
3. Restart Odoo and clear browser cache
   重启 Odoo 并清除浏览器缓存

---

## 5. Technical Details
## 5. 技术细节

### Backend Changes (v18.0.1.0.2)
### 后端更改 (v18.0.1.0.2)

**File**: `models/product_template.py`

**Changes**:
- Added `variant_display_name` field to API response
- Added `attribute_values` list to API response
- Enhanced `get_qr_ordering_data()` to extract attribute information

**Example Output**:
```python
{
    'id': 123,
    'name': 'JJ [Size: 中杯/350ml]',
    'variant_display_name': '中杯/350ml',
    'attribute_values': [
        {
            'attribute_name': 'Size',
            'attribute_value': '中杯/350ml'
        }
    ],
    'price': 530.0,
    'price_with_tax': 583.0,
    # ... other fields
}
```

### Controller Changes (v18.0.1.0.2)
### 控制器更改 (v18.0.1.0.2)

**File**: `controllers/qr_ordering_controller.py`

**Changes**:
- Updated `_get_menu_data()` to include `variant_display_name` in variants list
- Updated variant serialization to pass attribute information to frontend

### Frontend Changes (v18.0.1.0.2)
### 前端更改 (v18.0.1.0.2)

**File**: `static/src/js/qr_ordering.js`

**Changes**:
- Updated variant button rendering to use `variant_display_name`
- Updated selected variant display to use `variant_display_name`
- Updated variant selection logic to use `variant_display_name`
- Display tax-inclusive prices (`price_with_tax`) in variant buttons

**Before**:
```javascript
<span class="qr-variant-name">${v.name}</span>
<span class="qr-variant-price">¥${v.price.toFixed(0)}</span>
```

**After**:
```javascript
<span class="qr-variant-name">${v.variant_display_name || v.name}</span>
<span class="qr-variant-price">¥${(v.price_with_tax || v.price || 0).toFixed(0)}</span>
```

### Database Schema
### 数据库架构

**No database schema changes required.**
**无需数据库架构更改。**

This update only changes:
- Python model methods (computed fields)
- Controller API responses
- Frontend JavaScript rendering

此更新仅更改：
- Python 模型方法（计算字段）
- 控制器 API 响应
- 前端 JavaScript 渲染

---

## Testing Checklist
## 测试检查清单

### Pre-deployment Testing (Staging)
### 部署前测试（Staging）

- [ ] Create test product with 2+ variants
      创建带 2+ 变体的测试产品
- [ ] Verify variants display correctly in QR menu
      验证变体在 QR 菜单中正确显示
- [ ] Select each variant and add to cart
      选择每个变体并添加到购物车
- [ ] Verify cart shows correct variant name and price
      验证购物车显示正确的变体名称和价格
- [ ] Submit order
      提交订单
- [ ] Verify POS receives correct product.product ID
      验证 POS 接收正确的 product.product ID
- [ ] Verify order line price matches variant price (with tax)
      验证订单行价格与变体价格匹配（含税）
- [ ] Test with products without variants (single product)
      测试无变体产品（单一产品）
- [ ] Test with products with 3+ variants
      测试带 3+ 变体的产品

### Post-deployment Verification (Production)
### 部署后验证（Production）

- [ ] Check existing orders still display correctly
      检查现有订单仍正确显示
- [ ] Verify no price discrepancies
      验证无价格差异
- [ ] Monitor error logs for 24 hours
      监控错误日志 24 小时
- [ ] User acceptance testing with real customers
      真实客户用户验收测试

---

## Rollback Plan
## 回滚计划

If issues occur after deployment:

如果部署后出现问题：

1. **Immediate**: Revert to previous module version
   **立即**：回退到之前的模块版本
   ```bash
   # Restore previous version from git
   git checkout <previous-commit>
   ```

2. **In Odoo**: Downgrade module
   **在 Odoo 中**：降级模块
   ```
   Apps > qr_ordering > Uninstall
   Apps > Update Apps List
   Apps > qr_ordering (v18.0.1.0.1) > Install
   ```

3. **Clear cache**: Restart Odoo and clear browser caches
   **清除缓存**：重启 Odoo 并清除浏览器缓存

---

## Support & Contact
## 支持与联系

**Module**: qr_ordering
**Version**: 18.0.1.0.2
**Repository**: seisei-odoo-addons
**Documentation**: /odoo_modules/seisei/qr_ordering/docs/

For issues or questions:
- Check existing documentation
- Review error logs: `docker logs odoo18-staging-rds | grep ERROR`
- Create GitHub issue with:
  - Odoo version
  - Module version
  - Steps to reproduce
  - Expected vs actual behavior
  - Screenshots (if applicable)

---

**Last Updated**: 2026-02-09
**Author**: Seisei Engineering Team
**License**: LGPL-3
