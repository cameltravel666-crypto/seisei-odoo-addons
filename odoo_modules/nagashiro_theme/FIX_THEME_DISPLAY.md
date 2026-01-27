# 修复 Nagashiro Theme 显示问题

## 问题描述
如果 theme 显示不正确（CSS/JS 未生效），通常是因为修改资源文件后未升级模块。

## 解决方案

### 方法 1: 在 Odoo 界面中升级模块（推荐）

1. 登录 Odoo（http://localhost:8069）
2. 进入 **应用** 菜单
3. 搜索 "Nagashiro Theme"
4. 点击 **升级** 按钮
5. 等待升级完成
6. 刷新页面（按 `Ctrl+F5` 或 `Cmd+Shift+R` 强制刷新）

### 方法 2: 使用命令行升级

```bash
cd /Users/taozhang/Projects/server-apps/seisei-project

# 升级模块（替换 <database_name> 为实际的数据库名，通常是 seisei）
docker-compose exec web odoo -u nagashiro_theme -d seisei --stop-after-init

# 重启容器
docker-compose restart web
```

### 方法 3: 清除浏览器缓存

1. 按 `Ctrl+Shift+Delete` (Windows/Linux) 或 `Cmd+Shift+Delete` (Mac)
2. 选择"缓存的图像和文件"
3. 点击"清除数据"
4. 刷新页面（按 `Ctrl+F5` 或 `Cmd+Shift+R` 强制刷新）

## 验证修复

升级后，检查以下内容：

1. ✅ 页面标题是否显示为 "Nagashiro ERP" 而不是 "Odoo"
2. ✅ 登录页面是否没有 "Powered by Odoo" 文本
3. ✅ 用户菜单中是否没有 "文档" 和 "支持" 项
4. ✅ 用户菜单中是否没有 "Odoo.com account" 项

## 常见问题

### Q: 升级后仍然显示旧的样式？
A: 清除浏览器缓存并强制刷新（Ctrl+F5 / Cmd+Shift+R）

### Q: 模块升级失败？
A: 检查 Odoo 日志：
```bash
docker-compose logs web --tail 100
```

### Q: JavaScript 错误？
A: 打开浏览器开发者工具（F12），查看 Console 标签页是否有错误信息

## 调试步骤

1. 打开浏览器开发者工具（F12）
2. 查看 **Network** 标签页
3. 刷新页面
4. 搜索 `nagashiro_theme` 相关的文件
5. 确认 CSS 和 JS 文件是否正确加载（状态码应该是 200）

如果文件未加载或返回 404，说明模块升级未成功，需要重新升级模块。

