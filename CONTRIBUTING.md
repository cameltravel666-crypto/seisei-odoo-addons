# Contributing to Seisei ERP

感谢你对 Seisei ERP 项目的贡献！请阅读以下指南。

## 开发流程

### 1. 分支策略

```
main          # 生产分支，受保护
  └── develop # 开发分支
        ├── feature/xxx  # 功能分支
        ├── fix/xxx      # Bug 修复
        └── hotfix/xxx   # 紧急修复
```

### 2. 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**类型 (type):**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/依赖
- `infra`: 基础设施

**示例:**
```
feat(ocr): add batch processing for invoices

- Support multiple file upload
- Add progress tracking
- Implement retry mechanism

Closes #123
```

### 3. Pull Request 流程

1. 从 `develop` 创建功能分支
2. 完成开发和测试
3. 提交 PR 到 `develop`
4. 通过 CI 检查和 Code Review
5. 合并到 `develop`
6. 定期从 `develop` 合并到 `main` 发布

### 4. PR 模板

```markdown
## 变更说明
简要描述本次变更

## 变更类型
- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构
- [ ] 文档
- [ ] 基础设施

## 测试
- [ ] 本地测试通过
- [ ] 添加/更新测试用例

## 检查清单
- [ ] 代码符合项目规范
- [ ] 没有引入敏感信息
- [ ] 更新了相关文档
```

---

## Odoo 模块开发

### 迁移前备份要求

**重要**: 在进行以下操作前，必须执行备份：

- 模块升级 (`-u`)
- 数据库迁移
- 批量数据修改

```bash
# 手动备份
./infra/scripts/backup-odoo18.sh odoo18-test pre-migration

# 自动备份（deploy.sh 会自动执行）
./infra/scripts/deploy.sh odoo18-test v1.0.0
```

### 模块结构

```
module_name/
├── __manifest__.py
├── __init__.py
├── models/
│   ├── __init__.py
│   └── model.py
├── views/
│   └── views.xml
├── security/
│   └── ir.model.access.csv
├── data/
│   └── data.xml
└── i18n/
    └── ja.po
```

### 回滚策略

如果模块升级失败：

1. 停止 Odoo 服务
2. 恢复数据库备份
3. 恢复 filestore 备份
4. 重启服务

```bash
# 恢复示例
cd /srv/backups/odoo18-test/<backup-tag>
gunzip -c db.sql.gz | docker exec -i seisei-test-db psql -U odoo
```

---

## 基础设施变更

### Stack 配置变更

1. 修改 `infra/stacks/<stack>/docker-compose.yml`
2. 测试配置: `docker compose config`
3. 提交 PR
4. 部署到 stage: `./deploy.sh <stack> <version> stage`
5. 验证后部署到 prod

### 新增服务

1. 在 `infra/stacks/` 创建新目录
2. 添加 `docker-compose.yml` 和 `.env.example`
3. 添加 Traefik labels（如需公网访问）
4. 更新 `smoke-test.sh` 添加测试
5. 更新文档

---

## 代码规范

### TypeScript/JavaScript

- 使用 ESLint 配置
- 使用 Prettier 格式化
- 优先使用 TypeScript

### Python (Odoo)

- 遵循 PEP 8
- 使用 pylint-odoo
- 添加类型注解

### 安全

- 不提交敏感信息
- 使用环境变量
- 定期更新依赖

---

## 联系方式

如有问题，请联系项目维护者。
