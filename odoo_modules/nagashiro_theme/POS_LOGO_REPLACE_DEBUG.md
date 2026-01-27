# POS Logo 替换问题诊断

## 问题现象
POS 界面中的 logo 没有被替换，仍然显示原始的 Odoo logo。

## 诊断步骤

### 1. 检查模块是否已升级（最重要！）

**必须步骤：**
- 在 Odoo 界面：应用 → 搜索 "Nagashiro Theme"
- 点击「升级」按钮
- 等待升级完成

**为什么重要：**
- 修改 JavaScript/CSS 文件后，必须升级模块才能让 Odoo 重新加载新的资源文件
- 如果不升级，浏览器会继续使用旧的缓存文件

### 2. 检查 JavaScript 文件是否正确加载

在浏览器开发者工具（F12）中：

1. 切换到 **Network** 标签
2. 刷新页面（Ctrl+F5 强制刷新）
3. 搜索 `nagashiro_theme` 或 `custom.js`
4. 确认 `custom.js` 文件已加载（状态码应该是 200）

**如果没有找到 custom.js：**
- 说明模块未升级，或 assets 配置有问题
- 需要升级模块

### 3. 检查 JavaScript 代码是否执行

在浏览器控制台（Console 标签）中运行：

```javascript
// 检查 logo 元素
const logo = document.querySelector('img.pos-logo');
console.log('Logo element:', logo);
console.log('Current src:', logo ? logo.src : 'Not found');

// 检查是否有替换日志
// 应该能看到 "Nagashiro logo: Replaced POS logo src to..." 的日志
```

**如果控制台中有 "Nagashiro logo: Replaced POS logo src to..." 的日志：**
- 说明 JavaScript 代码已执行
- 但图片路径可能不正确，需要检查图片文件路径

**如果没有日志：**
- 说明 JavaScript 文件没有加载，或代码没有执行
- 需要确认模块已升级

### 4. 手动测试替换

在浏览器控制台中运行：

```javascript
// 手动替换测试
const logo = document.querySelector('img.pos-logo');
if (logo) {
    const newSrc = '/nagashiro_theme/static/src/img/logo.png';
    logo.src = newSrc;
    logo.setAttribute('src', newSrc);
    console.log('Manual replacement:', logo.src);
}
```

**如果手动替换成功（能看到 Nagashiro logo）：**
- 说明图片文件路径正确
- 问题在于 JavaScript 代码的自动执行
- 可能需要检查执行时机

**如果手动替换后图片显示为破损图标：**
- 说明图片路径不正确
- 需要检查图片文件是否存在
- 可能需要使用不同的路径格式

### 5. 检查图片文件是否存在

在浏览器中直接访问图片 URL：
```
http://localhost:8069/nagashiro_theme/static/src/img/logo.png
```

**如果能看到图片：**
- 说明路径正确，文件存在
- 问题在于 JavaScript 替换逻辑

**如果显示 404 或无法访问：**
- 说明路径不正确，或文件不存在
- 可能需要使用不同的路径格式
- 或者需要重启 Odoo 服务

## 常见问题

### Q: 模块已升级，但 logo 仍未替换？

**A:** 检查以下几点：
1. 强制刷新浏览器缓存（Ctrl+Shift+Delete 清除缓存，然后 Ctrl+F5）
2. 检查浏览器控制台是否有 JavaScript 错误
3. 检查 Network 标签中 custom.js 是否已加载
4. 在控制台手动运行替换代码测试

### Q: 控制台显示 "Nagashiro logo: Replaced..." 但图片仍是 Odoo logo？

**A:** 可能的原因：
1. 图片路径不正确（检查图片 URL 是否能直接访问）
2. 图片文件格式或大小问题
3. 浏览器缓存了旧的图片

**解决方案：**
- 直接访问图片 URL 确认路径
- 清除浏览器缓存
- 检查图片文件是否正确

### Q: JavaScript 文件没有加载？

**A:** 检查：
1. `__manifest__.py` 中的 assets 配置是否正确
2. 模块是否已升级
3. Odoo 日志中是否有错误信息

## 快速修复

如果所有步骤都检查过了仍然无效，可以尝试在浏览器控制台中直接运行：

```javascript
// 强制替换（在控制台中运行）
(function() {
    const logo = document.querySelector('img.pos-logo');
    if (logo) {
        const newSrc = '/nagashiro_theme/static/src/img/logo.png';
        logo.setAttribute('src', newSrc);
        logo.src = newSrc;
        console.log('Force replaced to:', newSrc);
    } else {
        console.log('Logo element not found');
    }
})();
```

如果这样能成功，说明问题在于自动执行的时机或逻辑，需要进一步调整代码。

