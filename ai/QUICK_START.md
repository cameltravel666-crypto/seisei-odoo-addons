# QUICK_START.md - 快速开始指南

> 如何在其他项目中使用 AI-template
> 编码: UTF-8

---

## 5 分钟快速开始

### Step 1: 复制模板到新项目

```bash
# 方式 1: 从 server-apps 复制（推荐）
cp -r /path/to/server-apps/AI-template /path/to/new-project/ai-template

# 方式 2: 如果新项目已有 ai/ 目录，可以合并
cp -r /path/to/server-apps/AI-template/* /path/to/new-project/ai-template/
```

### Step 2: 填充项目元数据

编辑 `ai-template/PROJECT.yaml`:

```yaml
project_name: "your-project-name"
owner: "Your Name"
version: "1.0.0"

environments:
  dev:
    description: "开发环境"
    base_url: "http://localhost:8000"
  prod:
    description: "生产环境"
    base_url: "https://your-domain.com"

services:
  - name: "Your Service"
    type: "docker"  # 或 systemd/k8s
    port: 8000
    domain: "your-domain.com"
    container_name: "your-service"
    health_endpoint: "/health"
    description: "服务描述"

paths:
  code_root: "/path/to/code"
  config_root: "/path/to/config"
  logs_root: "/path/to/logs"
  data_root: "/path/to/data"

gate2_owner: "your-email@example.com"
```

### Step 3: 初始化状态文件

```bash
cd /path/to/new-project

# 创建快照目录
mkdir -p ai/SNAPSHOT/raw

# 复制快照模板
cp ai-template/STATE/SYNC_SNAPSHOT.latest.md ai/SNAPSHOT/
cp ai-template/STATE/PROJECT_STATUS.template.md ai/SNAPSHOT/PROJECT_STATUS.md

# 编辑 PROJECT_STATUS.md，填充当前项目状态
```

### Step 4: 创建第一个工作单

```bash
# 复制工作单模板
cp ai-template/TEMPLATES/WORK_ORDER.template.md ai/WORK_ORDERS/WO-001.md

# 编辑 WO-001.md，填写你的工作内容
```

### Step 5: 测试工具

```bash
# 测试快照收集工具
cd /path/to/new-project
./ai-template/TOOLS/snapshot_collect.sh

# 测试快照渲染工具
python3 ai-template/TOOLS/snapshot_render.py

# 检查生成的快照
cat ai/SNAPSHOT/SYNC_SNAPSHOT.latest.md
```

---

## 详细配置说明

### 1. 项目结构

推荐的项目结构：

```
your-project/
├── ai-template/          # 模板目录（可复制到新项目）
├── ai/                   # 工作流目录
│   ├── WORK_ORDERS/      # 工作单
│   ├── GATE2/            # Gate2 记录
│   ├── SNAPSHOT/         # 快照
│   │   ├── raw/          # 原始数据
│   │   ├── SYNC_SNAPSHOT.latest.md
│   │   └── PROJECT_STATUS.md
│   └── REPORT.md         # 项目报告（可选）
├── docs/                 # 项目文档
└── [your-code]/          # 你的代码
```

### 2. 环境变量配置（如需要）

如果工具需要访问特定服务，可以在 `PROJECT.yaml` 中配置，或创建 `.env` 文件：

```bash
# .env (不要提交到 git)
NOTION_API_KEY=your-key
DATABASE_URL=postgresql://...
```

### 3. 自定义模板

你可以基于模板创建项目特定的模板：

```bash
# 创建项目特定的工作单模板
cp ai-template/TEMPLATES/WORK_ORDER.template.md ai/TEMPLATES/WO-PROJECT.template.md

# 编辑并添加项目特定的字段
```

---

## 日常使用流程

### 场景 1: 修复 Bug

1. **用户提出需求** → 创建 WO-XXX.md
2. **ChatGPT 拆解任务** → 更新 WO-XXX.md（Plan、Acceptance Criteria）
3. **Claude Code 审计** → 提供补丁计划和验证步骤
4. **Cursor 执行** → 自动执行、收集证据、更新快照
5. **验收** → 验证验收标准，关闭 WO

### 场景 2: 新功能开发

1. **用户提出需求** → 创建 WO-XXX.md
2. **ChatGPT 拆解任务** → 定义功能范围和验收标准
3. **Claude Code 审计** → 设计架构和实现方案
4. **Cursor 执行** → 实现代码、测试、部署
5. **验收** → 功能测试，更新文档

### 场景 3: 生产环境变更（Gate2）

1. **检测到 Gate2 项** → Cursor 输出 Gate2 表格
2. **用户批准** → 一句话"批准 Gate2"
3. **Cursor 继续执行** → 自动执行、验证、更新快照

---

## 工具使用示例

### 收集系统快照

```bash
# 在项目根目录执行
./ai-template/TOOLS/snapshot_collect.sh

# 输出到 ai/SNAPSHOT/raw/*.txt
```

### 渲染快照

```bash
# 读取 raw 数据，生成结构化快照
python3 ai-template/TOOLS/snapshot_render.py

# 输出到 ai/SNAPSHOT/SYNC_SNAPSHOT.latest.md
```

### 更新项目报告

```bash
# 手动方式：复制快照内容到 REPORT.md
cat ai/SNAPSHOT/SYNC_SNAPSHOT.latest.md >> ai/REPORT.md

# 或使用引用链接（推荐）
# 在 REPORT.md 中添加：
# > 最新快照: [SYNC_SNAPSHOT.latest.md](SNAPSHOT/SYNC_SNAPSHOT.latest.md)
```

---

## 常见问题

### Q1: 如何自定义工作流？

**A**: 编辑 `ai-template/WORKFLOW.md`，根据项目需求调整流程。

### Q2: 如何添加项目特定的约束？

**A**: 编辑 `ai-template/CONSTRAINTS.md`，添加项目特定的约束规则。

### Q3: 工具脚本无法执行？

**A**: 确保脚本有执行权限：
```bash
chmod +x ai-template/TOOLS/*.sh
```

### Q4: 如何集成到 CI/CD？

**A**: 在 CI/CD 流程中添加快照收集：
```yaml
# .github/workflows/snapshot.yml
- name: Collect Snapshot
  run: ./ai-template/TOOLS/snapshot_collect.sh
```

### Q5: 如何与现有文档体系集成？

**A**: 
- 如果项目已有 `docs/` 目录，可以将 `ai-template/` 放在项目根目录
- 在 `PROJECT_PROGRESS.md` 中添加指向现有文档的链接
- 使用 `ai-template/TEMPLATES/ADR.template.md` 记录架构决策

---

## 最佳实践

### 1. 版本控制

```bash
# 将 ai-template/ 提交到 git
git add ai-template/
git commit -m "feat: add AI workflow template"

# 但不要提交敏感信息（.env、密钥等）
echo ".env" >> .gitignore
echo "ai/SNAPSHOT/raw/*.txt" >> .gitignore  # 可选：不提交原始数据
```

### 2. 定期更新快照

```bash
# 建议每天或每次重要变更后更新快照
./ai-template/TOOLS/snapshot_collect.sh
python3 ai-template/TOOLS/snapshot_render.py
```

### 3. 文档同步

- 每次 WO 完成后，更新 `SYNC_SNAPSHOT.latest.md`
- 定期更新 `PROJECT_STATUS.md`
- 重要决策记录在 `docs/decisions/` 或使用 ADR 模板

### 4. 团队协作

- 所有 WO 放在 `ai/WORK_ORDERS/` 目录
- Gate2 记录放在 `ai/GATE2/` 目录
- 使用统一的命名规范：`WO-XXX.md`、`G2-XXX.md`

---

## 下一步

1. ✅ 完成快速开始步骤
2. 📖 阅读 `ai-template/README.md` 了解完整功能
3. 📖 阅读 `ai-template/WORKFLOW.md` 了解工作流
4. 📖 阅读 `ai-template/CONSTRAINTS.md` 了解约束规则
5. 📖 阅读 `ai-template/PHASES.md` 了解项目阶段
6. 🎯 创建第一个工作单，开始使用

---

## 参考资源

- **模板目录**: `ai-template/`
- **工作流说明**: `ai-template/WORKFLOW.md`
- **约束规则**: `ai-template/CONSTRAINTS.md`
- **项目阶段**: `ai-template/PHASES.md`
- **示例文件**: `ai-template/EXAMPLES/`

---

*End of QUICK_START*

