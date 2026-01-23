# Vendor Ops Core - Start Intake 功能交付清单

## 验收标准达成情况

✅ **1. Start Intake 自动调用 Bridge**
- [x] 自动调用 Bridge 创建 intake batch
- [x] Bridge 返回 bridge_batch_id + client_record_url + notion_pack_url
- [x] Odoo 写回所有字段到 batch 记录

✅ **2. UI 显示可点击链接**
- [x] Client Record URL（发给客户）
- [x] Notion Pack URL（内部查看 pack）

✅ **3. Pull from Notion**
- [x] 基于 bridge_batch_id 拉取客户填写内容
- [x] 更新 status 为 'pulled'

✅ **4. 约束满足**
- [x] tenant_code 由 tenant 自动生成（需 tenant 模型支持）
- [x] Start Intake 幂等（SQL UNIQUE + wizard 逻辑）
- [x] 错误可读（Bridge 4xx/5xx 显示 message + traceId）

## 代码修改点清单

### 新增文件（vendor_ops_core 模块）

#### 核心模型
- `models/vendor_ops_tenant.py` - Tenant 模型（简化版）
- `models/vendor_ops_intake_batch.py` - Intake Batch 模型（含 Pull 功能）

#### Wizard
- `wizard/vendor_ops_start_intake_wizard.py` - Start Intake 向导

#### 服务层
- `services/bridge_client.py` - Bridge API 客户端

#### 视图
- `views/vendor_ops_tenant_views.xml` - Tenant 视图（含 Start Intake 按钮）
- `views/vendor_ops_intake_batch_views.xml` - Batch 视图（含 Pull 按钮和链接）
- `views/vendor_ops_start_intake_wizard_views.xml` - Wizard 视图
- `views/menu_views.xml` - 菜单定义

#### 安全与数据
- `security/ir.model.access.csv` - 访问权限
- `data/intake_batch_sequence.xml` - 序列定义（占位）

#### 配置
- `__init__.py` - 模块初始化
- `__manifest__.py` - 模块清单
- `static/description/index.html` - 模块描述

#### 脚本与文档
- `scripts/odoo_start_intake_smoke.sh` - 验收脚本
- `IMPLEMENTATION_SUMMARY.md` - 实现总结
- `DEPLOYMENT_CHECKLIST.md` - 部署检查清单

### Bridge 端（仅测试脚本）

- `vendor-bridge/scripts/test_bridge_intake_batch_api.sh` - Bridge API 契约测试

## 关键实现细节

### 1. 幂等性保证

**双重保证**:
1. **SQL UNIQUE 约束**: `UNIQUE(tenant_id, store_code, effective_month)`
2. **Wizard 逻辑**: 在调用 Bridge 前检查现有 batch

**实现位置**: 
- `models/vendor_ops_intake_batch.py` - `_sql_constraints`
- `wizard/vendor_ops_start_intake_wizard.py` - `action_start_intake()`

### 2. 灵活字段映射

Bridge API 返回字段可能有不同名称，Odoo 端支持多种变体：

```python
batch_id = (
    response.get('bridge_batch_id') or
    response.get('batch_id') or
    response.get('id')
)
client_url = (
    response.get('client_record_url') or
    response.get('client_url')
)
pack_url = (
    response.get('notion_pack_url') or
    response.get('pack_url')
)
```

**实现位置**: `wizard/vendor_ops_start_intake_wizard.py` - `action_start_intake()`

### 3. 错误处理

- Bridge 4xx/5xx: 显示 `message` + `traceId`
- 连接错误: 显示友好错误信息
- 响应格式错误: 显示类型和预览

**实现位置**: `services/bridge_client.py` - `_bridge_request()`

### 4. 日志记录

- 请求参数完整记录
- 响应 JSON 完整记录（用于调试）
- 敏感信息自动脱敏

**实现位置**: `services/bridge_client.py` - `_bridge_request()`

## 部署步骤

### 1. 准备

```bash
# 确保模块在 addons_path
cd /opt/odoo19/extra-addons  # 或你的 addons 目录
# vendor_ops_core 目录应该在这里
```

### 2. 升级模块

```bash
odoo-bin -d <DB_NAME> -u vendor_ops_core --stop-after-init
```

### 3. 配置系统参数

在 Odoo UI: Settings > Technical > Parameters > System Parameters

- `vendor_ops.bridge_base_url`: `http://127.0.0.1:23000` (或你的 Bridge URL)
- `vendor_ops.bridge_timeout_seconds`: `15` (可选)

### 4. 重启服务

```bash
systemctl restart odoo
# 或
docker restart <odoo_container>
```

### 5. 验证

1. **UI 测试**:
   - Vendor Ops > Tenants > 选择 tenant > "Start Intake"
   - 或 Vendor Ops > Intake > Start Intake

2. **验收脚本**:
   ```bash
   ./scripts/odoo_start_intake_smoke.sh \
       http://127.0.0.1:8069 \
       <DB_NAME> \
       admin \
       admin
   ```

## 测试用例

### 用例 1: 首次创建 Batch

1. 打开 Tenant form
2. 点击 "Start Intake"
3. 输入: Store Code = S001, Effective Month = 2026-01
4. 点击 "Start Intake"
5. **预期**:
   - Batch 记录创建
   - `bridge_batch_id` 非空
   - `client_record_url` 非空（可点击）
   - `notion_pack_url` 可能为空（如果未生成 pack）
   - Status = 'collecting'

### 用例 2: 幂等性测试

1. 对同一 tenant + store + month 再次点击 "Start Intake"
2. **预期**:
   - 返回同一个 batch 记录（不创建新记录）
   - `bridge_batch_id` 保持不变

### 用例 3: Pull from Notion

1. 打开已创建的 batch form
2. 点击 "Pull from Notion"
3. **预期**:
   - Status 更新为 'pulled'
   - `note` 字段包含 pull 结果（raw JSON）

### 用例 4: 错误处理

1. 配置错误的 `vendor_ops.bridge_base_url`
2. 点击 "Start Intake"
3. **预期**:
   - 显示友好错误信息（包含连接错误详情）

## 已知限制

1. **Tenant Code 生成**: 当前 `vendor_ops_tenant` 模型是简化版，需要确保 tenant 有自动生成 `code` 的逻辑（参考 `vendor_ops_core_tenant_upgrade_patch`）

2. **Pull 数据存储**: 当前将 raw JSON 存储在 `batch.note`，后续需要实现 review 表映射

3. **Notion Pack URL**: 如果 Bridge 未生成 pack，该字段可能为空（这是正常的，pack 是可选功能）

## 后续工作

- [ ] 实现 review 表映射（将 pull 的数据映射到正式模型）
- [ ] 添加更多 UI 功能（chatter, activity, etc.）
- [ ] 完善错误处理和重试机制
- [ ] 添加批量操作支持

## 回滚

如果需要回滚：

```bash
# 卸载模块
odoo-bin -d <DB_NAME> -u vendor_ops_core --stop-after-init

# 注意: 卸载会删除所有 vendor.ops.intake.batch 记录
```

## 联系与支持

如有问题，请检查：
1. Odoo 日志: `/var/log/odoo/odoo.log` 或容器日志
2. Bridge 日志: Bridge 服务日志
3. 系统参数配置: Settings > Technical > Parameters

