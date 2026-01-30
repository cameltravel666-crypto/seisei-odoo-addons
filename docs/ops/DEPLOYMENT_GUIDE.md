# 安全部署指南

## 概述

本指南描述了Seisei Odoo部署的完整流程，包括：
- ✅ Pull镜像而非本地构建
- ✅ Staging环境测试
- ✅ 自动备份和回滚
- ✅ 冒烟测试验证

## 架构说明

```
GitHub Main分支
    ↓
GitHub Actions (自动构建镜像)
    ↓
GHCR (ghcr.io)
    ↓
Staging环境 (测试)
    ↓
Production环境 (部署)
```

## 部署流程

### 1. 代码更改

```bash
# 本地开发
git add .
git commit -m "feat(ocr): add debug logging"
git push origin main
```

### 2. 自动构建

GitHub Actions自动触发：
- 构建Docker镜像
- 推送到 `ghcr.io/cameltravel666-crypto/seisei-odoo18:sha-<commit>`
- 更新 `latest` tag

**查看构建状态:**
```bash
# 在GitHub仓库页面
Actions → Build Docker Images
```

### 3. 部署到Staging

```bash
# 在生产服务器上
cd /root/seisei-odoo-addons

# 方式1: 使用最新构建(latest)
./scripts/deploy.sh odoo18-staging latest

# 方式2: 使用特定SHA
./scripts/deploy.sh odoo18-staging sha-19b9b98
```

**部署脚本会自动:**
1. 记录当前镜像版本
2. 备份数据库
3. 更新.env文件
4. Pull新镜像
5. 重启容器
6. 运行冒烟测试
7. **如果失败→自动回滚**

### 4. 验证Staging

访问 https://staging.erp.seisei.tokyo

**手动测试清单:**
- [ ] 登录功能正常
- [ ] OCR上传收据功能
- [ ] 扫码点餐访问
- [ ] 现有租户数据完整
- [ ] 关键功能无异常

### 5. 部署到Production

**确认Staging测试通过后:**

```bash
# 使用与Staging相同的镜像SHA
./scripts/deploy.sh odoo18-prod sha-19b9b98
```

**⚠️ 重要:**
- 生产环境必须使用具体的SHA tag，禁止使用`latest`
- 必须使用在Staging环境已验证的相同镜像

### 6. 验证Production

```bash
# 检查容器状态
cd /root/seisei-odoo-addons/infra/stacks/odoo18-prod
docker compose ps

# 查看日志
docker compose logs -f --tail=100

# 访问生产环境
curl -f https://demo.nagashiro.top/web/health
```

## 回滚流程

### 自动回滚

如果冒烟测试失败，部署脚本会自动回滚到之前的版本。

### 手动回滚

```bash
# 1. 查看部署历史
cd /root/seisei-odoo-addons
git log --oneline -10

# 2. 选择要回滚的版本
ROLLBACK_SHA=4b1ce21

# 3. 执行回滚
./scripts/deploy.sh odoo18-prod sha-${ROLLBACK_SHA}
```

### 恢复数据库备份

```bash
# 1. 列出备份
ls -lh /root/backups/odoo18-prod_db_*.sql.gz

# 2. 恢复指定备份
BACKUP_FILE="/root/backups/odoo18-prod_db_20260129_143022.sql.gz"

# 3. 停止服务
cd /root/seisei-odoo-addons/infra/stacks/odoo18-prod
docker compose down

# 4. 恢复数据库
zcat $BACKUP_FILE | docker exec -i seisei-db psql -U odoo

# 5. 重启服务
docker compose up -d
```

## 冒烟测试

### 自动测试项目

脚本`scripts/smoke-test.sh`会自动测试：

1. ✅ 容器运行状态
2. ✅ 健康检查端点
3. ✅ Web登录页面
4. ✅ 数据库连接
5. ✅ 静态资源加载
6. ✅ 响应时间
7. ✅ SSL证书
8. ✅ OCR服务配置
9. ✅ QR点餐模块

### 手动运行测试

```bash
# Staging
./scripts/smoke-test.sh odoo18-staging https://staging.erp.seisei.tokyo

# Production
./scripts/smoke-test.sh odoo18-prod https://demo.nagashiro.top
```

## 环境对比

| 项目 | Staging | Production |
|------|---------|------------|
| 域名 | staging.erp.seisei.tokyo | *.erp.seisei.tokyo<br>demo.nagashiro.top |
| 镜像tag | `latest` 或特定SHA | **必须**使用特定SHA |
| 数据库 | staging databases | production databases |
| 资源限制 | 3G RAM, 1.5 CPU | 4G RAM, 2 CPU |
| 自动备份 | 可选 | **必须** |
| 冒烟测试 | **必须**通过 | **必须**通过 |

## 故障排查

### 镜像拉取失败

```bash
# 检查认证
docker login ghcr.io -u <username>

# 验证镜像存在
docker manifest inspect ghcr.io/cameltravel666-crypto/seisei-odoo18:sha-19b9b98

# 检查网络
ping ghcr.io
```

### 部署后服务无响应

```bash
# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f

# 检查健康状态
docker inspect odoo18-prod-web | jq '.[0].State.Health'

# 重启服务
docker compose restart web
```

### 数据库连接失败

```bash
# 检查数据库容器
docker ps | grep seisei-db

# 测试数据库连接
docker exec -it seisei-db psql -U odoo -c "SELECT version();"

# 检查网络
docker network inspect seisei-odoo-network
```

## 最佳实践

### ✅ 推荐做法

1. **始终通过Staging验证**
   - 任何代码更改必须先部署到Staging
   - 在Staging上完整测试后再部署到Production

2. **使用Git SHA tag**
   - Production环境禁止使用`latest`
   - 使用具体的SHA确保可追溯性

3. **保留部署记录**
   ```bash
   # 在服务器上记录部署
   echo "$(date) - Deployed sha-19b9b98 to odoo18-prod" >> /root/deploy-history.log
   ```

4. **定期清理旧镜像**
   ```bash
   # 清理30天前的镜像
   docker image prune -a --filter "until=720h"
   ```

### ❌ 避免做法

1. ❌ 在服务器上本地构建镜像
2. ❌ 跳过Staging直接部署到Production
3. ❌ 在Production使用`latest` tag
4. ❌ 跳过数据库备份
5. ❌ 忽略冒烟测试失败

## 紧急情况处理

### 生产环境完全故障

```bash
# 1. 立即回滚到上一个已知正常版本
./scripts/deploy.sh odoo18-prod sha-<last-good-version>

# 2. 如果回滚失败，使用前一天的备份
ls -t /root/backups/odoo18-prod_db_*.sql.gz | head -1

# 3. 通知团队
echo "Production down - investigating" | wall

# 4. 查看完整日志
docker compose logs --tail=1000 > /tmp/prod-logs.txt
```

### 数据丢失

```bash
# 1. 停止所有写操作
docker compose stop web

# 2. 评估损失范围
docker exec seisei-db psql -U odoo -c "SELECT count(*) FROM account_move;"

# 3. 决定恢复策略
# - 部分丢失: 从最近备份恢复特定表
# - 完全丢失: 完整恢复最近备份

# 4. 执行恢复(见上文)
```

## 监控与告警

### 健康检查

```bash
# 添加到crontab (每5分钟)
*/5 * * * * curl -f https://demo.nagashiro.top/web/health || echo "Health check failed" | mail -s "Odoo Health Alert" admin@seisei.tokyo
```

### 磁盘空间监控

```bash
# 检查备份目录大小
du -sh /root/backups/

# 设置告警阈值
df -h | awk '$5 > 80 {print $0}' | mail -s "Disk Space Alert" admin@seisei.tokyo
```

## 附录

### 相关文档

- [镜像策略](IMAGE_STRATEGY.md) - Docker镜像命名和tag规范
- [发布流程](RELEASE_PROCESS.md) - 版本发布流程
- [回滚指南](../scripts/rollback_guide.sh) - 详细回滚步骤

### 常用命令

```bash
# 查看当前运行的镜像版本
docker inspect odoo18-prod-web | jq '.[0].Config.Image'

# 查看最近的部署记录
git log --oneline -10

# 列出所有本地镜像
docker images | grep seisei-odoo18

# 强制重新拉取镜像
docker compose pull --no-cache
```
