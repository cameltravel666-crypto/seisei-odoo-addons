# Vendor Ops Core - Deployment Checklist

## 前置条件

- [ ] Odoo 19 已安装并运行
- [ ] Bridge API 服务已部署并可访问
- [ ] 系统参数已配置：
  - `vendor_ops.bridge_base_url`: Bridge API base URL (e.g., `http://127.0.0.1:23000`)
  - `vendor_ops.bridge_timeout_seconds`: Request timeout (default: 15)

## 部署步骤

### 1. 复制模块到 Odoo addons 目录

```bash
# 在 Odoo 服务器上
cd /path/to/odoo/addons
# 或
cd /opt/odoo19/extra-addons
```

确保 `vendor_ops_core` 目录在 addons_path 中。

### 2. 升级模块

```bash
# 方式 1: 使用 odoo-bin
odoo-bin -d <DB_NAME> -u vendor_ops_core --stop-after-init

# 方式 2: 通过 UI
# Apps > Update Apps List > Search "Vendor Ops Core" > Upgrade
```

### 3. 重启 Odoo 服务

```bash
# systemd
systemctl restart odoo

# Docker
docker restart <odoo_container>
```

### 4. 验证模块安装

- [ ] 在 Odoo UI 中: Apps > 搜索 "Vendor Ops Core" > 确认状态为 "Installed"
- [ ] 检查菜单: Vendor Ops > Tenants, Vendor Ops > Intake > Start Intake

### 5. 配置系统参数

在 Odoo UI 中: Settings > Technical > Parameters > System Parameters

- [ ] `vendor_ops.bridge_base_url`: Bridge API URL
- [ ] `vendor_ops.bridge_timeout_seconds`: 15 (可选)

### 6. 测试 Start Intake

1. 创建或选择一个 Tenant (确保有 `code` 字段)
2. 打开 Tenant form > 点击 "Start Intake" 按钮
3. 填写:
   - Store Code: S001
   - Effective Month: 2026-01
4. 点击 "Start Intake"
5. 验证:
   - [ ] Batch 记录已创建
   - [ ] `bridge_batch_id` 已填充
   - [ ] `client_record_url` 已填充（可点击）
   - [ ] `notion_pack_url` 已填充（如有，可点击）
   - [ ] Status 为 'collecting'

### 7. 测试幂等性

1. 对同一 tenant + store + month 再次点击 "Start Intake"
2. 验证:
   - [ ] 返回同一个 batch 记录（不创建新记录）
   - [ ] `bridge_batch_id` 保持不变

### 8. 测试 Pull from Notion

1. 打开已创建的 batch form
2. 点击 "Pull from Notion" 按钮
3. 验证:
   - [ ] Status 更新为 'pulled'
   - [ ] `note` 字段包含 pull 结果（raw JSON）

### 9. 运行验收脚本（可选）

```bash
cd /path/to/vendor_ops_core
./scripts/odoo_start_intake_smoke.sh \
    http://127.0.0.1:8069 \
    <DB_NAME> \
    admin \
    admin
```

## 故障排查

### 问题: 模块无法安装

- 检查 Python 语法: `python3 -m py_compile models/*.py wizard/*.py services/*.py`
- 检查 XML 语法: 在 Odoo UI 中查看 Technical > User Interface > Views
- 检查依赖: 确保 `base`, `mail` 模块已安装

### 问题: "Bridge base URL not configured"

- 检查系统参数: Settings > Technical > Parameters > System Parameters
- 确保 `vendor_ops.bridge_base_url` 已设置

### 问题: "Cannot connect to Bridge API"

- 检查 Bridge 服务是否运行: `curl http://127.0.0.1:23000/health`
- 检查网络连通性
- 检查防火墙规则

### 问题: "Tenant code is required"

- 确保 tenant 记录有 `code` 字段
- 如果 tenant 模型没有自动生成 code，需要先实现该功能（参考 `vendor_ops_core_tenant_upgrade_patch`）

### 问题: 幂等性不工作

- 检查数据库约束: `\d vendor_ops_intake_batch` (PostgreSQL)
- 确认 SQL UNIQUE 约束已创建
- 检查 wizard 逻辑是否正确检查现有 batch

## 回滚

如果需要回滚：

```bash
# 卸载模块
odoo-bin -d <DB_NAME> -u vendor_ops_core --stop-after-init

# 或通过 UI: Apps > Uninstall
```

注意: 卸载会删除所有 `vendor.ops.intake.batch` 记录。

