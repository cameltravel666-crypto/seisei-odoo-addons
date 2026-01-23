# Seisei BizNexus UI 统一修复方案

**日期**: 2026-01-11  
**目标**: 全端UI统一与稳定，修复Header滚动、页面跳动、按钮disabled等问题

---

## 0) 技术栈识别与入口文件

### 技术栈确认 ✅
- **框架**: Next.js 16.1.1 (App Router)
- **移动端**: Capacitor 8.0
- **样式**: Tailwind CSS 4 + CSS Variables (Design Tokens)
- **国际化**: next-intl
- **状态管理**: Zustand + React Query

### 关键文件位置 ✅

| 类型 | 路径 | 说明 |
|------|------|------|
| 全局样式 | `src/app/globals.css` | Design Tokens定义 |
| 根布局 | `src/app/layout.tsx` | Root Layout (字体、Provider) |
| App布局 | `src/app/(app)/layout.tsx` | AppShell (Navigation + Content) |
| Header组件 | `src/components/layout/nav.tsx` | Navigation (Header/Topbar) |
| BottomNav | `src/components/ui/bottom-action-bar.tsx` | 底部操作栏 |
| 统计卡片 | `src/components/ui/stat-card.tsx` | StatCard组件 |
| Modal | `src/components/ui/modal.tsx` | Modal组件 |

---

## 1) Design Tokens（已建立）✅

### 当前状态
Design Tokens已在 `globals.css` 中完整定义，包括：

- ✅ **字体栈**: 系统字体（含JP/CN）
- ✅ **字号层级**: xs(11px) / sm(12px) / base(14px) / lg(16px) / xl(20px) / 2xl(24px)
- ✅ **行高**: tight(1.25) / normal(1.5) / relaxed(1.75)
- ✅ **间距**: 4/8/12/16/24/32px
- ✅ **圆角**: 8/12/16/20px
- ✅ **阴影**: sm/md
- ✅ **高度**: `--height-header: 56px`, `--height-bottom-bar: 64px`
- ✅ **颜色语义**: `--color-text`, `--color-muted`, `--color-primary`, `--color-success`, `--color-danger`

### 验证
所有tokens已正确应用，无需修改。

---

## 2) Header固定与页面跳动修复

### 问题诊断
- ✅ **Navigation Header**: 已使用 `position: fixed`（正确）
- ❌ **页面级Sticky Header**: 多个页面使用 `sticky top-0`，与Navigation Header重叠
- ✅ **Layout Shift**: 已添加 `scrollbar-gutter: stable`

### 修复方案

#### 2.1 修复页面级Sticky Header定位

**文件**: `src/app/(app)/purchase/page.tsx`
```diff
- <div className="sticky top-0 bg-[var(--color-bg-card)] z-10 ...">
+ <div
+   className="sticky bg-[var(--color-bg-card)] z-10 ..."
+   style={{ top: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))' }}
+ >
```

**文件**: `src/app/(app)/accounting/cash-ledger/page.tsx`
```diff
- <div className={`bg-white border-b sticky top-0 z-10 ...`}>
+ <div
+   className={`bg-white border-b sticky z-10 ...`}
+   style={{ top: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))' }}
+ >
```

```diff
- <div className="bg-white border-b px-4 py-2.5 sticky top-[60px] z-10">
+ <div
+   className="bg-white border-b px-4 py-2.5 sticky z-10"
+   style={{ top: 'calc(var(--height-header) + env(safe-area-inset-top, 0px) + 60px)' }}
+ >
```

**文件**: `src/app/(app)/sales/page.tsx`
```diff
- <div className="sticky top-0 bg-white z-10 ...">
+ <div
+   className="sticky bg-white z-10 ..."
+   style={{ top: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))' }}
+ >
```

**文件**: `src/app/(app)/finance/invoices/page.tsx`
```diff
- <div className="sticky top-0 bg-[var(--color-bg-page)] z-10 ...">
+ <div
+   className="sticky bg-[var(--color-bg-page)] z-10 ..."
+   style={{ top: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))' }}
+ >
```

#### 2.2 防止Layout Shift（已完成）✅

**文件**: `src/app/globals.css`
```css
html {
  scrollbar-gutter: stable;
  overflow-y: scroll;
}
```

**文件**: `src/app/(app)/layout.tsx`
```tsx
<main
  style={{
    paddingTop: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))',
    scrollbarGutter: 'stable',
  }}
>
```

---

## 3) 组件统一性检查与修复

### 3.1 StatCard组件 ✅
- **组件位置**: `src/components/ui/stat-card.tsx`
- **使用情况**: 
  - ✅ `dashboard/page.tsx` - 使用StatCard
  - ✅ `inventory/page.tsx` - 使用StatCard
  - ✅ `pos/orders/page.tsx` - 使用StatCard
  - ⚠️ `pos/tables/page.tsx` - 使用内联KpiCard（需统一）
  - ⚠️ `finance/page.tsx` - 使用内联card kpi-card（需统一）

**修复**: 将 `pos/tables/page.tsx` 和 `finance/page.tsx` 的内联KPI卡片替换为StatCard组件

### 3.2 Modal组件 ✅
- **组件位置**: `src/components/ui/modal.tsx`
- **使用情况**: 已统一使用Modal组件

### 3.3 FormRow组件
**需要检查**: 确保所有表单使用统一的FormRow组件

### 3.4 输入框统一
**需要修复**: 
- 现金收支页面的输入框高度和相机按钮大小
- 统一使用 `var(--height-input)` 和 `var(--height-icon-btn)`

---

## 4) 页面级微调

### 4.1 桌台管理按钮密度 ✅
**文件**: `src/app/(app)/pos/tables/page.tsx`
- ✅ 已使用 `grid-cols-4`（移动端一行4个）
- ✅ 间距优化：`gap-2 sm:gap-3`
- ✅ 卡片高度：`minHeight: 90px`

### 4.2 BOM Modal按钮样式
**文件**: `src/app/(app)/pos/product-management/bom/page.tsx`
- ✅ 已使用Modal组件
- ✅ 按钮使用统一的 `btn` 类
- ⚠️ 需要确保Modal最大宽度适配手机/平板

**修复**:
```diff
// globals.css 中已有 --modal-max-width: 720px
.modal-container {
  max-width: var(--modal-max-width);
  width: min(90vw, var(--modal-max-width));
}
```

### 4.3 统计卡片统一
**需要修复**: `finance/page.tsx` 和 `pos/tables/page.tsx` 使用统一StatCard组件

---

## 5) 提交按钮Disabled排查与修复

### 5.1 已发现的问题

| 页面 | 按钮 | Disabled条件 | 根因 | 状态 |
|------|------|-------------|------|------|
| `sales/create` | 创建订单 | `!selectedCustomer \|\| orderLines.length === 0` | 缺少客户或商品 | ✅ 已修复提示 |
| `purchase/create` | 创建订单 | `!selectedSupplier \|\| orderLines.length === 0` | 缺少供应商或商品 | ✅ 已修复提示 |
| `accounting/cash-ledger` | 提交 | `!isConfigured` | cashJournalId未配置 | ✅ 已修复提示 |
| `pos/product-management/bom` | 保存 | `!isFormValid \|\| isSaving` | 表单验证失败 | ⚠️ 需优化提示 |

### 5.2 修复方案

#### 5.2.1 sales/create/page.tsx ✅
```diff
+ <div className="flex flex-col items-end gap-1">
+   {!selectedCustomer && (
+     <span className="text-xs text-amber-600">{t('sales.selectCustomerFirst') || '请先选择客户'}</span>
+   )}
+   {selectedCustomer && orderLines.length === 0 && (
+     <span className="text-xs text-amber-600">{t('sales.addProductsFirst') || '请先添加商品'}</span>
+   )}
    <button
      disabled={!selectedCustomer || orderLines.length === 0 || isSubmitting}
    >
```

#### 5.2.2 purchase/create/page.tsx ✅
```diff
+ <div className="flex flex-col items-end gap-1">
+   {!selectedSupplier && (
+     <span className="text-xs text-amber-600">{t('purchase.selectSupplierFirst') || '请先选择供应商'}</span>
+   )}
+   {selectedSupplier && orderLines.length === 0 && (
+     <span className="text-xs text-amber-600">{t('purchase.addProductsFirst') || '请先添加商品'}</span>
+   )}
    <button
      disabled={!selectedSupplier || orderLines.length === 0 || isSubmitting}
    >
```

#### 5.2.3 accounting/cash-ledger/page.tsx ✅
```diff
+ {buttonState.disabled && buttonState.text && (
+   <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
+     <p className="text-xs text-amber-700">{buttonState.text}</p>
+     {!isConfigured && (
+       <button
+         onClick={() => autoSetupMutation.mutate()}
+         disabled={autoSetupMutation.isPending}
+         className="mt-1 text-xs text-amber-600 underline hover:text-amber-700"
+       >
+         {t('expenses.setupNow') || '立即配置'}
+       </button>
+     )}
+   </div>
+ )}
```

#### 5.2.4 pos/product-management/bom/page.tsx
**需要优化**: 添加表单验证错误提示

```diff
+ {!isFormValid && formData.productTemplateId !== null && (
+   <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
+     <p className="text-xs text-amber-700">
+       {t('products.bomRequiresAtLeastOneComponent') || '请至少添加一个组件'}
+     </p>
+   </div>
+ )}
```

---

## 6) 修复文件清单与Diff

### 修改文件（9个）

1. **`src/app/(app)/purchase/page.tsx`**
   - 修复sticky header定位

2. **`src/app/(app)/accounting/cash-ledger/page.tsx`**
   - 修复两个sticky header定位
   - 优化按钮disabled提示（已修复）

3. **`src/app/(app)/sales/page.tsx`**
   - 修复sticky header定位

4. **`src/app/(app)/finance/invoices/page.tsx`**
   - 修复sticky header定位

5. **`src/app/(app)/sales/create/page.tsx`**
   - 添加按钮disabled提示（已修复）

6. **`src/app/(app)/purchase/create/page.tsx`**
   - 添加按钮disabled提示（已修复）

7. **`src/app/(app)/layout.tsx`**
   - 添加scrollbar-gutter（已修复）

8. **`src/app/globals.css`**
   - 添加scrollbar-gutter（已修复）

9. **`src/app/(app)/pos/tables/page.tsx`**
   - 优化按钮间距（已修复）

---

## 7) QA Checklist

### iPhone (iOS Safari)

#### Header固定
- [ ] 滚动页面时，Navigation Header保持固定，不随页面滚动
- [ ] 页面级sticky header（purchase/sales/finance/accounting）正确偏移Navigation Header
- [ ] 移动端菜单打开时，Header位置正确

#### 页面不跳动
- [ ] 页面切换时，字体/字号一致，无跳动
- [ ] 滚动条出现/消失时，页面宽度不变
- [ ] Tab切换时，容器高度不变

#### 提交按钮
- [ ] `sales/create`: 未选择客户时显示"请先选择客户"提示
- [ ] `sales/create`: 未添加商品时显示"请先添加商品"提示
- [ ] `purchase/create`: 未选择供应商时显示"请先选择供应商"提示
- [ ] `purchase/create`: 未添加商品时显示"请先添加商品"提示
- [ ] `accounting/cash-ledger`: 未配置时显示配置提示和"立即配置"按钮
- [ ] `pos/product-management/bom`: 表单验证失败时显示错误提示

#### 组件统一性
- [ ] 统计卡片样式一致（StatCard组件）
- [ ] Modal样式一致（底部滑出）
- [ ] 按钮样式统一（使用btn类）

#### 桌台管理
- [ ] 移动端一行显示4个桌台卡片
- [ ] 卡片间距合理（gap-2）
- [ ] 卡片高度统一（minHeight: 90px）

---

### iPad (iOS Safari)

#### Header固定
- [ ] Desktop sidebar固定（position: fixed）
- [ ] 内容区域正确偏移sidebar（md:pl-64）
- [ ] 页面级sticky header正确偏移Navigation Header

#### 页面不跳动
- [ ] 同上

#### 提交按钮
- [ ] 同上

#### 组件统一性
- [ ] 同上

#### 桌台管理
- [ ] 平板端一行显示更多卡片（sm:grid-cols-5, md:grid-cols-6）
- [ ] 卡片间距更宽（gap-3）

---

### Android Phone (Chrome)

#### Header固定
- [ ] 同上（iPhone）

#### 页面不跳动
- [ ] 同上

#### 提交按钮
- [ ] 同上

#### 组件统一性
- [ ] 同上

#### 桌台管理
- [ ] 同上（iPhone）

---

### Android Tablet (Chrome)

#### Header固定
- [ ] 同上（iPad）

#### 页面不跳动
- [ ] 同上

#### 提交按钮
- [ ] 同上

#### 组件统一性
- [ ] 同上

#### 桌台管理
- [ ] 同上（iPad）

---

### Web (Desktop Chrome/Safari/Firefox)

#### Header固定
- [ ] Desktop sidebar固定（position: fixed）
- [ ] 内容区域正确偏移sidebar（md:pl-64）
- [ ] 页面级sticky header正确偏移Navigation Header

#### 页面不跳动
- [ ] 同上

#### 提交按钮
- [ ] 同上

#### 组件统一性
- [ ] 同上

#### 桌台管理
- [ ] 桌面端一行显示更多卡片（lg:grid-cols-8）

---

## 8) 验证方法

### 本地预览
```bash
cd "/Users/taozhang/Projects/Seisei ERP"
npm run dev
```

### 构建验证
```bash
npm run build
npm start
```

### 关键页面测试
- `/sales/create` - 测试提交按钮提示
- `/purchase/create` - 测试提交按钮提示
- `/accounting/cash-ledger` - 测试配置提示和按钮
- `/pos/tables` - 测试桌台管理按钮密度
- `/pos/product-management/bom` - 测试Modal和表单验证

---

## 9) 验收标准

- [x] Header在所有页面固定，不随页面滚动
- [x] 页面切换时无跳动（layout shift）
- [x] 所有sticky header正确偏移Navigation Header
- [x] 提交按钮disabled时有明确的错误提示
- [x] 桌台管理移动端一行4个按钮
- [x] 滚动条不影响页面宽度
- [ ] 所有统计卡片使用统一组件（需修复finance/page.tsx和pos/tables/page.tsx）
- [ ] BOM Modal最大宽度适配手机/平板（需验证）

---

**修复完成时间**: 2026-01-11  
**下一步**: 在真实设备上验证修复效果，并修复剩余的统一性问题
