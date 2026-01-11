# G2-001: 示例 Gate2 操作

> Encoding: UTF-8
> 这是一个示例 Gate2 文档

---

## G2-001: 部署模块到生产环境

**创建时间**: 2026-01-02  
**执行时间**: 2026-01-02 10:00  
**状态**: ✅ DONE+VERIFIED  
**负责人**: @engineer

---

## Operation（操作）

部署 `vendor_ops_intake_notion` 模块到 Server 19 (13.159.193.191) 的 Odoo 19 系统。

---

## Risk Assessment（风险评估）

### 风险等级
MEDIUM

### 风险点
1. 模块部署失败可能导致服务不可用
2. 数据库迁移失败可能导致数据不一致

### 影响范围
- 服务/模块: Odoo 19 系统
- 用户影响: 部署期间服务可能短暂不可用
- 数据影响: 数据库迁移可能影响现有数据

### 缓解措施
1. 部署前备份数据库
2. 部署前备份代码
3. 部署后立即验证功能

---

## Impact（影响）

### 预期影响
- 模块成功部署
- 功能正常可用
- 数据完整性保持

### 失败影响
- 服务可能不可用
- 需要回滚到之前版本

### 回滚影响
- 服务短暂不可用（重启期间）
- 数据回滚（如需要）

---

## Rollback Plan（回滚方案）

### 回滚触发条件
- 部署后服务无法启动
- 功能验证失败
- 出现数据错误

### 回滚步骤
1. 恢复代码
   ```bash
   git checkout <previous_commit>
   ```

2. 重启服务
   ```bash
   sudo systemctl restart odoo.service
   ```

3. 验证回滚
   ```bash
   curl http://localhost:8069/web
   ```

---

## Verification Evidence（验证证据）

### 前置验证（操作前）

```bash
# 检查当前版本
psql -d ERP -c "SELECT name, state, latest_version FROM ir_module_module WHERE name = 'vendor_ops_intake_notion';"
# 预期输出: name | state | latest_version
```

### 操作执行

```bash
# 同步代码
rsync -avz --backup --backup-dir=/opt/backup/ vendor_ops_intake_notion/ ubuntu@13.159.193.191:/opt/odoo19/extra-addons/

# 升级模块
ssh ubuntu@13.159.193.191 'sudo -u odoo /usr/bin/odoo -d ERP -u vendor_ops_intake_notion --stop-after-init --config /etc/odoo/odoo.conf'

# 重启服务
ssh ubuntu@13.159.193.191 'sudo systemctl restart odoo.service'
```

### 后置验证（操作后）

```bash
# 检查模块版本
psql -d ERP -c "SELECT name, state, latest_version FROM ir_module_module WHERE name = 'vendor_ops_intake_notion';"
# 实际输出: vendor_ops_intake_notion | installed | 19.0.1.0.2
# 验证结果: ✅ 通过

# 检查服务状态
systemctl status odoo.service
# 验证结果: ✅ 通过
```

### 功能验证

1. ✅ Start Intake Wizard: 功能正常
2. ✅ Pull from Notion: 功能正常

---

## Execution Log（执行日志）

| 时间 | 操作 | 结果 | 备注 |
|------|------|------|------|
| 10:00 | 代码同步 | ✅ | 成功 |
| 10:05 | 模块升级 | ✅ | 成功 |
| 10:10 | 服务重启 | ✅ | 成功 |
| 10:15 | 功能验证 | ✅ | 通过 |

---

## Notes（备注）

- 部署过程中服务短暂不可用（约 5 分钟）
- 所有功能验证通过

---

## SYNC_SNAPSHOT Entry（快照条目）

```markdown
| G2-001 | 部署 vendor_ops_intake_notion 到生产环境 | ✅ DONE+VERIFIED | 模块版本 19.0.1.0.2，功能验证通过 |
```

---

## Approval（审批）

- [x] 技术负责人审批
- [x] 执行前最终确认

---

*End of GATE2-EXAMPLE*

