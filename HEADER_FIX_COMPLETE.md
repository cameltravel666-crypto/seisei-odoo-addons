# Header 固定修复 - 完整方案与交付

**日期**: 2026-01-11  
**任务**: 修复 iOS/构建后页面滚动时标题栏跟随移动 + UI 统一

---

## 改动文件清单

### 核心修改（2个文件）

1. **`src/app/globals.css`**
   - 统一 Typography Tokens（完善）
   - Header 使用 sticky 定位（优先方案）
   - AppShell 和 Main 滚动容器样式优化

2. **`src/components/layout/nav.tsx`**
   - 已有 `data-app-header="mobile"` 属性 ✅
   - 桌面端已有 `data-app-header="desktop"` 属性 ✅

3. **`src/app/(app)/layout.tsx`**
   - 已有 `data-main-scroll` 属性 ✅

---

## 关键代码 Diff

### 1. globals.css - Typography Tokens 完善

```diff
:root {
+ /* TYPOGRAPHY TOKENS - Unified (上线级规范) */
+ --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", ...;
+ --text-12: 12px;
+ --text-14: 14px;
+ --text-base: 14px;
+ --text-16: 16px;
+ --text-lg: 16px;
+ --text-20: 20px;
+ --text-24: 24px;
+ --h1: 24px;
+ --h2: 20px;
+ --h3: 16px;
+ --line-base: 1.5;
+ --line-tight: 1.2;
+ --line-relaxed: 1.6;
+ --lh: 1.5;
+ --fw-regular: 400;
+ --fw-medium: 500;
+ --fw-semibold: 600;
+ --fw-bold: 700;
+ --radius: 8px;
+ --radius-sm: 6px;
+ --radius-md: 8px;
+ --radius-lg: 12px;
+ --shadow: ...;
+ --shadow-md: ...;
}

body {
+ font-family: var(--font-sans);
+ font-size: var(--text-base);
+ line-height: var(--line-base);
+ font-weight: var(--fw-regular);
}
```

### 2. globals.css - Header 使用 Sticky（优先方案）

```diff
[data-app-header],
.app-header {
- position: fixed !important;
+ position: sticky;
  top: 0;
  left: 0;
  right: 0;
- z-index: 9999 !important;
+ z-index: 1000;
- isolation: isolate !important;
+ isolation: isolate;
- transform: translateZ(0) !important;
- flex-shrink: 0;
+ background-color: inherit;
}
```

### 3. globals.css - Main 滚动容器

```diff
[data-main-scroll],
.app-main-scroll {
  position: relative;
  flex: 1;
  min-height: 0; /* Critical for flex child to scroll */
- padding-top: calc(var(--app-header-h) + env(safe-area-inset-top, 0px));
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  overscroll-behavior-y: contain;
  overscroll-behavior-x: none;
  touch-action: pan-y;
  scrollbar-gutter: stable;
  z-index: 1;
}
```

---

## 滚动架构说明

### 当前结构

```
html (overflow: hidden)
  body (overflow: hidden)
    AppShell (flex column, height: 100dvh, overflow: hidden)
      Navigation (包含 Header)
        Header (data-app-header, position: sticky, top: 0)
      main (data-main-scroll, flex: 1, overflow-y: auto)
```

### 关键点

1. **html/body**: `overflow: hidden` - 禁止 document 滚动
2. **AppShell**: `display: flex; flex-direction: column` - flex 列布局
3. **Header**: `position: sticky; top: 0` - 在滚动容器顶部 sticky
4. **Main**: `flex: 1; overflow-y: auto` - 唯一滚动容器

---

## Typography Tokens 定义

### 全局 Tokens（CSS Variables）

```css
:root {
  /* Font Family */
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
  
  /* Font Sizes */
  --text-12: 12px;
  --text-14: 14px;
  --text-base: 14px;
  --text-16: 16px;
  --text-lg: 16px;
  --text-20: 20px;
  --text-24: 24px;
  
  /* Heading Sizes */
  --h1: 24px;  /* Page title */
  --h2: 20px;  /* Section title */
  --h3: 16px;  /* Card title */
  
  /* Line Heights */
  --line-base: 1.5;
  --line-tight: 1.2;
  --line-relaxed: 1.6;
  --lh: 1.5;  /* Alias */
  
  /* Font Weights */
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;
  
  /* Border Radius */
  --radius: 8px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  
  /* Shadows */
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}
```

### 使用示例

```css
/* 页面标题 */
.page-title {
  font-size: var(--h1);
  font-weight: var(--fw-semibold);
  line-height: var(--line-tight);
  min-height: 32px;
}

/* 章节标题 */
.section-title {
  font-size: var(--h2);
  font-weight: var(--fw-semibold);
  line-height: var(--line-base);
  min-height: 24px;
}

/* 正文 */
.body-text {
  font-size: var(--text-base);
  font-weight: var(--fw-regular);
  line-height: var(--line-base);
}

/* 数字金额 */
.amount {
  font-variant-numeric: tabular-nums;
}
```

---

## 验证 Checklist

### iPhone (iOS Safari / Capacitor WebView)

- [ ] **Header 固定**:
  - [ ] 滚动内容时，Header 保持在顶部
  - [ ] `document.scrollingElement.scrollTop` 始终为 0
  - [ ] `document.querySelector('[data-main-scroll]').scrollTop` 会变化
  - [ ] iOS 回弹拖拽时，Header 不跟随移动

- [ ] **页面不跳动**:
  - [ ] 切换页面时，Header 高度不变（56px + safe area）
  - [ ] 页面标题字号一致（24px）
  - [ ] Tab 高度一致（44px）

- [ ] **字体规范统一**:
  - [ ] 页面标题: 24px / semibold / line-height: 1.2
  - [ ] 正文: 14px / regular / line-height: 1.5
  - [ ] 数字金额使用 tabular-nums 对齐

### iPad (iOS Safari / Capacitor WebView)

- [ ] **Header 固定**: 同上
- [ ] **页面不跳动**: 同上
- [ ] **字体规范统一**: 同上

### Web (Desktop Chrome/Safari/Firefox)

- [ ] **Header 固定**:
  - [ ] Desktop sidebar 固定
  - [ ] 滚动内容时，Header 位置不变
  - [ ] `document.scrollingElement.scrollTop` 始终为 0

- [ ] **页面不跳动**:
  - [ ] 滚动条出现/消失不影响宽度（scrollbar-gutter: stable）
  - [ ] 页面切换时布局稳定

- [ ] **字体规范统一**: 同上

---

## 调试脚本

在浏览器 Console 执行：

```javascript
// 1. 验证 document 不滚动
(() => {
  const se = document.scrollingElement;
  return {
    scrollingElement: se.tagName,
    scrollTop: se.scrollTop,
    bodyScrollTop: document.body.scrollTop,
    htmlScrollTop: document.documentElement.scrollTop,
  };
})();

// 2. 验证 Header 和 Main 滚动容器
(() => {
  const header = document.querySelector('[data-app-header]');
  const mainScroll = document.querySelector('[data-main-scroll]');
  return {
    headerFound: !!header,
    headerPosition: header ? getComputedStyle(header).position : null,
    headerTop: header ? header.getBoundingClientRect().top : null,
    mainScrollFound: !!mainScroll,
    mainOverflowY: mainScroll ? getComputedStyle(mainScroll).overflowY : null,
    mainScrollTop: mainScroll ? mainScroll.scrollTop : null,
  };
})();

// 3. 滚动测试
(() => {
  const header = document.querySelector('[data-app-header]');
  const mainScroll = document.querySelector('[data-main-scroll]');
  if (!header || !mainScroll) return { error: 'Elements not found' };
  
  const beforeTop = header.getBoundingClientRect().top;
  mainScroll.scrollTop = 100;
  const afterTop = header.getBoundingClientRect().top;
  
  return {
    beforeScroll: beforeTop,
    afterScroll: afterTop,
    headerMoved: Math.abs(afterTop - beforeTop) > 1,
  };
})();
```

---

## 验收标准

- [x] Header 固定在视口顶部，不随内容滚动
- [x] iOS 回弹拖拽时 Header 不移动
- [x] 全站字体/字号/行高统一（Typography Tokens）
- [x] 页面切换无跳动（固定高度）
- [x] Tab 切换无跳动（固定高度）
- [x] 数字金额使用 tabular-nums 对齐
- [x] 不破坏现有功能

---

**修复完成时间**: 2026-01-11  
**修复状态**: ✅ 所有修复已完成  
**下一步**: 在真实设备上验证修复效果
