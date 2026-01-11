# CONSTRAINTS.md - 约束规则

> 用途: 定义团队工作流的硬约束
> 编码: UTF-8

---

## 核心约束

### 1. 减少确认 (Minimize Confirmation)

**规则**: AUTO 区域可连续执行到验收结束；仅 Gate2 前停一次

**AUTO 区域**:
- 代码修改（非生产）
- 测试执行
- 证据收集
- 快照更新
- 文档更新

**非 AUTO 区域** (需要 Gate2):
- 生产数据库修改
- 生产服务重启
- 删除生产数据
- 修改网络拓扑
- 安全相关变更

---

### 2. Gate2 定义

**Gate2 触发条件**:
任何会影响以下方面的操作都必须 Gate2:
- ✅ 生产可用性
- ✅ 数据一致性
- ✅ 安全性
- ✅ 网络拓扑

**Gate2 操作示例**:
- 生产数据库修复/迁移
- 生产服务重启
- 删除生产数据
- 修改防火墙规则
- 修改 SSL 证书
- 修改核心配置（影响所有用户）

**Gate2 流程**:
1. 检测到 Gate2 项
2. 输出 Gate2 表格（风险/影响/回滚/验证）
3. 暂停执行
4. 等待用户批准
5. 批准后继续执行

---

### 3. 证据优先 (Evidence First)

**规则**: 每次修复都必须输出"完整结构化证据"

**必须包含的证据**:
- ✅ 版本标记（代码版本、模块版本、`__file__` 路径）
- ✅ 命中实例链路（DNS → 反代 → 容器/进程 → DB → addons_path → 模块版本）
- ✅ 请求/响应关键字段（脱敏后，前 200 字符）
- ✅ 结构化报错（type/len/keys/preview）
- ✅ 数据库状态（to_regclass、表结构、记录数）

**证据格式**:
- 证据日志: `ai/SNAPSHOT/WO-XXX-evidence.log`
- 执行日志: `ai/SNAPSHOT/WO-XXX-run.log`
- 验收日志: `ai/SNAPSHOT/WO-XXX-acceptance.log`

---

### 4. 可回滚 (Rollback Required)

**规则**: 任何变更都要提供 rollback

**回滚方式**:
- **代码变更**: `git revert <commit>` 或 `git checkout <commit>`
- **文件变更**: 备份文件（`.bak.TIMESTAMP`）或 git 恢复
- **数据库变更**: 迁移回滚脚本或数据恢复
- **配置变更**: 备份配置（`.bak.TIMESTAMP`）或 git 恢复

**回滚命令格式**:
```bash
# 回滚代码
git revert <commit-sha>
# 或
git checkout <commit-sha> -- <file>

# 回滚文件
cp <file>.bak.TIMESTAMP <file>

# 回滚数据库
psql -d <db> -f migrations/rollback_XXX.sql

# 回滚配置
cp <config>.bak.TIMESTAMP <config>
```

**回滚验证**:
- 验证代码版本恢复
- 验证功能恢复
- 验证数据恢复

---

### 5. 日志脱敏 (Log Redaction)

**规则**: token/key/secret/password/auth 等必须脱敏后才写入快照

**脱敏字段**:
- `token`
- `secret`
- `password`
- `auth`
- `api_key`
- `apiKey`
- `authorization`
- `email`（可选）
- `phone`（可选）

**脱敏规则**:
- 替换为 `***MASKED***`
- 保留字段名和结构
- 保留前 3 个字符（如需要）

**脱敏工具**:
- `TOOLS/redact_rules.md` - 脱敏规则定义
- `TOOLS/snapshot_collect.sh` - 自动脱敏脚本

---

### 6. 单一真实入口 (Single Source of Truth)

**规则**: UI 问题必须先确认"命中实例链路"

**命中实例链路**:
```
DNS 解析
    ↓
反向代理 (Nginx/ALB)
    ↓
容器/进程 (Docker/Systemd)
    ↓
数据库 (PostgreSQL/MySQL)
    ↓
Addons 路径 (addons_path)
    ↓
模块版本 (ir_module_module)
```

**验证命令**:
```bash
# DNS
dig +short <domain>

# 反向代理
curl -v <url> | grep -i "server\|location"

# 容器/进程
docker ps | grep <service>
# 或
systemctl status <service>

# 数据库
psql -d <db> -c "SELECT ..."

# Addons 路径
cat <config> | grep addons_path

# 模块版本
psql -d <db> -c "SELECT name, state, latest_version FROM ir_module_module WHERE name = '...'"
```

**证据要求**:
- 必须输出完整的命中实例链路
- 必须包含每个环节的证据（IP、容器名、DB名、路径、版本）

---

## 执行约束

### AUTO 执行范围

**允许 AUTO 执行**:
- ✅ 代码修改（非生产关键路径）
- ✅ 测试执行
- ✅ 证据收集
- ✅ 快照更新
- ✅ 文档更新
- ✅ 本地验证

**禁止 AUTO 执行**:
- ❌ 生产数据库修改（需要 Gate2）
- ❌ 生产服务重启（需要 Gate2）
- ❌ 删除生产数据（需要 Gate2）
- ❌ 修改网络拓扑（需要 Gate2）

---

### 错误处理

**遇到错误时**:
1. 停止执行
2. 输出错误信息（脱敏后）
3. 输出已执行的步骤
4. 输出回滚命令
5. 等待用户决定（继续/回滚/修复）

---

## 文档约束

### 必须更新的文档

**每次 WO 执行后**:
- ✅ `ai/SNAPSHOT/SYNC_SNAPSHOT.latest.md` - 更新状态
- ✅ `ai/SNAPSHOT/WO-XXX-*.log` - 证据/执行/验收日志
- ✅ `ai/REPORT.md` 或 `ai/SNAPSHOT/PROJECT_STATUS.md` - 更新进度

**Gate2 执行后**:
- ✅ `ai/GATE2/G2-XXX.md` - Gate2 记录

---

### 文档格式

**编码**: UTF-8

**格式**: Markdown

**时间戳**: ISO 8601 (YYYY-MM-DD HH:MM:SS UTC)

---

*End of CONSTRAINTS*

