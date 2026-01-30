# 工业级部署系统实现方案

## 当前进度

✅ 已完成：
1. `scripts/lib.sh` - 通用函数库（2026-01-30完成）
   - Stack映射管理
   - 部署历史记录
   - Promotion机制
   - Docker/Compose辅助函数
   - 日志和错误处理

## 待实现脚本清单

基于next.txt的要求，以下是完整的交付物清单：

### A) 核心脚本 (scripts/)

1. **lib.sh** ✅ 已完成
   - 路径：`scripts/lib.sh`
   - 功能：通用函数库，所有脚本的基础

2. **preflight.sh** ⏳ 待创建
   - 功能：部署前门禁检查
   - 检查项：
     - edge网络存在
     - 关键服务无:latest
     - compose文件可解析
     - 无build指令
     - 磁盘空间 >20%

3. **backup.sh** ⏳ 待创建
   - 功能：按stack备份
   - 备份内容：
     - docker-compose.yml
     - .env文件
     - PostgreSQL数据库dump
   - 备份路径：`/srv/backups/<stack>/<timestamp>/`

4. **smoke.sh** ⏳ 待创建
   - 功能：冒烟测试
   - 测试项：
     - 容器health状态
     - 关键域名HTTP 200
     - OCR health endpoint
     - 数据库连接

5. **deploy.sh** ⏳ 需重写
   - 功能：统一部署入口
   - 流程：
     1. preflight检查
     2. backup数据
     3. pull镜像
     4. docker compose up
     5. smoke测试
     6. 写入history
     7. 失败→rollback

6. **rollback.sh** ⏳ 需重写
   - 功能：回滚到上一版本
   - 来源：
     - 从deploy-history读取上一版本
     - 或从backup目录恢复

### B) Promotion机制

文件路径：`/srv/releases/verified/<stack>.txt`

工作流：
```bash
# Staging部署成功后
./deploy.sh odoo18-staging staging sha-abc123
# → 写入 /srv/releases/verified/odoo18.txt = sha-abc123

# Production部署时验证
./deploy.sh odoo18-prod prod sha-abc123
# → 检查 sha-abc123 == verified版本
# → 若不匹配，拒绝部署（除非--force）
```

### C) Seisei-WWW镜像修复

**问题**：
- 当前：本地pin tag `seisei-www:pin-20260129-d75f3637`
- 目标：使用GHCR sha tag `ghcr.io/seisei/www:sha-<commit>`

**方案**：

1. 在www仓库创建GitHub Actions workflow：
   ```yaml
   # .github/workflows/docker-build.yml
   name: Build and Push WWW Image

   on:
     push:
       branches: [main]

   jobs:
     build:
       runs-on: ubuntu-latest
       permissions:
         packages: write
       steps:
         - uses: actions/checkout@v4
         - uses: docker/login-action@v3
           with:
             registry: ghcr.io
             username: ${{ github.actor }}
             password: ${{ secrets.GITHUB_TOKEN }}
         - uses: docker/build-push-action@v5
           with:
             push: true
             tags: |
               ghcr.io/seisei/www:sha-${{ github.sha }}
               ghcr.io/seisei/www:latest
   ```

2. 更新`/srv/stacks/web-seisei/docker-compose.yml`：
   ```yaml
   services:
     web:
       image: ghcr.io/seisei/www:${WWW_IMAGE_TAG:-sha-d75f3637}
   ```

3. 更新`.env`文件：
   ```bash
   WWW_IMAGE_TAG=sha-d75f3637  # 当前commit的SHA
   ```

### D) 运行目录统一

**现状问题**：
- 源码在：`/opt/seisei-odoo-addons/infra/stacks/`
- 运行在：多个位置（/srv, /opt, /home）

**解决方案**：

1. 统一运行目录：`/srv/stacks/<stack>/`
2. 部署时同步源码到运行目录：
   ```bash
   rsync -av /opt/seisei-odoo-addons/infra/stacks/odoo18-prod/ \
             /srv/stacks/odoo18-prod/
   ```
3. 所有docker compose操作只在`/srv/stacks/`执行

**Stack映射表**（已在lib.sh实现）：
| Stack | 运行目录 | 源码目录 |
|-------|---------|---------|
| edge-traefik | /srv/stacks/edge-traefik | /srv/stacks/edge-traefik |
| langbot | /srv/stacks/langbot | /srv/stacks/langbot |
| ocr | /srv/stacks/ocr | /srv/stacks/ocr |
| odoo18-prod | /srv/stacks/odoo18-prod | /opt/seisei-odoo-addons/infra/stacks/odoo18-prod |
| odoo18-staging | /srv/stacks/odoo18-staging | /opt/seisei-odoo-addons/infra/stacks/odoo18-staging |
| web-seisei | /srv/stacks/web-seisei | /home/ubuntu/biznexus/infra/stacks/web-seisei |

### E) 部署历史审计

文件：`/srv/deploy-history.log`

格式：
```
时间戳 | stack | env | action | version | status | notes
2026-01-30 10:00:00 | odoo18-prod | prod | deploy | sha-19b9b98 | success |
2026-01-30 10:15:00 | odoo18-prod | prod | rollback | sha-4b1ce21 | success | smoke failed
```

查询示例：
```bash
# 查看某stack的部署历史
grep "| odoo18-prod |" /srv/deploy-history.log | tail -10

# 查看失败的部署
grep "| .* | fail |" /srv/deploy-history.log

# 查看最后一次成功部署
grep "| odoo18-prod | prod | deploy | .* | success |" /srv/deploy-history.log | tail -1
```

## 验证步骤

### 场景1：正常发布流程

```bash
# 1. Preflight检查
sudo ./scripts/preflight.sh odoo18-staging

# 2. 部署到Staging
sudo ./scripts/deploy.sh odoo18-staging staging sha-19b9b98

# 3. Staging smoke通过，自动写入verified
cat /srv/releases/verified/odoo18-staging.txt
# 输出：sha-19b9b98

# 4. 部署到Production（会验证version == verified）
sudo ./scripts/deploy.sh odoo18-prod prod sha-19b9b98

# 5. 检查部署历史
tail /srv/deploy-history.log
```

### 场景2：自动回滚演示

```bash
# 1. 故意部署错误版本（未验证）
sudo ./scripts/deploy.sh odoo18-prod prod sha-wrong999
# 预期：verification失败，拒绝部署

# 2. 强制部署错误版本
sudo ./scripts/deploy.sh odoo18-prod prod sha-wrong999 --force
# 预期：跳过验证，部署失败（镜像不存在），自动rollback

# 3. 检查是否回滚到上一版本
docker inspect odoo18-prod-web | jq '.[0].Config.Image'
# 应该是上一个正常版本
```

### 场景3：手动回滚

```bash
# 1. 查看部署历史
sudo ./scripts/rollback.sh odoo18-prod --list

# 2. 回滚到指定版本
sudo ./scripts/rollback.sh odoo18-prod sha-4b1ce21

# 3. 或回滚到上一个成功版本
sudo ./scripts/rollback.sh odoo18-prod --last-good
```

## 风险点与缓解措施

### 风险1：目录同步问题
**风险**：rsync可能删除生产数据
**缓解**：
- 使用`--exclude`排除数据目录
- 只同步配置文件
- 数据目录使用docker volume

### 风险2：网络问题导致镜像拉取失败
**风险**：docker pull超时
**缓解**：
- 设置合理的timeout
- 拉取失败不更新.env
- 保留旧版本可rollback

### 风险3：数据库备份失败
**风险**：备份时DB不可用
**缓解**：
- 使用`pg_dump`而非停机备份
- 备份失败时阻止部署
- 保留最近10个备份

### 风险4：Smoke测试误报
**风险**：正常服务被判定失败
**缓解**：
- 增加重试机制（3次）
- 合理的timeout设置
- 提供--skip-smoke选项（需审批）

## 下一步行动

1. **立即执行**（高优先级）：
   - [ ] 创建preflight.sh
   - [ ] 创建backup.sh
   - [ ] 创建smoke.sh（基于现有smoke-test.sh改造）
   - [ ] 重写deploy.sh（集成promotion机制）
   - [ ] 重写rollback.sh（从history读取）

2. **短期执行**（本周内）：
   - [ ] 为seisei-www添加GitHub Actions
   - [ ] 同步stack目录到/srv
   - [ ] 测试完整的staging→prod流程

3. **中期优化**（下周）：
   - [ ] 添加Slack/邮件通知
   - [ ] 部署dashboard（可视化history）
   - [ ] 自动化定期backup

## 相关文档

- [IMAGE_STRATEGY.md](IMAGE_STRATEGY.md) - 镜像策略
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - 部署指南
- [部署脚本源码](../scripts/) - 所有脚本

## 维护者

- DevOps Team
- 最后更新：2026-01-30
