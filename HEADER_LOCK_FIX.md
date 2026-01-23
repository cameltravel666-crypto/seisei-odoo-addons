# Header 锁定修复 - 确保拖动时标题栏不动

## 问题分析

当 `.app-shell` 使用 `position: fixed` 时，其内部的 `[data-app-header]` 如果也使用 `position: fixed`，在 iOS/Capacitor WebView 中可能会相对于 `.app-shell` 定位，而不是相对于 viewport。

## 修复方案

### 1. AppShell 使用相对定位

```css
.app-shell {
  position: relative; /* 不是 fixed！ */
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

**原因**: 使用 `position: relative` 允许子元素的 `position: fixed` 相对于 viewport 定位，而不是相对于父容器。

### 2. Header 强制固定到视口

```css
[data-app-header] {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: auto !important;
  z-index: 9999 !important;
  isolation: isolate !important;
  transform: translateZ(0) !important;
  /* ... */
}
```

**关键点**:
- `bottom: auto !important` - 确保高度由内容决定
- `isolation: isolate !important` - 创建新的堆叠上下文，防止父容器影响
- `transform: translateZ(0) !important` - GPU 加速，确保 fixed 定位正确

### 3. Main 使用 Flex 布局

```css
[data-main-scroll] {
  position: relative;
  flex: 1;
  min-height: 0; /* Critical for flex child to scroll */
  padding-top: calc(var(--app-header-h) + env(safe-area-inset-top));
  overflow-y: auto;
}
```

**原因**: 使用 `flex: 1` 和 `position: relative` 比 `position: absolute` 更稳定，不会影响 Header 的 fixed 定位。

### 4. Body/HTML 禁止滚动

```css
html {
  overflow: hidden !important;
}

body {
  overflow: hidden !important;
  overscroll-behavior: none !important;
}
```

**原因**: 完全禁止根滚动，只有 main 容器滚动。

## 验证方法

在浏览器 Console 执行：

```javascript
// 1. 检查 Header 位置
const header = document.querySelector('[data-app-header]');
if (header) {
  const rect = header.getBoundingClientRect();
  console.log('Header position:', rect.top); // 应该为 0
  
  // 滚动内容
  const main = document.querySelector('[data-main-scroll]');
  if (main) {
    main.scrollTop = 100;
    
    // 再次检查 Header 位置
    const rect2 = header.getBoundingClientRect();
    console.log('Header position after scroll:', rect2.top); // 应该仍然为 0
  }
}

// 2. 检查 Header 的计算样式
const header = document.querySelector('[data-app-header]');
if (header) {
  const cs = getComputedStyle(header);
  console.log({
    position: cs.position, // 应该是 'fixed'
    top: cs.top, // 应该是 '0px'
    isolation: cs.isolation, // 应该是 'isolate'
    transform: cs.transform, // 应该包含 translateZ(0)
  });
}

// 3. 检查祖先是否有 transform
const header = document.querySelector('[data-app-header]');
if (header) {
  let current = header.parentElement;
  const ancestors = [];
  while (current && current !== document.body) {
    const cs = getComputedStyle(current);
    if (cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
      ancestors.push({
        tag: current.tagName,
        className: current.className,
        transform: cs.transform,
      });
    }
    current = current.parentElement;
  }
  console.log('Ancestors with transform:', ancestors); // 应该为空数组
}
```

## 关键修复点

1. ✅ `.app-shell` 从 `position: fixed` 改为 `position: relative`
2. ✅ Header 使用 `isolation: isolate !important` 防止父容器影响
3. ✅ Header 使用 `transform: translateZ(0) !important` 确保 GPU 加速
4. ✅ Main 使用 `flex: 1` 和 `position: relative` 而不是 `absolute`
5. ✅ Body/HTML 使用 `overflow: hidden !important` 禁止根滚动
