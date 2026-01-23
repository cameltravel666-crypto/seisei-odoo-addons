# Seisei 工程工作流协议

本文档定义 Claude/Cursor 等 AI 助手在本项目中的工作规范和扫描范围。

## 扫描范围

### 默认扫描 (高优先级)

AI 助手默认应关注以下目录：

| 目录 | 说明 |
|------|------|
| `src/` | Next.js 应用源代码 |
| `prisma/` | 数据库 schema 和迁移 |
| `infra/stacks/` | Docker Compose 配置 |
| `infra/scripts/` | 运维脚本 |
| `odoo_modules/` | Odoo 自定义模块 |
| `services/` | 微服务（OCR 等） |

### 按需扫描 (显式请求时)

以下目录仅在用户明确请求时扫描：

| 目录 | 说明 |
|------|------|
| `docs/` | 文档（排除 _archive） |
| `scripts/` | 数据处理脚本 |
| `ai/` | AI 相关配置 |

### 禁止扫描

以下目录/文件不应被扫描或索引：

- `docs/_archive/` - 历史归档文档
- `node_modules/` - Node.js 依赖
- `.next/` - Next.js 构建输出
- `*.tar.gz` - 部署包
- `*.dump` / `*.sql.gz` - 数据库备份
- `Backup/` - 项目备份
- `temp/` - 临时文件
- `Pem/` - SSH 密钥
- `odoo-*+e.*/` - Odoo Enterprise 源码

---

## 工程规范

### 1. 服务器禁令

```
⛔ 禁止手动修改服务器配置
⛔ 禁止直接 SSH 修改生产环境
✅ 所有变更必须通过仓库提交
✅ 使用 deploy.sh 进行部署
```

### 2. Stack 隔离原则

每个服务栈 (stack) 必须：

1. **独立网络**: 使用私有网络 + edge 外部网络
2. **独立卷**: 不共享数据卷
3. **独立环境变量**: 每个 stack 有自己的 `.env`
4. **prod/test 分离**: 生产和测试环境完全隔离

### 3. 端口规范

```
✅ 仅 Traefik 占用 80/443
✅ 其他服务使用 expose，不绑定宿主机端口
⚠️ 调试时可绑定 127.0.0.1:port
⛔ 禁止绑定 0.0.0.0:port（除 Traefik 外）
```

### 4. 部署流程

```
deploy.sh <stack> <version> stage
    ↓
smoke-test.sh <stack>
    ↓ 通过              ↓ 失败
promote to prod      rollback to last_good
```

### 5. Odoo 安全规范

- 模块升级前 **自动备份**
- 数据库操作前 **自动备份**
- 保留 **7 天** 备份历史
- 高风险操作需要 **手动确认**

---

## 代码规范

### 提交信息格式

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

类型：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档
- `style`: 格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具
- `infra`: 基础设施

### 分支策略

- `main`: 生产分支，受保护
- `develop`: 开发分支
- `feature/*`: 功能分支
- `hotfix/*`: 紧急修复

---

## 目录结构

```
seisei-erp/
├── src/                    # Next.js 源代码
├── prisma/                 # 数据库
├── infra/                  # 基础设施
│   ├── stacks/            # Docker Compose
│   └── scripts/           # 运维脚本
├── odoo_modules/          # Odoo 模块
├── services/              # 微服务
├── docs/                  # 文档
│   ├── ops/              # 运维文档
│   └── _archive/         # 归档
├── .github/workflows/     # CI/CD
├── AGENTS.md             # 本文件
└── CONTRIBUTING.md       # 贡献指南
```

---

## 快速命令

```bash
# 部署
./infra/scripts/deploy.sh erp-seisei v1.0.0 prod

# 冒烟测试
./infra/scripts/smoke-test.sh all

# Odoo 备份
./infra/scripts/backup-odoo18.sh odoo18-test

# NPM 迁移
./infra/scripts/migrate-npm-to-traefik.sh prepare
```
