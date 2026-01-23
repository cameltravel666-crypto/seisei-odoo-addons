# Header 固定问题调试指南

## 当前状态

如果 Header 在 iOS/Capacitor 中仍然跟随滚动，请检查：

### 1. 浏览器开发者工具检查

在 iOS Safari 或 Chrome DevTools 中：
1. 检查 html/body 的 computed styles：
   - `position: fixed`
   - `overflow: hidden`
   - `height: 100%`

2. 检查 .app-header 的 computed styles：
   - `position: fixed`
   - `z-index: 9999`
   - `transform: translateZ(0)`

3. 检查 .app-main-scroll 的 computed styles：
   - `overflow-y: auto`
   - `overscroll-behavior: contain`

### 2. 可能的问题

1. **CSS 优先级问题**: 可能有其他 CSS 覆盖了我们的样式
   - 检查是否有 `!important` 冲突
   - 检查 Tailwind CSS 是否覆盖了我们的样式

2. **iOS WebView 特殊行为**: 
   - Capacitor WebView 可能有特殊的滚动处理
   - 可能需要使用 Capacitor 插件来处理滚动

3. **视觉错觉**:
   - 如果内容区域在滚动，可能看起来 Header 在移动
   - 但实际上 Header 是固定的，只是视觉上的错觉

### 3. 替代方案

如果 CSS 方案不工作，可以考虑：

1. **使用 JavaScript 监听滚动并强制 Header 位置**
2. **使用 Capacitor 的 StatusBar 插件**
3. **使用原生 Header（Native Header）**

### 4. 测试方法

1. 在 iOS Safari 中打开应用
2. 使用开发者工具检查元素
3. 拖动页面，观察 Header 的位置
4. 检查 computed styles 是否生效
