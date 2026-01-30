# 生产级部署指南

## 概述

本文档描述Seisei项目的完整部署流程，包括：
- ✅ CI自动构建镜像
- ✅ Staging环境验证
- ✅ Production promotion机制
- ✅ 自动备份和回滚
- ✅ 冒烟测试验证
- ✅ **禁止:latest tag**
- ✅ **禁止本地build**

## 架构说明

```
┌─────────────┐
│ Git Push    │
│ to main     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ GitHub      │
│ Actions     │ → ghcr.io/owner/repo:sha-xxxxx
└──────┬──────┘
       │
       ▼
┌─────────────┐       ┌─────────────┐
│ Staging     │       │ Verified    │
│ Deploy      │──────→│ /srv/       │
│ + Smoke     │       │ releases/   │
└──────┬──────┘       └─────────────┘
       │                     ▲
       │ Pass                │
       ▼                     │
┌─────────────┐              │
│ Production  │──────────────┘
│ Deploy      │ (must match verified)
└─────────────┘
```

## 部署流程

### 1. 正常发布流程

#### A. 代码提交

```bash
# 本地开发
git add .
git commit -m "feat: add new feature"
git push origin main
```

#### B. 自动构建（GitHub Actions）

- 自动触发构建
- 推送到 `ghcr.io/owner/repo:sha-xxxxx`
- 更新 `:latest` tag

查看构建状态：GitHub仓库 → Actions → Build Docker Images

#### C. 部署到Staging

```bash
# SSH到服务器
ssh root@47.245.12.205

# 同步stack配置到/srv（如果需要）
sudo /opt/seisei-odoo-addons/scripts/sync_to_srv.sh odoo18-staging

# 部署到staging
sudo /opt/seisei-odoo-addons/scripts/deploy.sh odoo18-staging staging sha-19b9b98
```

**deploy.sh会自动执行**：
1. Preflight检查（网络、compose、磁盘）
2. 备份当前配置和数据库
3. 拉取新镜像
4. 重新创建容器
5. 运行冒烟测试
6. **成功后写入verified版本**
7. 失败自动回滚

#### D. 验证Staging

访问 https://staging.erp.seisei.tokyo

**手动测试清单**：
- [ ] 登录功能正常
- [ ] OCR上传收据
- [ ] 关键功能无异常
- [ ] 性能可接受

#### E. 部署到Production

```bash
# 使用与staging相同的SHA（已验证）
sudo /opt/seisei-odoo-addons/scripts/deploy.sh odoo18-prod prod sha-19b9b98
```

**Production deployment额外检查**：
- ✅ 自动验证version = verified版本
- ✅ 如果不匹配，拒绝部署
- ✅ 必须先在staging验证

#### F. 验证Production

```bash
# 检查容器状态
cd /srv/stacks/odoo18-prod
docker compose ps

# 查看部署历史
tail -20 /srv/deploy-history.log

# 手动smoke测试
sudo /opt/seisei-odoo-addons/scripts/smoke.sh odoo18-prod prod sha-19b9b98
```

访问：
- https://demo.nagashiro.top
- https://biznexus.seisei.tokyo

### 2. 紧急热修复流程

**使用场景**：生产环境紧急bug修复

```bash
# 1. 修复代码并推送
git commit -m "fix: critical bug in payment"
git push origin main

# 2. 等待GitHub Actions构建完成
# 获取新的SHA（查看Actions或git log）
NEW_SHA=$(git log --oneline -1 | awk '{print "sha-"$1}')

# 3. 可选：跳过staging直接部署（需--force且会记录）
sudo /opt/seisei-odoo-addons/scripts/deploy.sh odoo18-prod prod $NEW_SHA --force
```

**⚠️ 警告**：
- `--force`会跳过promotion检查
- 会在deploy-history中标记为FORCED
- 仅用于紧急情况
- 事后必须补充staging验证

**推荐做法**：
即使紧急修复，也应该：
1. 快速部署到staging验证
2. 使用正常流程部署到生产

### 3. 回滚流程

#### A. 自动回滚

如果smoke测试失败，deploy.sh会自动回滚到上一版本。

#### B. 手动回滚

```bash
# 回滚到上一个成功版本（从history读取）
sudo /opt/seisei-odoo-addons/scripts/rollback.sh odoo18-prod prod

# 回滚到特定版本
sudo /opt/seisei-odoo-addons/scripts/rollback.sh odoo18-prod prod --to sha-4b1ce21

# 验证回滚成功
docker inspect odoo18-prod-web | jq '.[0].Config.Image'
```

#### C. 数据库回滚

```bash
# 列出备份
ls -lh /srv/backups/odoo18-prod/

# 恢复指定备份
BACKUP_DIR="/srv/backups/odoo18-prod/20260130_143022"

# 停止服务
cd /srv/stacks/odoo18-prod
docker compose down

# 恢复数据库
zcat $BACKUP_DIR/database.sql.gz | docker exec -i seisei-db psql -U postgres

# 重启服务
docker compose up -d

# 验证
sudo /opt/seisei-odoo-addons/scripts/smoke.sh odoo18-prod prod
```

## 常用命令速查

### 部署相关

```bash
# 同步stack配置到/srv
sudo /opt/seisei-odoo-addons/scripts/sync_to_srv.sh <stack>

# Preflight检查
sudo /opt/seisei-odoo-addons/scripts/preflight.sh <stack> <env>

# 手动备份
sudo /opt/seisei-odoo-addons/scripts/backup.sh <stack> <env>

# 部署
sudo /opt/seisei-odoo-addons/scripts/deploy.sh <stack> <env> <version>

# 部署（强制跳过验证）
sudo /opt/seisei-odoo-addons/scripts/deploy.sh <stack> <env> <version> --force

# 冒烟测试
sudo /opt/seisei-odoo-addons/scripts/smoke.sh <stack> <env> <version>

# 回滚
sudo /opt/seisei-odoo-addons/scripts/rollback.sh <stack> <env>
sudo /opt/seisei-odoo-addons/scripts/rollback.sh <stack> <env> --to <version>
```

### 查询相关

```bash
# 查看部署历史
cat /srv/deploy-history.log
grep "odoo18-prod" /srv/deploy-history.log | tail -10

# 查看verified版本
cat /srv/releases/verified/odoo18-prod.txt

# 查看当前运行版本
docker inspect odoo18-prod-web | jq '.[0].Config.Image'

# 查看备份列表
ls -lt /srv/backups/odoo18-prod/ | head -10
```

### 维护相关

```bash
# 清理旧镜像
docker image prune -a -f

# 清理未使用的卷
docker volume prune -f

# 查看磁盘使用
df -h
du -sh /srv/backups/*

# 查看容器日志
cd /srv/stacks/odoo18-prod
docker compose logs -f --tail=100
```

## Stack映射表

| Stack | 运行目录 | 源码目录 | 域名 |
|-------|---------|---------|------|
| edge-traefik | /srv/stacks/edge-traefik | /srv/stacks/edge-traefik | - |
| langbot | /srv/stacks/langbot | /srv/stacks/langbot | - |
| ocr | /srv/stacks/ocr | /srv/stacks/ocr | http://localhost:8180/health |
| odoo18-prod | /srv/stacks/odoo18-prod | /opt/seisei-odoo-addons/infra/stacks/odoo18-prod | https://demo.nagashiro.top |
| odoo18-staging | /srv/stacks/odoo18-staging | /opt/seisei-odoo-addons/infra/stacks/odoo18-staging | https://staging.erp.seisei.tokyo |
| web-seisei | /srv/stacks/web-seisei | /home/ubuntu/biznexus/infra/stacks/web-seisei | https://biznexus.seisei.tokyo |

## 门禁规则（Preflight Checks）

每次部署前都会自动检查：

1. **edge网络存在** - 所有服务的公共网络
2. **docker-compose.yml有效** - 语法正确
3. **禁止build指令** - 生产只允许pull镜像
4. **禁止:latest tag** - 生产必须使用sha/digest
5. **磁盘空间充足** - 至少20%可用空间
6. **必要命令存在** - docker, jq, curl

**如果任何检查失败，部署会被阻止**。

## Promotion机制

### Verified版本追踪

```
/srv/releases/verified/
├── odoo18-prod.txt      → sha-19b9b98
├── odoo18-staging.txt   → sha-abc123
├── ocr.txt              → sha-b73ee89
└── web-seisei.txt       → sha-d75f363
```

### 工作流程

1. **Staging部署成功** → 写入verified版本
2. **Production部署** → 必须匹配verified版本
3. **--force跳过检查** → 在history中标记为FORCED

### 验证逻辑

```bash
# Staging: 总是允许，成功后mark_verified
./deploy.sh odoo18-staging staging sha-abc123
# → 成功后写入 /srv/releases/verified/odoo18-staging.txt = sha-abc123

# Production: 必须与verified匹配
./deploy.sh odoo18-prod prod sha-abc123
# → 检查 sha-abc123 == verified版本
# → 如果不匹配，拒绝部署

# Production强制部署（紧急情况）
./deploy.sh odoo18-prod prod sha-xyz999 --force
# → 跳过验证检查
# → 在history中标记"FORCED"
```

## 部署历史审计

### 格式

```
时间戳 | stack | env | action | version | status | notes
```

### 示例

```
2026-01-30 10:00:00 | odoo18-prod | prod | deploy | sha-19b9b98 | success |
2026-01-30 10:15:00 | odoo18-prod | prod | deploy | sha-abc123 | fail | smoke failed
2026-01-30 10:16:00 | odoo18-prod | prod | rollback | sha-19b9b98 | success | from sha-abc123
2026-01-30 14:00:00 | odoo18-prod | prod | deploy | sha-def456 | success | FORCED
```

### 查询示例

```bash
# 查看某stack的所有部署
grep "| odoo18-prod |" /srv/deploy-history.log

# 查看失败的部署
grep "| .* | fail |" /srv/deploy-history.log

# 查看强制部署（需审计）
grep "| .* | .* | FORCED" /srv/deploy-history.log

# 查看最后一次成功部署
grep "| odoo18-prod | prod | deploy | .* | success |" /srv/deploy-history.log | tail -1
```

## 故障排查

### 问题1：Preflight检查失败

**症状**：部署被阻止，提示preflight failed

**排查**：
```bash
# 手动运行preflight
sudo /opt/seisei-odoo-addons/scripts/preflight.sh odoo18-prod prod

# 检查具体错误
# - edge网络：docker network inspect edge
# - compose文件：cd /srv/stacks/odoo18-prod && docker compose config
# - 磁盘空间：df -h
```

### 问题2：镜像拉取失败

**症状**：docker compose pull失败

**排查**：
```bash
# 检查镜像是否存在
docker manifest inspect ghcr.io/owner/repo:sha-xxxxx

# 检查GHCR登录
docker login ghcr.io

# 检查网络
ping ghcr.io
```

### 问题3：Smoke测试失败

**症状**：部署自动回滚

**排查**：
```bash
# 手动运行smoke测试
sudo /opt/seisei-odoo-addons/scripts/smoke.sh odoo18-prod prod sha-xxxxx

# 检查容器状态
cd /srv/stacks/odoo18-prod
docker compose ps
docker compose logs

# 检查域名访问
curl -v https://demo.nagashiro.top/web/health
```

### 问题4：Promotion验证失败

**症状**：Production部署被拒绝，提示"not verified"

**原因**：版本未在staging验证过

**解决**：
```bash
# 方案1：先部署到staging
sudo /opt/seisei-odoo-addons/scripts/deploy.sh odoo18-staging staging sha-xxxxx

# 方案2：紧急情况使用--force（会记录）
sudo /opt/seisei-odoo-addons/scripts/deploy.sh odoo18-prod prod sha-xxxxx --force
```

## 最佳实践

### ✅ 推荐

1. **总是通过Staging验证**
   - 任何代码更改都先部署到staging
   - 完整测试后再部署到production

2. **使用Git SHA tag**
   - Production禁止使用`:latest`
   - 使用SHA确保可追溯性和可复现性

3. **保留部署记录**
   - deploy-history.log永久保留
   - 备份定期归档（保留30天）

4. **监控和告警**
   - 定期检查smoke测试
   - 关键服务配置健康检查

5. **文档化变更**
   - 重要部署在commit message中说明
   - 紧急修复后补充文档

### ❌ 避免

1. ❌ 在服务器上本地build镜像
2. ❌ 使用`:latest` tag在生产环境
3. ❌ 跳过staging直接部署到production
4. ❌ 忽略preflight检查失败
5. ❌ 不备份就直接部署
6. ❌ 频繁使用--force跳过验证

## 维护计划

### 每日

- [ ] 检查deploy-history.log
- [ ] 监控磁盘空间
- [ ] 查看容器健康状态

### 每周

- [ ] 清理旧Docker镜像
- [ ] 验证备份可用性
- [ ] 审计--force部署记录

### 每月

- [ ] 归档旧备份
- [ ] 更新文档
- [ ] 安全补丁更新

## 相关文档

- [IMAGE_STRATEGY.md](IMAGE_STRATEGY.md) - 镜像策略
- [WWW_GHCR_WORKFLOW.md](WWW_GHCR_WORKFLOW.md) - WWW镜像发布
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - 实现计划

## 联系方式

- DevOps Team: devops@seisei.tokyo
- 紧急联系: +81-xxx-xxxx-xxxx
- 最后更新: 2026-01-30
