# 服务器端验证命令清单

## 文件清单

### 新增文件
```
scripts/lib.sh               - 通用函数库
scripts/preflight.sh         - 门禁检查
scripts/backup.sh            - 备份脚本
scripts/smoke.sh             - 冒烟测试
scripts/rollback.sh          - 回滚脚本
scripts/deploy.sh            - 统一部署入口（已替换）
scripts/sync_to_srv.sh       - 目录同步

docs/DEPLOYMENT.md           - 完整部署指南
docs/WWW_GHCR_WORKFLOW.md    - WWW镜像发布指南
docs/IMPLEMENTATION_PLAN.md  - 实现计划
VERIFICATION_COMMANDS.md     - 本文档
```

### 修改文件
```
scripts/deploy.sh           - 已替换为新版本（旧版本备份为deploy-old-2.sh）
```

## 在服务器上的验证步骤

### 准备工作

```bash
# SSH到服务器
ssh root@13.231.79.114

# 拉取最新代码
cd /opt/seisei-odoo-addons
git pull origin main

# 确保脚本可执行
chmod +x scripts/*.sh

# 创建必要的目录
mkdir -p /srv/stacks
mkdir -p /srv/backups
mkdir -p /srv/releases/verified
touch /srv/deploy-history.log
```

### 步骤1：验证lib.sh函数库

```bash
# 测试lib.sh可以被source
source /opt/seisei-odoo-addons/scripts/lib.sh

# 测试stack映射
echo "Testing resolve_stack_dir..."
resolve_stack_dir "odoo18-prod"
# 期望输出：/srv/stacks/odoo18-prod

# 测试域名获取
echo "Testing get_stack_domain..."
get_stack_domain "odoo18-prod"
# 期望输出：https://demo.nagashiro.top

# 测试日志函数
log_info "Test info message"
log_success "Test success message"
log_warn "Test warning message"
```

### 步骤2：验证preflight.sh门禁检查

```bash
# 检查staging环境（允许:latest）
/opt/seisei-odoo-addons/scripts/preflight.sh odoo18-staging staging

# 检查production环境（禁止:latest）
/opt/seisei-odoo-addons/scripts/preflight.sh odoo18-prod prod

# 期望输出：所有检查通过
# ✅ edge网络存在
# ✅ compose文件有效
# ✅ 无build指令
# ✅ 无:latest tag（prod环境）
# ✅ 磁盘空间充足
```

### 步骤3：同步stack到/srv

```bash
# 同步odoo18-prod
/opt/seisei-odoo-addons/scripts/sync_to_srv.sh odoo18-prod

# 验证目录已创建
ls -la /srv/stacks/odoo18-prod/
# 应该看到：docker-compose.yml, .env, config/

# 同步odoo18-staging
/opt/seisei-odoo-addons/scripts/sync_to_srv.sh odoo18-staging

# 同步web-seisei
/opt/seisei-odoo-addons/scripts/sync_to_srv.sh web-seisei
```

### 步骤4：验证backup.sh备份功能

```bash
# 备份odoo18-prod
/opt/seisei-odoo-addons/scripts/backup.sh odoo18-prod prod

# 检查备份目录
ls -lh /srv/backups/odoo18-prod/
# 应该看到：最新时间戳的目录

# 检查备份内容
LATEST_BACKUP=$(ls -t /srv/backups/odoo18-prod/ | head -1)
ls -lh /srv/backups/odoo18-prod/$LATEST_BACKUP/
# 应该看到：docker-compose.yml, .env, manifest.txt
# 如果有数据库：database.sql.gz
```

### 步骤5：验证smoke.sh冒烟测试

```bash
# 测试当前运行的odoo18-prod
cd /srv/stacks/odoo18-prod
CURRENT_VERSION=$(docker inspect odoo18-prod-web | jq -r '.[0].Config.Image' | awk -F: '{print $NF}')
/opt/seisei-odoo-addons/scripts/smoke.sh odoo18-prod prod $CURRENT_VERSION

# 期望输出：
# Test 1: 容器运行中 ✅
# Test 2: 容器健康 ✅
# Test 3: 域名可访问 ✅
# Test 4: OCR服务健康 ✅
# Summary: Passed: 4, Failed: 0
```

### 步骤6：测试完整部署流程（Staging）

```bash
# 获取当前最新commit SHA
cd /opt/seisei-odoo-addons
CURRENT_SHA=$(git log --oneline -1 | awk '{print "sha-"$1}')
echo "Current SHA: $CURRENT_SHA"

# 部署到staging（这会触发完整流程）
/opt/seisei-odoo-addons/scripts/deploy.sh odoo18-staging staging $CURRENT_SHA

# 期望流程：
# Step 1: Preflight Checks ✅
# Step 2: Backup ✅
# Step 3: Pull Image ✅
# Step 4: Deploy Containers ✅
# Step 5: Smoke Tests ✅
# Step 6: Mark as Verified ✅
```

### 步骤7：验证promotion机制

```bash
# 检查verified版本已写入
cat /srv/releases/verified/odoo18-staging.txt
# 应该输出：当前部署的SHA

# 尝试部署到production（应该检查验证）
# 注意：只有当staging版本与production需要部署的版本一致时才会成功
/opt/seisei-odoo-addons/scripts/deploy.sh odoo18-prod prod $CURRENT_SHA

# 如果staging和production SHA一致，期望成功
# 如果不一致，期望失败并提示"not verified"
```

### 步骤8：测试rollback功能

```bash
# 查看部署历史
cat /srv/deploy-history.log | tail -10

# 模拟回滚（回到上一版本）
/opt/seisei-odoo-addons/scripts/rollback.sh odoo18-staging staging

# 验证已回滚
docker inspect odoo18-staging-web | jq -r '.[0].Config.Image'
# 应该显示回滚后的版本
```

### 步骤9：测试--force部署

```bash
# 强制部署到production（跳过验证）
/opt/seisei-odoo-addons/scripts/deploy.sh odoo18-prod prod sha-test999 --force

# 期望：
# 1. 会显示"FORCE MODE ENABLED"警告
# 2. 跳过promotion检查
# 3. 如果镜像存在，会部署
# 4. 在history中标记为"FORCED"

# 检查history标记
grep "FORCED" /srv/deploy-history.log | tail -1
```

### 步骤10：验证部署历史记录

```bash
# 查看完整历史
cat /srv/deploy-history.log

# 查看odoo18-prod的历史
grep "odoo18-prod" /srv/deploy-history.log

# 查看失败的部署
grep "fail" /srv/deploy-history.log

# 查看强制部署（需要审计）
grep "FORCED" /srv/deploy-history.log
```

## 验证清单

在服务器上依次执行上述步骤，并检查：

- [ ] lib.sh可以正常source
- [ ] preflight.sh对不同环境执行正确的检查
- [ ] sync_to_srv.sh可以正确同步目录
- [ ] backup.sh可以备份配置和数据库
- [ ] smoke.sh可以测试运行中的服务
- [ ] deploy.sh可以完整执行部署流程
- [ ] staging成功后verified文件已创建
- [ ] production部署会检查verified版本
- [ ] rollback.sh可以回滚到上一版本
- [ ] --force可以跳过验证（并标记）
- [ ] deploy-history.log正确记录所有操作

## 常见问题

### Q1: preflight检查edge网络失败

**解决**：
```bash
# 检查edge网络是否存在
docker network inspect edge

# 如果不存在，创建
docker network create edge
```

### Q2: 同步时提示权限不足

**解决**：
```bash
# 确保以root运行
sudo /opt/seisei-odoo-addons/scripts/sync_to_srv.sh odoo18-prod

# 或者修改/srv/stacks权限
chmod 755 /srv/stacks
```

### Q3: 备份时找不到数据库容器

**原因**：该stack可能没有数据库，或容器名称不匹配

**解决**：这是正常的，脚本会跳过数据库备份并继续

### Q4: smoke测试失败

**排查**：
```bash
# 检查容器状态
cd /srv/stacks/odoo18-prod
docker compose ps

# 检查容器日志
docker compose logs --tail=50

# 手动测试域名
curl -v https://demo.nagashiro.top/web/health
```

## 下一步

验证完成后：

1. **提交代码**：
```bash
cd /opt/seisei-odoo-addons
git add scripts/ docs/
git commit -m "feat: Complete production-grade deployment system

- Added lib.sh with stack mapping and promotion mechanism
- Created preflight.sh for deployment gatekeeping
- Implemented backup.sh for config and database backup
- Added smoke.sh for post-deployment verification
- Rewrote deploy.sh with promotion and auto-rollback
- Created rollback.sh for version rollback
- Added sync_to_srv.sh for directory unification
- Complete documentation in DEPLOYMENT.md
- WWW GHCR workflow guide"

git push origin main
```

2. **在staging测试真实部署**

3. **逐步迁移其他stack**

4. **设置监控和告警**
