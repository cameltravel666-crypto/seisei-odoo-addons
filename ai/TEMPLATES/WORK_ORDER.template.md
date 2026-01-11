# WORK_ORDER Template

> Encoding: UTF-8
> 使用此模板创建新的 Work Order (WO)

---

## WO-XXX: [工作标题]

**创建时间**: YYYY-MM-DD  
**状态**: OPEN / IN_PROGRESS / BLOCKED / DONE  
**负责人**: @username

---

## Goal（目标）

[清晰描述工作目标，1-3 句话]

---

## Scope（范围）

[明确说明工作范围，包括哪些模块/功能]

---

## Non-goals（非目标）

[明确说明不在本次工作范围内的内容，避免范围蔓延]

---

## Constraints（约束）

[列出约束条件，如技术限制、时间限制、资源限制等]

示例：
- 用户不手工操作服务器；所有命令由 Cursor 执行
- 最小改动原则，避免大规模重构
- 向后兼容，不破坏现有功能
- 必须通过语法检查和单元测试

---

## Plan（计划）

[列出执行计划，可以是步骤列表或流程图]

### 步骤 1: [步骤名称]
- [ ] 子任务 1
- [ ] 子任务 2

### 步骤 2: [步骤名称]
- [ ] 子任务 1
- [ ] 子任务 2

---

## Commands (AUTO)（自动执行命令）

[列出所有可以自动执行的命令，使用 non-interactive 模式]

```bash
# 命令 1
command1 --yes --no-input

# 命令 2
command2 -y
```

---

## Gate2（如需要）

如果此工作涉及 Gate2 操作（生产环境变更），填写以下信息：

**Gate2 ID**: G2-XXX  
**操作类型**: [DEPLOY / DB_MIGRATION / CONFIG_CHANGE / etc.]  
**风险等级**: [LOW / MEDIUM / HIGH]  
**回滚方案**: [回滚步骤描述]  
**验证证据**: [如何验证操作成功]

详细内容参考 `TEMPLATES/GATE2.template.md`

---

## Acceptance Criteria（验收标准）

[列出可验证的验收标准，每个标准应该是可测试的]

1. ✅ [标准 1]
2. ✅ [标准 2]
3. ✅ [标准 3]

---

## Evidence（证据）

[列出必须收集的证据]

1. **版本标记**
   - 代码版本
   - 模块版本
   - `__file__` 路径

2. **命中实例链路**
   - DNS 解析
   - 反向代理
   - 容器/进程
   - 数据库
   - Addons 路径

3. **请求/响应关键字段**（脱敏后）
   - 请求参数
   - 响应类型
   - 响应预览（前 200 字符）

4. **结构化报错**
   - 错误类型
   - 错误长度
   - 错误键（如果是 dict）
   - 错误预览（脱敏）

---

## Rollback（回滚）

[详细描述回滚步骤]

### 代码回滚
```bash
git revert <commit-sha>
# 或
git checkout <commit-sha> -- <file>
```

### 文件回滚
```bash
cp <file>.bak.TIMESTAMP <file>
```

### 数据库回滚
```bash
psql -d <db> -f migrations/rollback_XXX.sql
```

### 配置回滚
```bash
cp <config>.bak.TIMESTAMP <config>
```

---

## Changelog（变更日志）

| 日期 | 操作 | 说明 |
|------|------|------|
| YYYY-MM-DD | Created | 初始创建 |
| YYYY-MM-DD | Updated | [更新说明] |
| YYYY-MM-DD | Executed | 执行完成 |
| YYYY-MM-DD | Verified | 验证通过 |

---

*End of WORK_ORDER Template*

