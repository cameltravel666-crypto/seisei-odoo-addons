# POS 界面 Logo 替换诊断指南

## 问题
POS 界面中的 "odoo" logo 仍然显示，需要替换为 "Nagashiro"。

## 诊断步骤

### 1. 确认模块已升级
- 在 Odoo 界面中：应用 → 搜索 "Nagashiro Theme" → 点击「升级」
- 强制刷新浏览器（Ctrl+F5 或 Cmd+Shift+R）

### 2. 检查资源文件是否加载
1. 打开浏览器开发者工具（F12）
2. 切换到 **Network** 标签
3. 刷新页面
4. 搜索 `nagashiro_theme`
5. 确认 `custom.css` 和 `custom.js` 文件已加载（状态码 200）

### 3. 检查实际的 HTML 结构（最重要）
1. 打开浏览器开发者工具（F12）
2. 切换到 **Elements**（或 **检查器**）标签
3. 使用选择工具（点击左上角的箭头图标）
4. 点击 POS 界面中的 "odoo" logo
5. 查看选中的 HTML 元素，记录：
   - 元素的 HTML 标签（如 `<img>`, `<svg>`, `<div>` 等）
   - 元素的类名（`class` 属性）
   - 元素的 ID（`id` 属性）
   - 父元素的类名和结构
   - 如果是图片，记录 `src` 属性

### 4. 检查 CSS 是否生效
1. 在开发者工具中选中包含 logo 的元素
2. 查看右侧的 **Styles** 面板
3. 搜索 `nagashiro_theme` 相关的 CSS 规则
4. 检查是否有 `display: none` 或其他样式规则

### 5. 手动测试 CSS
在浏览器控制台（Console 标签）中运行以下代码来测试：

```javascript
// 查找所有图片元素
document.querySelectorAll('img').forEach(img => {
    console.log('Image:', {
        src: img.src,
        alt: img.alt,
        className: img.className,
        parent: img.parentElement?.className
    });
});

// 查找包含 'odoo' 文本的元素
const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
);
let node;
while (node = walker.nextNode()) {
    if (node.textContent && node.textContent.toLowerCase().includes('odoo')) {
        console.log('Found "odoo" text:', node.textContent, 'Parent:', node.parentElement);
    }
}

// 手动隐藏可能的 logo
document.querySelectorAll('.navbar-brand img, [class*="brand"] img, [class*="logo"] img').forEach(img => {
    img.style.display = 'none';
    console.log('Hidden image:', img);
});
```

## 可能的解决方案

根据检查结果，可能需要：

1. **如果是图片（`<img>`）**：
   - 需要更精确的 CSS 选择器
   - 可能需要使用 JavaScript 动态替换

2. **如果是 SVG（`<svg>`）**：
   - 需要使用 SVG 特定的选择器
   - 可能需要隐藏 SVG 并使用文本替换

3. **如果是文本**：
   - 需要文本替换的 JavaScript 逻辑
   - 可能需要使用 CSS 的 `::before` 或 `::after`

4. **如果是 CSS 背景图**：
   - 需要使用 CSS 覆盖 `background-image`
   - 可能需要使用 `::before` 或 `::after` 显示文本

## 下一步

请提供以下信息以便进一步诊断：

1. Logo 元素的 HTML 结构（从开发者工具中复制）
2. Logo 元素的类名和 ID
3. 如果是图片，图片的 `src` 属性值
4. 浏览器控制台中是否有任何错误信息

这样我可以提供更精确的 CSS 选择器和解决方案。

