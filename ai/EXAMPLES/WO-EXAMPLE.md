# WO-EXAMPLE: 示例工作单

> Encoding: UTF-8
> 这是一个示例工作单，展示如何填写 WORK_ORDER.template.md

---

## WO-001: 修复 API 响应格式错误

**创建时间**: 2026-01-02  
**状态**: ✅ DONE  
**负责人**: @engineer

---

## Goal（目标）

修复 API 响应格式不一致导致的 `'list' object has no attribute 'get'` 错误，确保所有 API 响应都是 dict 格式。

---

## Scope（范围）

- `services/bridge_client.py` - 添加响应标准化逻辑
- `models/vendor_intake_start_wizard.py` - 添加 defensive check
- `models/vendor_intake_batch.py` - 添加 defensive check

---

## Non-goals（非目标）

- 不修改 Bridge API 服务端代码
- 不进行大规模重构
- 不修改数据库结构

---

## Constraints（约束）

- 用户不手工操作服务器；所有命令由 Cursor 执行
- 最小改动原则，避免大规模重构
- 向后兼容，不破坏现有功能
- 必须通过语法检查和单元测试

---

## Plan（计划）

### 步骤 1: 添加响应标准化逻辑
- [x] 在 `bridge_client.py` 中添加 `_normalize_response()` 方法
- [x] 在 `request()` 方法中调用 normalize

### 步骤 2: 添加 defensive check
- [x] 在 `vendor_intake_start_wizard.py` 中添加 defensive check
- [x] 在 `vendor_intake_batch.py` 中添加 defensive check

### 步骤 3: 验证
- [x] 语法检查
- [x] 单元测试
- [x] 集成测试

---

## Commands (AUTO)（自动执行命令）

```bash
# 语法检查
python3 -m py_compile services/bridge_client.py

# 单元测试
python3 -m pytest tests/test_bridge_client.py -v
```

---

## Gate2

**不需要 Gate2**（仅代码修改，不涉及生产环境变更）

---

## Acceptance Criteria（验收标准）

1. ✅ `bridge_client.request()` 方法强保证返回 dict
2. ✅ 所有响应格式（dict/list/其他）都能正确 normalize
3. ✅ 错误信息包含诊断信息（type/len/preview，脱敏）
4. ✅ 日志出现预期的固定前缀

---

## Evidence（证据）

1. **版本标记**
   - 代码版本: `# Version: 2026-01-02-obs-v3`
   - 模块版本: `vendor_ops_intake_notion 19.0.1.0.2`
   - 文件路径: `/opt/odoo19/extra-addons/vendor_ops_intake_notion/services/bridge_client.py`

2. **命中实例链路**
   - DNS: `opss.seisei.tokyo` -> `54.65.127.141`
   - 容器: `seisei-project-web-1` (Up)
   - 数据库: `opss.seisei.tokyo`
   - Addons 路径: `/mnt/extra-addons`

3. **请求/响应关键字段**（脱敏后）
   - 请求参数: `{"tenant_code": "TEN-000001", "store_code": "S001"}`
   - 响应类型: `dict`
   - 响应键: `['ok', 'batch_id', 'notion_url']`

---

## Rollback（回滚）

### 代码回滚
```bash
git revert <commit-sha>
```

### 验证回滚
```bash
# 检查代码版本
grep "Version:" services/bridge_client.py
```

---

## Changelog（变更日志）

| 日期 | 操作 | 说明 |
|------|------|------|
| 2026-01-02 | Created | 初始创建 |
| 2026-01-02 | Executed | 执行完成 |
| 2026-01-02 | Verified | 验证通过 |

---

*End of WO-EXAMPLE*

