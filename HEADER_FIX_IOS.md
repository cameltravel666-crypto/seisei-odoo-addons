# Header 固定问题修复 - iOS/Capacitor WebView

## 问题描述
在 iOS/Capacitor WebView 中，拖动页面时 Header 仍然跟随滚动，没有锁定。

## 根因分析

在 iOS Safari/WebView 中，`position: fixed` 的行为与桌面浏览器不同：

1. **iOS 弹性滚动（Bounce Scroll）**: iOS 的弹性滚动机制可能导致 fixed 元素跟随移动
2. **父容器 overflow**: 即使设置了 `overflow: hidden`，iOS 可能仍然允许某种形式的滚动
3. **Transform 影响**: 任何祖先节点的 transform 都会导致 fixed 失效（但我们已经检查过，没有这个问题）
4. **Touch 事件**: iOS 的 touch 事件处理可能导致 Header 位置变化

## 修复方案

### 1. 强制 body/html 固定（使用 !important）

```css
html {
  height: 100% !important;
  overflow: hidden !important;
  position: fixed !important;
  width: 100% !important;
  overscroll-behavior: none;
}

body {
  height: 100% !important;
  overflow: hidden !important;
  position: fixed !important;
  width: 100% !important;
  touch-action: none;
  overscroll-behavior: none !important;
}
```

### 2. Header 使用更高的 z-index 和隔离

```css
.app-header {
  position: fixed !important;
  z-index: 9999 !important;
  isolation: isolate !important;
  transform: translateZ(0) !important;
  touch-action: none;
}
```

### 3. Main 滚动容器使用 overscroll-behavior

```css
.app-main-scroll {
  overscroll-behavior: contain !important;
  overscroll-behavior-y: contain !important;
  touch-action: pan-y;
  isolation: isolate;
}
```

## 关键点

1. **position: fixed on html/body**: 在 iOS 中，需要将 html/body 设置为 `position: fixed` 来完全禁止滚动
2. **touch-action**: 使用 `touch-action: none` 在 body 上防止触摸滚动，`touch-action: pan-y` 在 main 上允许垂直滚动
3. **overscroll-behavior**: 使用 `overscroll-behavior: contain` 防止滚动溢出影响 Header
4. **isolation**: 使用 `isolation: isolate` 创建新的堆叠上下文

## 验证

在 iOS/Capacitor WebView 中测试：
1. 拖动页面，Header 应该保持固定
2. 快速滚动测试回弹，Header 不应该移动
3. 切换页面，Header 位置应该不变
