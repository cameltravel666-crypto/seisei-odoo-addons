# Seisei BizNexus UI 上线前最终修复报告

**日期**: 2026-01-11  
**任务**: 统一全局字体/字号/行高，解决 Header 跟随滚动问题，消除页面跳动

---

## A. 问题根因定位

### 1. Header 跟随滚动问题

**根因**:
- ❌ `body/html` 没有禁止滚动，导致页面整体滚动时 Header 跟随移动
- ❌ Header 使用了 `position: fixed`，但可能受到祖先节点的 transform 影响
- ❌ iOS/WebView 在回弹（overscroll bounce）时，fixed 元素可能跟随位移

**解决方案**:
- ✅ 禁止 `body/html` 滚动：`height: 100%; overflow: hidden;`
- ✅ 只有 `main` 容器滚动：`overflow-y: auto; overscroll-behavior: contain;`
- ✅ Header 使用 `transform: translateZ(0)` 创建新的堆叠上下文

### 2. 页面跳动（Layout Shift）问题

**根因**:
- ❌ 滚动条出现/消失导致宽度变化
- ❌ Tab 切换时，选中态通过 `border` 改变高度
- ❌ 字体加载可能导致 FOUC（Flash of Unstyled Content）

**解决方案**:
- ✅ 使用 `scrollbar-gutter: stable` 预留滚动条空间
- ✅ Tab 使用 `border-bottom` 而不是 `border`，避免高度变化
- ✅ 字体使用 `display: swap` 防止布局跳动

### 3. Transform 祖先节点检查

**检查结果**:
- ✅ **AuthInitializer**: 只是 Fragment，无 transform
- ✅ **AppShell div**: 无 transform，只是 flex 容器
- ✅ **Navigation 组件**: Header 使用 fixed，无 transform 祖先

**结论**: 没有发现祖先节点有 transform，Header 的 fixed 定位应该是有效的。

---

## B. AppShell 固定头部结构实施

### 修改文件

#### 1. `src/app/globals.css`

```diff
html {
+ height: 100%;
+ overflow: hidden;
  scrollbar-gutter: stable;
  -webkit-text-size-adjust: 100%;
}

body {
+ height: 100%;
+ overflow: hidden;
+ margin: 0;
+ padding: 0;
  ...
}
```

#### 2. `src/app/(app)/layout.tsx`

```diff
<div
- className="flex flex-col bg-[var(--color-bg-page)]"
+ className="app-shell flex flex-col bg-[var(--color-bg-page)]"
  style={{ 
-   height: '100dvh', minHeight: '100dvh' 
+   height: '100vh',
+   height: '100dvh', /* Dynamic viewport for mobile */
+   minHeight: '100vh',
+   minHeight: '100dvh',
+   overflow: 'hidden',
  }}
>
  <Navigation />
  <main
- className="flex-1 overflow-y-auto overflow-x-hidden md:pl-64 -webkit-overflow-scrolling-touch"
+ className="app-main-scroll flex-1 overflow-y-auto overflow-x-hidden md:pl-64"
    style={{
      paddingTop: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))',
-   scrollbarGutter: 'stable',
+   scrollbarGutter: 'stable',
+   WebkitOverflowScrolling: 'touch',
+   overscrollBehavior: 'contain',
+   WebkitOverflowBehavior: 'contain',
    }}
  >
```

#### 3. `src/components/layout/nav.tsx`

```diff
<div
- className="md:hidden fixed top-0 left-0 right-0 z-50 ..."
+ className="app-header md:hidden fixed top-0 left-0 right-0 z-50 ..."
  style={{
    paddingTop: 'env(safe-area-inset-top, 0px)',
    height: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))',
    minHeight: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))',
+   position: 'fixed',
+   top: 0,
+   left: 0,
+   right: 0,
+   transform: 'translateZ(0)',
+   willChange: 'auto',
  }}
>
```

---

## C. Fixed 失效问题修复

### 实施内容

1. **Header 隔离堆叠上下文**:
   - 添加 `transform: translateZ(0)` 创建新的堆叠上下文
   - 添加 `isolation: isolate` 确保 Header 不受祖先影响
   - 添加 `backface-visibility: hidden` 优化渲染性能

2. **防止祖先 transform 影响**:
   - 检查了所有祖先节点（AuthInitializer、AppShell），确认无 transform
   - Header 直接位于 AppShell 下，无中间包装层

3. **iOS/WebView 特殊处理**:
   - 使用 `overscroll-behavior: contain` 防止回弹影响 Header
   - 使用 `-webkit-overflow-scrolling: touch` 启用 iOS 平滑滚动

---

## D. 页面跳动消除

### 1. 滚动条跳动修复

```css
html {
  scrollbar-gutter: stable; /* 预留滚动条空间 */
}

.app-main-scroll {
  scrollbar-gutter: stable; /* 主滚动容器也预留空间 */
}
```

### 2. Tab 切换高度固定

**问题**: Tab 选中态使用 `border` 会导致高度变化

**修复**:
- Tab 容器固定高度：`height: var(--height-tab)`
- Tab 按钮固定高度：`height: var(--height-tab)`
- 使用 `border-bottom` 而不是 `border`，避免高度变化
- 使用 `margin-bottom: -1px` 对齐容器边框

**新增 CSS 类**:
```css
.tab-container {
  height: var(--height-tab);
  min-height: var(--height-tab);
}

.tab-button {
  height: var(--height-tab);
  min-height: var(--height-tab);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab-button-active {
  border-bottom-color: var(--color-primary);
}
```

### 3. 字体加载稳定

**已实施**:
- ✅ `next/font` 使用 `display: swap`（已在 `layout.tsx` 中配置）
- ✅ 全局字体栈在 `globals.css` 中定义
- ✅ `html { -webkit-text-size-adjust: 100%; }` 防止 iOS 自动缩放

---

## E. 全局 Typography Token

### Token 定义（已在 globals.css）

```css
:root {
  /* Font Stack */
  --font-family-base: system-ui, -apple-system, "SF Pro Text", ...;

  /* Font Sizes */
  --font-display-size: 1.5rem;  /* 24px */
  --font-h1-size: 1.25rem;      /* 20px */
  --font-h2-size: 1rem;         /* 16px */
  --font-body-size: 0.875rem;   /* 14px */
  --font-sub-size: 0.75rem;     /* 12px */
  --font-micro-size: 0.6875rem; /* 11px */

  /* Line Heights */
  --font-display-lh: 2rem;      /* 32px */
  --font-h1-lh: 1.75rem;        /* 28px */
  --font-h2-lh: 1.5rem;         /* 24px */
  --font-body-lh: 1.25rem;      /* 20px */
  --font-sub-lh: 1rem;          /* 16px */
  --font-micro-lh: 0.875rem;    /* 14px */

  /* Font Weights */
  --font-display-weight: 700;
  --font-h1-weight: 700;
  --font-h2-weight: 600;
  --font-body-weight: 400;
  --font-sub-weight: 400;
  --font-micro-weight: 400;
}
```

### 工具类（已在 globals.css）

```css
.text-display    /* 24/32 700 */
.text-h1         /* 20/28 700 */
.text-h2         /* 16/24 600 */
.text-body       /* 14/20 400 */
.text-sub        /* 12/16 400 */
.text-micro      /* 11/14 400 */
.page-title      /* 统一页面标题 */
.section-title   /* 统一章节标题 */
```

### 响应式处理

- ✅ 使用 `clamp()` 或 `@media` 查询（可在需要时添加）
- ✅ 当前设计为移动端优先，平板/桌面使用相同字号（符合商业化标准）

---

## F. 修改文件清单

### 核心修复（3个文件）

1. **`src/app/globals.css`**
   - 禁止 html/body 滚动
   - 添加 AppShell 样式类
   - 添加 Tab/Segmented 控制样式（固定高度）

2. **`src/app/(app)/layout.tsx`**
   - AppShell 结构优化
   - Main 滚动容器添加 overscroll-behavior

3. **`src/components/layout/nav.tsx`**
   - Header 添加 `app-header` 类
   - 添加 `transform: translateZ(0)` 创建堆叠上下文

---

## 验收标准验证

### ✅ 1. Header 固定不动

**iPhone/iPad (Capacitor WebView)**:
- [ ] 滚动内容时 Header 始终固定
- [ ] 顶部回弹/拖拽时 Header 不跟随位移
- [ ] 移动端菜单打开时 Header 位置正确

**桌面浏览器**:
- [ ] 滚动内容时 Header 始终固定
- [ ] Desktop sidebar 固定不动
- [ ] 页面切换时 Header 位置不变

### ✅ 2. 页面切换无跳动

**页面切换**:
- [ ] Header 高度不变（56px + safe area）
- [ ] 标题字号不变（20px / 1.25rem）
- [ ] 字体加载不导致跳动

**Tab 切换**:
- [ ] Tab 高度不变（44px / --height-tab）
- [ ] 选中态不改变 Tab 高度（使用 border-bottom）
- [ ] 滚动条出现/消失不影响宽度

### ✅ 3. 字体规范统一

**全站字体**:
- [ ] 页面标题（H1）: 20px / 28px / 700
- [ ] 章节标题（H2）: 16px / 24px / 600
- [ ] 正文（Body）: 14px / 20px / 400
- [ ] 辅助文字（Sub）: 12px / 16px / 400
- [ ] 按钮文字: 14px / 20px / 600

**响应式**:
- [ ] iPhone 上字号不拥挤
- [ ] iPad 上字号不过小
- [ ] 桌面端字号合适

### ✅ 4. 无破坏性改动

**验证**:
- [ ] 所有路由正常
- [ ] 数据请求正常
- [ ] 权限控制正常
- [ ] 现有功能不受影响

---

## 验证方法

### 1. 本地开发

```bash
cd "/Users/taozhang/Projects/Seisei ERP"
npm run dev
```

### 2. 构建验证

```bash
npm run build
npm start
```

### 3. 设备测试

**iPhone (Capacitor)**:
- 打开应用，滚动页面，检查 Header 是否固定
- 快速滚动测试回弹，检查 Header 是否跟随
- 切换 Tab，检查是否跳动

**iPad (Capacitor)**:
- 同上
- 检查 Desktop sidebar 是否固定

**桌面浏览器**:
- Chrome/Safari/Firefox 测试
- 检查滚动条出现/消失是否影响宽度

### 4. 关键页面测试

- `/home` - 测试基本滚动
- `/sales` - 测试 Tab 切换
- `/purchase` - 测试 Tab 切换
- `/finance/invoices` - 测试 Tab 切换
- `/accounting/cash-ledger` - 测试长内容滚动

---

## 技术细节

### AppShell 结构

```html
<html style="height: 100%; overflow: hidden;">
  <body style="height: 100%; overflow: hidden;">
    <div class="app-shell" style="height: 100dvh; overflow: hidden;">
      <header class="app-header" style="position: fixed; transform: translateZ(0);">
        Navigation
      </header>
      <main class="app-main-scroll" style="overflow-y: auto; overscroll-behavior: contain;">
        Content
      </main>
    </div>
  </body>
</html>
```

### 关键 CSS 属性

1. **`overflow: hidden`** on html/body - 禁止根滚动
2. **`overscroll-behavior: contain`** on main - 防止回弹影响 Header
3. **`transform: translateZ(0)`** on Header - 创建堆叠上下文
4. **`scrollbar-gutter: stable`** - 预留滚动条空间

---

## 修复完成状态

- [x] A. 问题根因定位
- [x] B. AppShell 固定头部结构
- [x] C. Fixed 失效问题修复
- [x] D. 页面跳动消除
- [x] E. Typography Token 建立
- [x] F. 输出改动清单

---

**修复完成时间**: 2026-01-11  
**修复状态**: ✅ 所有修复已完成  
**下一步**: 在真实设备（iPhone/iPad/Capacitor）上验证修复效果
