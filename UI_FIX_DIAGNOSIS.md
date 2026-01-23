# Seisei BizNexus UI 修复诊断报告

**日期**: 2026-01-11  
**任务**: 五端UI统一优化，修复Header滚动、页面跳动、按钮disabled等问题

---

## 1. 技术栈识别

✅ **已确认**:
- **框架**: Next.js 16.1.1 (App Router)
- **移动端**: Capacitor 8.0
- **样式**: Tailwind CSS 4 + CSS Variables (Design Tokens)
- **国际化**: next-intl
- **状态管理**: Zustand + React Query

---

## 2. 布局结构现状

### 2.1 布局层级
```
app/layout.tsx (Root)
  └── app/(app)/layout.tsx (AppShell)
      ├── Navigation (Header)
      └── main (Content Area)
```

### 2.2 关键文件位置
- **根布局**: `src/app/layout.tsx`
- **App布局**: `src/app/(app)/layout.tsx`
- **Navigation组件**: `src/components/layout/nav.tsx`
- **全局样式**: `src/app/globals.css`
- **Design Tokens**: 已在 `globals.css` 中定义 ✅

---

## 3. 问题诊断

### 问题1: Header跟随滚动 ✅ 已修复（需验证）
**现状**:
- Navigation组件中Mobile Header已使用 `position: fixed` (line 196)
- AppShell中main使用了 `paddingTop` 为Header留空间 (line 39)

**潜在问题**:
- Desktop sidebar也使用 `fixed`，但应该没问题
- 需要验证是否有页面级别的sticky header导致问题

### 问题2: 页面跳动（Layout Shift）
**可能原因**:
1. Header高度不固定（但已定义 `--height-header: 56px`）
2. 字体加载导致FOUC（但已设置 `display: swap`）
3. 滚动条出现/消失导致宽度变化（需验证）
4. Tab切换时容器高度变化（需检查）

### 问题3: 桌台管理按钮密度
**现状**:
- `pos/tables/page.tsx` line 283: 已使用 `grid-cols-4` ✅
- 但可能需要优化间距和卡片尺寸

### 问题4: 提交按钮disabled
**已找到的disabled原因**:
1. `accounting/cash-ledger/page.tsx`: `!isConfigured` → 需要配置cash journal
2. `sales/create/page.tsx`: `!selectedCustomer || orderLines.length === 0`
3. `purchase/create/page.tsx`: 类似逻辑
4. `pos/product-management/bom/page.tsx`: `!isFormValid || isSaving`

**问题**: 错误提示可能不够明显，用户不知道如何解决

### 问题5: Modal样式不统一
**现状**:
- Modal组件已存在 `src/components/ui/modal.tsx`
- Mobile端已使用bottom sheet样式（globals.css line 923-949）
- 但可能部分页面未使用统一组件

---

## 4. 修复计划

### 优先级1: 修复Header固定和滚动 ✅
- [x] 确认Navigation组件Header是fixed
- [ ] 验证所有页面没有额外的sticky header
- [ ] 确保main区域padding-top正确

### 优先级2: 修复Layout Shift
- [ ] 确保Header高度固定
- [ ] 防止滚动条导致的宽度变化
- [ ] 固定Tab容器高度

### 优先级3: 优化按钮disabled提示
- [ ] 改进cash-ledger页面的配置提示
- [ ] 统一错误提示样式（toast/inline alert）
- [ ] 添加"去配置"快捷入口

### 优先级4: 统一组件使用
- [ ] 确保所有页面使用统一的Modal组件
- [ ] 确保所有页面使用统一的按钮样式
- [ ] 验证统计卡片样式一致

### 优先级5: 优化桌台管理
- [ ] 优化按钮间距和尺寸
- [ ] 确保移动端一行4个

---

## 5. 下一步行动

1. 检查所有页面的Header实现
2. 修复Layout Shift问题
3. 优化disabled按钮的错误提示
4. 验证组件统一性
5. 创建QA Checklist
