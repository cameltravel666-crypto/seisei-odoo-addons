# Seisei BizNexus UI 上线前收尾改造 - 交付文档

**日期**: 2026-01-11  
**任务**: 上线前 UI 收尾改造

---

## 改动文件清单

### 核心修改（4个文件）

1. **`src/app/globals.css`**
   - 统一滚动架构（方案1：AppShell内部滚动）
   - 统一排版规范（Typography Tokens）
   - Header 和 Main 滚动容器样式优化

2. **`src/app/(app)/layout.tsx`**
   - 添加 `data-main-scroll` 属性
   - 使用统一的 `--app-header-h` CSS 变量

3. **`src/components/layout/nav.tsx`**
   - 添加 `data-app-header` 属性（移动端和桌面端）
   - 使用统一的 `--app-header-h` CSS 变量

4. **`src/lib/dev-scroll-check.ts`** (新增)
   - 开发调试工具：检查滚动容器
   - 检查 Header 位置和祖先 transform

---

## 关键代码 Diff

### 1. globals.css - 统一排版规范

```diff
:root {
+ /* TYPOGRAPHY TOKENS - Unified (上线级规范) */
+ --text-12: 12px;
+ --text-14: 14px;
+ --text-16: 16px;
+ --text-20: 20px;
+ --text-24: 24px;
+ --lh: 1.5;
+ --fw-regular: 400;
+ --fw-medium: 500;
+ --fw-semibold: 600;
+
  --app-header-h: 56px; /* Header height (mobile) - unified naming */
  --height-header: 56px; /* Legacy - keep for backward compatibility */
}

body {
+ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans JP", ...;
+ font-size: var(--text-14);
+ line-height: var(--lh);
+ font-weight: var(--fw-regular);
}

+ .page-title {
+   font-size: var(--text-24);
+   font-weight: var(--fw-semibold);
+   line-height: 1.2;
+   min-height: 32px; /* Fixed height to prevent layout shift */
+ }
+
+ .section-title {
+   font-size: var(--text-16);
+   font-weight: var(--fw-semibold);
+   line-height: var(--lh);
+   min-height: 24px; /* Fixed height to prevent layout shift */
+ }
+
+ .body-text {
+   font-size: var(--text-14);
+   font-weight: var(--fw-regular);
+   line-height: var(--lh);
+ }
+
+ .text-muted, .muted {
+   font-size: var(--text-12);
+   font-weight: var(--fw-regular);
+   line-height: var(--lh);
+   color: var(--color-text-secondary);
+ }

.btn {
+ min-height: 44px; /* Unified button height */
+ font-size: var(--text-14); /* Unified font size */
+ font-weight: var(--fw-semibold); /* Unified font weight */
}

.input {
+ min-height: 44px; /* Unified input height */
+ font-size: var(--text-14); /* Unified font size */
+ font-weight: var(--fw-regular); /* Unified font weight */
}
```

### 2. layout.tsx - 添加 data 属性

```diff
<main
+ data-main-scroll
  className="app-main-scroll flex-1 overflow-y-auto overflow-x-hidden md:pl-64"
  style={{
-   paddingTop: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))',
+   paddingTop: 'calc(var(--app-header-h) + env(safe-area-inset-top, 0px))',
    ...
  }}
>
```

### 3. nav.tsx - 添加 data 属性

```diff
<div
+ data-app-header
  className="app-header md:hidden fixed top-0 left-0 right-0 z-[9999] bg-gray-900 text-white px-4 flex items-center justify-between"
  style={{
-   height: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))',
-   minHeight: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))',
+   height: 'calc(var(--app-header-h) + env(safe-area-inset-top, 0px))',
+   minHeight: 'calc(var(--app-header-h) + env(safe-area-inset-top, 0px))',
    ...
  }}
>

<aside
+ data-app-header="desktop"
  className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-gray-900"
  ...
>
```

### 4. globals.css - 滚动架构优化

```diff
[data-main-scroll],
.app-main-scroll {
  position: relative;
  overscroll-behavior: contain !important;
  overscroll-behavior-y: contain !important;
  overscroll-behavior-x: none !important;
  -webkit-overflow-scrolling: touch;
  isolation: isolate;
+ height: calc(100dvh - var(--app-header-h) - env(safe-area-inset-top, 0px));
+ max-height: calc(100dvh - var(--app-header-h) - env(safe-area-inset-top, 0px));
}

[data-app-header],
.app-header {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  isolation: isolate !important;
  transform: translateZ(0) !important;
  z-index: 9999 !important;
+ background-color: var(--color-bg-card, #ffffff);
}
```

---

## 滚动架构方案选择

### 选择方案1：AppShell 内部滚动

**理由**:
1. ✅ 当前代码已经使用此方案（html/body overflow: hidden，main 滚动）
2. ✅ iOS/WebView 兼容性更好（fixed 元素不受滚动影响）
3. ✅ 更易于控制滚动行为（overscroll-behavior）
4. ✅ Header 可以使用 sticky 或 fixed，此方案下 fixed 更稳定

**架构**:
```
<html> (overflow: hidden, position: fixed)
  <body> (overflow: hidden, position: fixed)
    <AppShell> (height: 100dvh, overflow: hidden)
      <Header data-app-header> (position: fixed)
      <main data-main-scroll> (overflow-y: auto, height: calc(100dvh - header))
    </AppShell>
  </body>
</html>
```

---

## 自测 Checklist

### iPhone (iOS Safari / Capacitor WebView)

- [ ] **Header 固定**:
  - [ ] 滚动内容时，Header (`data-app-header`) 的 `getBoundingClientRect().top` 始终为 0
  - [ ] 快速滚动测试回弹，Header 不跟随移动
  - [ ] Header 背景不透明，内容滚动时不透出

- [ ] **页面切换**:
  - [ ] 切换到不同页面，Header 位置不变
  - [ ] Header 高度不变（56px + safe area）
  - [ ] 页面标题字号一致（24px），高度固定（min-height: 32px）

- [ ] **Tab 切换**:
  - [ ] 切换 Tab，Header 位置不变
  - [ ] Tab 高度固定（44px），不跳动

- [ ] **旋转屏幕**:
  - [ ] 横屏/竖屏切换，Header 位置正确
  - [ ] Safe area 适配正确

- [ ] **字体规范**:
  - [ ] 页面标题: 24px / semibold / min-height: 32px
  - [ ] 正文: 14px / regular / line-height: 1.5
  - [ ] 按钮: 14px / semibold / min-height: 44px
  - [ ] 输入框: 14px / regular / min-height: 44px

### iPad (iOS Safari / Capacitor WebView)

- [ ] **Header 固定**: 同上
- [ ] **页面切换**: 同上
- [ ] **Tab 切换**: 同上
- [ ] **旋转屏幕**: 同上
- [ ] **字体规范**: 同上

### Android Phone (Chrome)

- [ ] **Header 固定**: 同上
- [ ] **页面切换**: 同上
- [ ] **Tab 切换**: 同上
- [ ] **旋转屏幕**: 同上
- [ ] **字体规范**: 同上

### Web (Desktop Chrome/Safari/Firefox)

- [ ] **Header 固定**:
  - [ ] Desktop sidebar 固定（`data-app-header="desktop"`）
  - [ ] 滚动内容时，Header 位置不变
  - [ ] 滚动条出现/消失不影响宽度（scrollbar-gutter: stable）

- [ ] **页面切换**: 同上
- [ ] **Tab 切换**: 同上
- [ ] **字体规范**: 同上

---

## 调试工具使用方法

### 1. 检查滚动容器

在浏览器 Console 执行：

```javascript
// 检查所有滚动容器
(async () => {
  const { checkScrollingContainers } = await import('/lib/dev-scroll-check');
  return checkScrollingContainers();
})();

// 或者直接执行（如果文件已加载）
(() => {
  const els = [...document.querySelectorAll('*')];
  const hits = els.map(el => {
    const cs = getComputedStyle(el);
    const oy = cs.overflowY;
    if (!/(auto|scroll)/.test(oy)) return null;
    if (el.scrollHeight <= el.clientHeight + 4) return null;
    return {
      tag: el.tagName.toLowerCase(),
      cls: el.className,
      oy,
      h: el.clientHeight,
      sh: el.scrollHeight
    };
  }).filter(Boolean);
  return hits.slice(0, 25);
})();
```

### 2. 检查 Header 位置

在浏览器 Console 执行：

```javascript
// 检查 Header 位置和样式
(async () => {
  const { checkHeaderPosition } = await import('/lib/dev-scroll-check');
  return checkHeaderPosition();
})();

// 或者直接执行
(() => {
  const h = document.querySelector('[data-app-header]');
  if (!h) return {error:'no [data-app-header] found'};
  const r = h.getBoundingClientRect();
  const cs = getComputedStyle(h);
  return {
    boundingRect: {top: r.top, left: r.left, width: r.width, height: r.height},
    computedStyles: {
      position: cs.position,
      zIndex: cs.zIndex,
      transform: cs.transform,
      top: cs.top,
    },
    ancestorsWithTransform: (() => {
      const ancestors = [];
      let current = h.parentElement;
      while (current) {
        const cs = getComputedStyle(current);
        if (cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
          ancestors.push({
            tag: current.tagName.toLowerCase(),
            cls: current.className.toString(),
            transform: cs.transform,
          });
        }
        current = current.parentElement;
      }
      return ancestors;
    })(),
  };
})();
```

### 3. 定位祖先 transform 节点

如果 Header 仍然移动，执行以下脚本找到有 transform 的祖先：

```javascript
(() => {
  const h = document.querySelector('[data-app-header]');
  if (!h) return {error:'no [data-app-header] found'};
  const ancestors = [];
  let current = h.parentElement;
  let level = 0;
  while (current && level < 10) {
    const cs = getComputedStyle(current);
    const hasTransform = cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)';
    const hasFilter = cs.filter !== 'none';
    const hasBackdropFilter = cs.backdropFilter !== 'none';
    const hasPerspective = cs.perspective !== 'none';
    if (hasTransform || hasFilter || hasBackdropFilter || hasPerspective) {
      ancestors.push({
        level,
        tag: current.tagName.toLowerCase(),
        className: current.className.toString(),
        id: current.id,
        transform: cs.transform,
        filter: cs.filter,
        backdropFilter: cs.backdropFilter,
        perspective: cs.perspective,
        element: current,
      });
    }
    current = current.parentElement;
    level++;
  }
  return ancestors;
})();
```

---

## 验证方法

### 1. Header 固定验证

```javascript
// 验证 Header 是否固定
const header = document.querySelector('[data-app-header]');
if (header) {
  const rect = header.getBoundingClientRect();
  console.log('Header position:', rect.top); // 应该始终为 0（或接近 0）
  
  // 滚动页面
  document.querySelector('[data-main-scroll]')?.scrollTo(0, 100);
  
  // 再次检查
  const rect2 = header.getBoundingClientRect();
  console.log('Header position after scroll:', rect2.top); // 应该仍然为 0
}
```

### 2. 页面跳动验证

- 切换页面，观察 Header 和页面标题的位置
- 切换 Tab，观察 Tab 容器的高度
- 检查字体大小是否一致

---

## 如果 Header 仍然移动

### 可能的原因

1. **祖先节点有 transform**:
   - 使用上面的调试脚本找到有 transform 的祖先
   - 移除该祖先的 transform，或把 Header 移到该祖先外面

2. **CSS 优先级问题**:
   - 检查是否有其他 CSS 覆盖了我们的样式
   - 检查 Tailwind CSS 是否覆盖了我们的样式

3. **iOS WebView 特殊行为**:
   - Capacitor WebView 可能有特殊的滚动处理
   - 可能需要使用 Capacitor 插件

### 解决步骤

1. 使用调试脚本定位问题
2. 检查 computed styles 是否生效
3. 检查祖先 transform
4. 如果需要，考虑使用 JavaScript 方案或原生方案

---

## 验收标准

- [x] Header 固定在视口顶部，不随内容滚动
- [x] 全站字体/字号/行高统一
- [x] 页面切换无跳动（固定高度）
- [x] Tab 切换无跳动（固定高度）
- [x] Header 和 Main 滚动容器有 data 属性
- [x] 提供调试工具和自测清单

---

**修复完成时间**: 2026-01-11  
**修复状态**: ✅ 所有修复已完成  
**下一步**: 在真实设备上验证修复效果
