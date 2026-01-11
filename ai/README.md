# AI Template - 可复制的团队工作流模板

> 用途: 提炼并固化"四方协作"工作流与约束，复制到新项目即可用
> 版本: 1.0.0
> 编码: UTF-8

---

## 一句话说明

这是一个可复制的 AI 协作模板，定义了用户 → ChatGPT → Claude Code → Cursor 的四方协作工作流、约束规则、项目阶段、以及标准化的文档和工具。

---

## 复制到新项目三步走

### Step 1: 复制模板
```bash
# 从 server-apps 复制到新项目
cp -r /path/to/server-apps/AI-template /path/to/new-project/ai-template
```

### Step 2: 填充项目元数据
编辑 `ai-template/PROJECT.yaml`:
- 项目名、环境、服务清单
- 域名、关键路径
- Gate2 owner

### Step 3: 初始化状态文件
```bash
cd /path/to/new-project
mkdir -p ai/SNAPSHOT/raw
cp ai-template/STATE/SYNC_SNAPSHOT.latest.md ai/SNAPSHOT/
cp ai-template/STATE/PROJECT_STATUS.template.md ai/SNAPSHOT/PROJECT_STATUS.md
```

**详细步骤**: 查看 `QUICK_START.md` 获取完整指南

---

## 日常使用五步走

### 1. 用户提出需求
- 描述问题/目标
- 说明风险偏好
- 等待 Gate2 批准（如需要）

### 2. ChatGPT 拆解任务
- 选择工作流
- 输出给 Claude Code / Cursor 的 prompt
- 定义验收标准、证据清单、回滚策略

### 3. Claude Code 审计
- 读仓库、定位根因
- 提出变更方案与最小补丁
- 给出验证/证据命令清单

### 4. Cursor 执行
- 按 WO 自动执行
- 收集证据
- 更新快照与报告

### 5. 验收与关闭
- 验证验收标准
- 更新 SYNC_SNAPSHOT
- 关闭 WO

---

## 目录结构

```
AI-template/
├── README.md                    # 本文件
├── PROJECT.yaml                 # 项目元数据模板
├── WORKFLOW.md                  # 工作流说明
├── CONSTRAINTS.md               # 约束规则
├── PHASES.md                    # 项目阶段定义
├── PROMPTS/
│   ├── CLAUDE_CODE.md          # Claude Code 角色定义
│   └── CURSOR.md               # Cursor 角色定义
├── TEMPLATES/
│   ├── WORK_ORDER.template.md  # 工作单模板
│   ├── GATE2.template.md       # Gate2 模板
│   ├── SYNC_SNAPSHOT.template.md # 快照模板
│   ├── ADR.template.md         # 架构决策记录模板
│   └── EVIDENCE_CHECKLIST.md   # 证据清单
├── TOOLS/
│   ├── snapshot_collect.sh     # 快照收集工具
│   ├── snapshot_render.py      # 快照渲染工具
│   └── redact_rules.md         # 脱敏规则
├── STATE/
│   ├── PROJECT_STATUS.template.md # 项目状态模板
│   └── SYNC_SNAPSHOT.latest.md    # 快照模板占位
└── EXAMPLES/
    ├── WO-EXAMPLE.md           # 工作单示例
    ├── GATE2-EXAMPLE.md        # Gate2 示例
    └── SYNC_SNAPSHOT.example.md # 快照示例
```

---

## 核心原则

1. **减少确认**: AUTO 区域可连续执行到验收结束；仅 Gate2 前停一次
2. **Gate2 定义**: 任何会影响生产可用性/数据一致性/安全的操作都必须 Gate2
3. **证据优先**: 每次修复都必须输出完整结构化证据
4. **可回滚**: 任何变更都要提供 rollback
5. **日志脱敏**: token/key/secret 等必须脱敏
6. **单一真实入口**: UI 问题必须先确认"命中实例"

---

## 参考文档

- `WORKFLOW.md` - 详细工作流说明
- `CONSTRAINTS.md` - 约束规则详解
- `PHASES.md` - 项目阶段定义
- `PROMPTS/` - 角色定义和 prompt 模板
- `TEMPLATES/` - 文档模板
- `EXAMPLES/` - 使用示例

---

*End of README*

