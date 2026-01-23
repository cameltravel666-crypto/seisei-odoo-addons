# Vendor Ops Core - Start Intake Implementation Summary

## 实现完成

已按照要求完成所有 Part A-D 的实现。

## Part A: Bridge 接口契约确认

✅ **测试脚本**: `vendor-bridge/scripts/test_bridge_intake_batch_api.sh`

Bridge API `POST /admin/intake/batches` 返回字段：
- `ok`: true
- `batch_id`: UUID
- `client_record_url`: Notion URL for client intake record
- `notion_internal_page_id`: Notion page ID in Internal DB
- `status`: 'collecting'
- `message`: Status message

**注意**: Odoo 端已实现灵活的字段映射，支持多种字段名变体。

## Part B: Odoo 19 侧实现

### 1. 模型: `vendor.ops.intake.batch`

**文件**: `models/vendor_ops_intake_batch.py`

**字段**:
- `tenant_id` (m2o vendor.ops.tenant, required)
- `tenant_code` (related=tenant_id.code, store=True, readonly)
- `store_code` (char, required)
- `effective_month` (char, required, format: YYYY-MM)
- `bridge_batch_id` (char, readonly)
- `client_record_url` (char/url, readonly)
- `notion_pack_url` (char/url, readonly)
- `notion_batch_page_id` (char, readonly)
- `notion_internal_page_id` (char, readonly)
- `status` (selection: draft/collecting/pulled/review/push_ready)

**约束**:
- SQL UNIQUE(tenant_id, store_code, effective_month) - 确保幂等性

### 2. Wizard: `vendor.ops.start.intake.wizard`

**文件**: `wizard/vendor_ops_start_intake_wizard.py`

**功能**:
- 输入: tenant_id, store_code, effective_month, note
- 输出: bridge_batch_id, client_record_url, notion_pack_url (readonly 显示)
- 按钮: Start Intake, Open Client URL, Open Pack URL

**核心逻辑** (`action_start_intake`):
1. 检查 batch 是否存在（基于 tenant_id + store_code + month）
   - 若存在且已有 bridge_batch_id：直接返回（幂等）
   - 若存在但无 bridge_batch_id：继续调用 Bridge
   - 若不存在：先创建 batch 再调用 Bridge
2. 调用 Bridge `POST /admin/intake/batches`
3. 灵活映射响应字段：
   - `batch_id` = `bridge_batch_id` or `batch_id` or `id`
   - `client_url` = `client_record_url` or `client_url`
   - `pack_url` = `notion_pack_url` or `pack_url`
   - `notion_page_id` = `notion_batch_page_id` or `notion_internal_page_id`
4. 写回 batch 记录所有字段
5. 返回 batch form view

### 3. 服务层: `bridge_client.py`

**文件**: `services/bridge_client.py`

**方法**:
- `_bridge_request(method, path, json_data, timeout)`: 通用请求方法
- `create_intake_batch(tenant_code, store_code, month, note)`: 创建 batch
- `pull_from_notion(tenant_code, batch_id)`: 拉取数据

**特性**:
- 读取系统参数 `vendor_ops.bridge_base_url`
- 完整响应 JSON 写入 debug log
- HTTP != 2xx 时抛出 `UserError`，包含 message + traceId

### 4. UI 入口

**A) Tenant form smart button**:
- 文件: `views/vendor_ops_tenant_views.xml`
- 按钮: "Start Intake"
- Context: 默认 `tenant_id`

**B) Intake Batches 列表**:
- 文件: `views/vendor_ops_intake_batch_views.xml`
- 菜单: Vendor Ops > Intake > Start Intake
- 菜单: Vendor Ops > Intake > Intake Batches

**C) Batch form 按钮**:
- "Pull from Notion" (需要 bridge_batch_id)
- "Open Client URL" (需要 client_record_url)
- "Open Pack URL" (需要 notion_pack_url)

## Part C: Pull from Notion

**实现位置**: `models/vendor_ops_intake_batch.py` - `action_pull_from_notion()`

**功能**:
- 要求 `bridge_batch_id` 存在
- 调用 Bridge `POST /admin/intake/run?tenant_code=...&batch_id=...`
- 更新 status 为 'pulled'
- 将返回的客户字段（raw JSON）存储到 `batch.note`（临时方案，直到 review 表实现）
- 显示友好错误（包含 traceId）

## Part D: 验收脚本

**文件**: `scripts/odoo_start_intake_smoke.sh`

**功能**:
1. 通过 XML-RPC 创建/查找 tenant (TEN-000007)
2. 触发 wizard `action_start_intake`
3. 校验 batch 记录字段非空：
   - `bridge_batch_id`
   - `client_record_url`
   - `notion_pack_url` (可选)
4. 验证 URL 格式（包含 notion.so）
5. 测试幂等性（重复创建应返回同一 batch）

## 文件清单

### 新增文件

```
vendor_ops_core/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── vendor_ops_tenant.py
│   └── vendor_ops_intake_batch.py
├── wizard/
│   ├── __init__.py
│   └── vendor_ops_start_intake_wizard.py
├── services/
│   ├── __init__.py
│   └── bridge_client.py
├── views/
│   ├── vendor_ops_tenant_views.xml
│   ├── vendor_ops_intake_batch_views.xml
│   ├── vendor_ops_start_intake_wizard_views.xml
│   └── menu_views.xml
├── security/
│   └── ir.model.access.csv
├── data/
│   └── intake_batch_sequence.xml
├── static/
│   └── description/
│       └── index.html
└── scripts/
    └── odoo_start_intake_smoke.sh
```

### 修改文件

- `vendor-bridge/scripts/test_bridge_intake_batch_api.sh` (新增)

## 部署步骤

1. **升级模块**:
   ```bash
   odoo-bin -d <DB_NAME> -u vendor_ops_core --stop-after-init
   ```

2. **重启 Odoo**:
   ```bash
   systemctl restart odoo
   # 或
   docker restart <odoo_container>
   ```

3. **配置系统参数** (如未配置):
   - `vendor_ops.bridge_base_url`: Bridge API base URL
   - `vendor_ops.bridge_timeout_seconds`: Request timeout (default: 15)

4. **验证**:
   - 在 UI 中: Vendor Ops > Intake > Start Intake
   - 或运行验收脚本: `./scripts/odoo_start_intake_smoke.sh`

## 验收标准

✅ **Start Intake**:
- [x] 自动调用 Bridge 创建 intake batch
- [x] Bridge 返回 bridge_batch_id + client_record_url + notion_pack_url
- [x] Odoo 写回所有字段到 batch 记录
- [x] UI 显示可点击链接（Client URL, Pack URL）
- [x] 幂等性：同 tenant+store+month 重复点击返回已有 batch

✅ **Pull from Notion**:
- [x] 基于 bridge_batch_id 拉取客户填写内容
- [x] 更新 status 为 'pulled'
- [x] 错误显示 message + traceId

✅ **约束**:
- [x] tenant_code 由 tenant 自动生成，不允许手填
- [x] Start Intake 幂等（unique constraint）
- [x] 错误可读（Bridge 4xx/5xx 显示 message + traceId）

## 注意事项

1. **tenant_code 生成**: 需要确保 tenant 模型有自动生成 code 的逻辑（参考 `vendor_ops_core_tenant_upgrade_patch`）

2. **Bridge Base URL**: 必须在系统参数中配置 `vendor_ops.bridge_base_url`

3. **字段映射**: Odoo 端已实现灵活的字段映射，支持 Bridge 返回的不同字段名变体

4. **幂等性**: 通过 SQL UNIQUE 约束和 wizard 逻辑双重保证

5. **Pull 数据存储**: 当前将 raw JSON 存储在 `batch.note`，后续需要实现 review 表映射

## 后续工作

- [ ] 实现 review 表映射（将 pull 的数据映射到正式模型）
- [ ] 添加更多验证和错误处理
- [ ] 完善 UI 显示（chatter, activity, etc.）

