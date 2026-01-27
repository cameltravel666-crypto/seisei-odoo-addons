# Nagashiro Theme 安装说明

## 快速安装

### 1. 确保 Odoo 运行中

```bash
cd /Users/taozhang/Projects/server-apps/seisei-project
docker compose ps
```

### 2. 重启 Odoo（如果需要）

```bash
docker compose restart web
```

### 3. 在 Odoo 中安装模块

1. 访问 http://localhost:8069
2. 登录管理员账户
3. 进入 **应用** 菜单
4. 点击右上角 **移除过滤器** 或选择 **应用**
5. 搜索 "Nagashiro Theme"
6. 点击 **安装**

### 4. 清除浏览器缓存

- 按 `Ctrl+Shift+R` (Windows) 或 `Cmd+Shift+R` (Mac) 强制刷新
- 或使用隐私模式访问

## 验证安装

安装成功后，你应该看到：

- ✅ 浏览器标题显示 "Nagashiro ERP"（而不是 "Odoo"）
- ✅ 应用了自定义 CSS 样式
- ✅ Odoo 品牌标识被移除

## 添加自定义 Logo

1. 将你的 Logo 文件复制到：
   ```bash
   cp your-logo.png addons/nagashiro_theme/static/src/img/logo.png
   ```

2. 将你的 Favicon 复制到：
   ```bash
   cp your-favicon.ico addons/nagashiro_theme/static/src/img/favicon.ico
   ```

3. 重启 Odoo：
   ```bash
   docker compose restart web
   ```

4. 清除浏览器缓存

## 故障排查

### 模块未出现在应用列表中

1. 检查模块路径：
   ```bash
   ls -la addons/nagashiro_theme/__manifest__.py
   ```

2. 更新应用列表：
   - 在 Odoo 中：**应用** > **更新应用列表**

3. 检查 Odoo 日志：
   ```bash
   docker compose logs web | grep -i seisei
   ```

### 样式没有应用

1. 清除浏览器缓存（硬刷新：Ctrl+Shift+R）
2. 重启 Odoo
3. 升级模块：
   - **应用** > 搜索 "Nagashiro Theme" > **升级**

