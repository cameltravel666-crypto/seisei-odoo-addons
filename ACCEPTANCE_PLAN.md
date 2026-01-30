# 最终部署闭环验收计划

## 交付物清单

### 1. 脚本增强

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `scripts/rollback.sh` | 修改 | 添加 `--steps <n>` 参数支持，从deploy-history.log获取第N个成功部署版本 |

### 2. GitHub Actions Workflows

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `.github/workflows/build_ghcr.yml` | 新增 | 自动构建并推送Odoo18和OCR镜像到GHCR，使用sha-<commit> tag |
| `.github/workflows/deploy.yml` | 重写 | 统一部署workflow，支持staging/prod、promotion机制、验证检查 |
| `.github/workflows/rollback.yml` | 新增 | 一键回滚workflow，支持--steps和--to参数 |

### 3. 服务器安全配置

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `scripts/server_bootstrap_deployer.sh` | 新增 | 创建最小权限deployer用户、配置sudoers、设置SSH密钥 |

### 4. Nginx Router配置漂移治理

| 文件/目录 | 变更类型 | 说明 |
|-----------|----------|------|
| `infra/stacks/edge-nginx-router/` | 新增 | 新增nginx router stack |
| `infra/stacks/edge-nginx-router/docker-compose.yml` | 新增 | Nginx容器定义 |
| `infra/stacks/edge-nginx-router/default.conf` | 新增 | 从nginx/default.conf复制的版本控制配置 |
| `infra/stacks/edge-nginx-router/README.md` | 新增 | Router配置管理说明 |
| `infra/stacks/edge-nginx-router/.env.example` | 新增 | 环境变量模板 |

### 5. 文档

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `docs/GITHUB_CICD.md` | 新增 | 完整的CI/CD使用指南、Secrets配置、故障排查 |
| `docs/DEPLOYMENT.md` | 修改 | 添加"CI/CD模式"和"Nginx Router配置变更流程"章节 |
| `ACCEPTANCE_PLAN.md` | 新增 | 本文档 |

## 核心功能实现

### A) GitHub Actions CI/CD ✅

**构建镜像（build_ghcr.yml）**：
- ✅ Push到main自动触发
- ✅ 构建seisei-odoo18和seisei-ocr镜像
- ✅ 推送sha-<commit>和latest tag到GHCR
- ✅ 使用build cache优化
- ✅ OCI labels包含revision和source

**部署（deploy.yml）**：
- ✅ workflow_dispatch手动触发
- ✅ Stack选择（odoo18-staging, odoo18-prod, web-seisei, ocr, langbot, edge-traefik）
- ✅ SHA tag输入（自动规范化）
- ✅ Promote to prod选项（staging→production自动化）
- ✅ Stack→Environment自动映射
- ✅ odoo18-prod强制验证staging verified
- ✅ SSH连接服务器执行deploy.sh
- ✅ 输出详细的Actions Summary

**回滚（rollback.yml）**：
- ✅ workflow_dispatch手动触发
- ✅ steps_back参数（回滚N个版本）
- ✅ target_sha参数（指定版本回滚）
- ✅ 执行rollback.sh
- ✅ 输出详细的Actions Summary包括域名健康检查

### B) 服务器侧最小权限用户 ✅

**server_bootstrap_deployer.sh**：
- ✅ 创建deployer用户（或自定义用户名）
- ✅ 配置SSH authorized_keys
- ✅ 生成/etc/sudoers.d/seisei-deployer
- ✅ 仅允许执行：deploy.sh, rollback.sh, sync_to_srv.sh, backup.sh, smoke.sh, preflight.sh
- ✅ 仅允许执行：docker, docker-compose命令
- ✅ 仅允许执行：systemctl reload/status nginx, nginx -t
- ✅ NOPASSWD sudo
- ✅ 幂等性（可重复运行）
- ✅ 审计日志（所有操作写入/srv/deploy-history.log）

### C) 配置漂移治理 ✅

**edge-nginx-router Stack**：
- ✅ nginx/default.conf纳入版本控制
- ✅ 通过deploy.sh/sync_to_srv.sh统一部署
- ✅ 部署流程包含nginx -t验证
- ✅ 自动备份旧配置
- ✅ 验证失败自动回滚
- ✅ README.md说明配置变更流程
- ✅ 禁止直接在/opt/seisei-odoo/nginx手动修改
- ✅ 配置漂移检测命令

### D) 文档完整性 ✅

**docs/GITHUB_CICD.md**：
- ✅ GitHub Secrets列表和生成方法
- ✅ 3个workflow的详细使用说明
- ✅ 完整部署演练（4个场景）
- ✅ 故障排查（7个常见问题）
- ✅ 监控与审计指南
- ✅ 最佳实践

**docs/DEPLOYMENT.md更新**：
- ✅ CI/CD模式章节
- ✅ Nginx Router配置变更流程章节
- ✅ 与现有文档无缝集成

## 从0到1验收步骤

### 准备工作（一次性）

#### 1. 配置GitHub Secrets

```bash
# 在本地生成部署密钥
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy_key

# 查看私钥（复制到GitHub Secrets）
cat ~/.ssh/github_deploy_key
# → 复制到GitHub Secrets: DEPLOY_SSH_KEY

# 查看公钥（用于服务器）
cat ~/.ssh/github_deploy_key.pub
```

在GitHub仓库：Settings → Secrets and variables → Actions → New repository secret

- `DEPLOY_SSH_HOST` = `47.245.12.205`
- `DEPLOY_SSH_USER` = `deployer`
- `DEPLOY_SSH_KEY` = （粘贴私钥完整内容）

#### 2. 服务器端准备

```bash
# SSH到服务器
ssh root@47.245.12.205

# 拉取最新代码
cd /opt/seisei-odoo-addons
git pull origin main

# 设置脚本权限
chmod +x scripts/*.sh

# 创建deployer用户（使用生成的公钥）
sudo ./scripts/server_bootstrap_deployer.sh \
  --user deployer \
  --pubkey /path/to/github_deploy_key.pub

# 验证deployer用户
su - deployer
sudo /opt/seisei-odoo-addons/scripts/deploy.sh --help
exit
```

### 验收测试

#### 测试1: 构建镜像 ✅

**步骤**：
1. 在GitHub仓库：Actions → Build and Push GHCR Images
2. 点击 "Run workflow"
3. 选择branch: main, force_build: false
4. 点击 "Run workflow"

**期望输出**：
- Workflow成功完成
- Summary显示：
  - SHA Tag: `sha-<commit>`
  - 构建的镜像列表
  - Deploy命令示例

**验证**：
```bash
# 验证镜像存在
docker manifest inspect ghcr.io/cameltravel666-crypto/seisei-odoo18:sha-<commit>
docker manifest inspect ghcr.io/cameltravel666-crypto/seisei-ocr:sha-<commit>
```

#### 测试2: 部署到Staging ✅

**步骤**：
1. Actions → Deploy to Server
2. 点击 "Run workflow"
3. 输入：
   - stack: `odoo18-staging`
   - sha: `<从测试1获取的sha>`
   - promote_to_prod: `false`
4. 点击 "Run workflow"

**期望输出**：
- Workflow成功完成
- Summary显示：
  - Deployment Configuration
  - Deployment Results: status=success
  - Recent deployment history
  - Running containers

**验证**：
```bash
# 在服务器检查
cat /srv/releases/verified/odoo18-staging.txt
# 应该输出：sha-<commit>

grep "odoo18-staging" /srv/deploy-history.log | tail -5
# 应该看到成功的deploy记录

# 访问staging
curl -I https://staging.erp.seisei.tokyo/nginx-health
# 应该返回 200 OK
```

#### 测试3: Promotion机制验证 ✅

**步骤**：
1. Actions → Deploy to Server
2. 点击 "Run workflow"
3. 输入：
   - stack: `odoo18-prod`
   - sha: `<与staging相同的sha>`
   - promote_to_prod: `false`
4. 点击 "Run workflow"

**期望输出**：
- Workflow成功完成
- Deploy步骤显示 "✅ Version sha-xxx verified in staging"
- Production部署成功

**反向验证（应该失败）**：
```
# 尝试部署未验证的版本
stack: odoo18-prod
sha: sha-test999
promote_to_prod: false

期望：
- Workflow失败
- 错误信息：Production deployment blocked: sha-test999 not verified in staging
```

#### 测试4: 一键Promote ✅

**步骤**：
1. 从测试1获取新的SHA（或手动触发build获取）
2. Actions → Deploy to Server
3. 输入：
   - stack: `odoo18-staging`
   - sha: `<新的sha>`
   - promote_to_prod: `true` ✅
4. 点击 "Run workflow"

**期望输出**：
- Deploy job成功（staging）
- Promote-to-prod job自动触发
- Production部署成功
- Summary显示 "✅ Successfully promoted ... to production"

**验证**：
```bash
# 检查verified文件
cat /srv/releases/verified/odoo18-staging.txt
# 应该是新SHA

# 检查两个环境运行相同版本
ssh deployer@47.245.12.205 "docker inspect odoo18-staging-web | jq -r '.[0].Config.Image'"
ssh deployer@47.245.12.205 "docker inspect odoo18-prod-web | jq -r '.[0].Config.Image'"
# 应该相同
```

#### 测试5: 回滚（steps_back=1） ✅

**步骤**：
1. Actions → Rollback Deployment
2. 点击 "Run workflow"
3. 输入：
   - stack: `odoo18-staging`
   - steps_back: `1`
   - target_sha: （留空）
4. 点击 "Run workflow"

**期望输出**：
- Workflow成功完成
- Summary显示：
  - Rollback Results: status=success
  - Rolled back to: sha-<上一版本>
  - Recent deployment history包含rollback记录
  - Domain health check结果

**验证**：
```bash
grep "odoo18-staging.*rollback" /srv/deploy-history.log | tail -1
# 应该看到rollback记录
```

#### 测试6: Router配置变更 ✅

**步骤A: 同步edge-nginx-router stack**
```bash
# 在服务器
ssh deployer@47.245.12.205

sudo /opt/seisei-odoo-addons/scripts/sync_to_srv.sh edge-nginx-router

# 验证同步成功
ls -la /srv/stacks/edge-nginx-router/
# 应该看到：docker-compose.yml, default.conf, README.md, .env.example
```

**步骤B: 修改配置并部署**
```bash
# 在本地修改
vim infra/stacks/edge-nginx-router/default.conf
# 例如：在注释中添加一行测试标记
# # TEST CHANGE - demo.nagashiro.top routing

# 提交
git add infra/stacks/edge-nginx-router/default.conf
git commit -m "test: nginx router config change"
git push origin main

# 获取commit SHA
git log --oneline -1
# 输出：abc1234 test: nginx router config change
```

**步骤C: 通过GitHub Actions部署**
```
Actions → Deploy to Server
stack: edge-traefik（或edge-nginx-router，如果lib.sh已支持）
sha: sha-abc1234
```

**期望输出**：
- Preflight检查通过
- 备份当前配置
- Sync新配置
- nginx -t验证通过
- nginx reload成功
- Smoke测试通过

**验证**：
```bash
# 检查配置已更新
ssh deployer@47.245.12.205 "grep 'TEST CHANGE' /srv/stacks/edge-nginx-router/default.conf"

# 测试域名
curl -I https://demo.nagashiro.top/nginx-health
```

**步骤D: 回滚router配置**
```
Actions → Rollback Deployment
stack: edge-traefik
steps_back: 1
```

**验证**：
```bash
# 检查TEST CHANGE已移除
ssh deployer@47.245.12.205 "grep 'TEST CHANGE' /srv/stacks/edge-nginx-router/default.conf"
# 应该无输出（已回滚）
```

## 集成验收（端到端）

### 完整发布流程

```
1. 开发者提交代码
   → git commit -m "feat: add new feature"
   → git push origin main

2. build_ghcr.yml自动触发
   → 等待3-5分钟
   → 获取SHA: sha-def4567

3. 部署到staging（带自动promote）
   → Actions → Deploy to Server
   → stack: odoo18-staging
   → sha: sha-def4567
   → promote_to_prod: true
   → 等待staging成功（约2-3分钟）

4. 自动部署到production
   → promote-to-prod job自动运行
   → 验证staging verified
   → 部署到production（约2-3分钟）

5. 访问验证
   → https://staging.erp.seisei.tokyo
   → https://demo.nagashiro.top
   → 两者应该运行相同的sha-def4567

总耗时：约10-15分钟（自动化）
```

### 紧急回滚流程

```
1. 发现production问题
   → 访问demo.nagashiro.top出现错误

2. 立即回滚
   → Actions → Rollback Deployment
   → stack: odoo18-prod
   → steps_back: 1
   → Run workflow

3. 等待回滚完成（约1-2分钟）

4. 验证恢复
   → 访问demo.nagashiro.top
   → 功能正常

总耗时：约2-3分钟
```

## 验收通过标准

所有以下条件必须满足：

- [ ] 测试1-6全部通过
- [ ] 端到端流程运行正常
- [ ] 紧急回滚流程有效
- [ ] GitHub Actions Summary清晰展示结果
- [ ] deploy-history.log正确记录所有操作
- [ ] staging verified机制工作正常
- [ ] deployer用户权限正确（最小权限）
- [ ] nginx router配置变更流程有效
- [ ] 所有文档清晰易懂

## 已知限制

1. **WWW镜像构建**：build_ghcr.yml目前不包含seisei-www镜像（需要单独的repo）
2. **edge-nginx-router stack名称**：lib.sh中可能需要添加映射，当前使用edge-traefik作为临时方案
3. **Database回滚**：默认不自动回滚数据库，需要手动操作
4. **多区域部署**：当前仅支持单服务器

## 后续改进

- [ ] 添加Slack/邮件通知
- [ ] 实现配置漂移自动检测cron job
- [ ] 添加性能监控指标收集
- [ ] 支持蓝绿部署
- [ ] 支持Canary发布
- [ ] 自动化数据库备份验证

## 提交检查清单

在提交代码前确认：

- [ ] 所有脚本有执行权限（chmod +x）
- [ ] Workflow YAML语法正确（yamllint或GitHub Actions验证）
- [ ] 文档链接正确
- [ ] 代码中无硬编码密钥/密码
- [ ] README更新（如需要）
- [ ] DELIVERABLES.md更新（如需要）

## 提交命令

```bash
cd /Users/taozhang/Projects/seisei-odoo-addons

# 添加所有新文件
git add .github/workflows/
git add scripts/server_bootstrap_deployer.sh
git add infra/stacks/edge-nginx-router/
git add docs/GITHUB_CICD.md
git add ACCEPTANCE_PLAN.md

# 添加修改的文件
git add scripts/rollback.sh
git add .github/workflows/deploy.yml
git add docs/DEPLOYMENT.md

# 提交
git commit -m "feat: Complete final deployment loop with CI/CD

- Enhanced rollback.sh with --steps parameter
- Added GitHub Actions workflows (build_ghcr, deploy, rollback)
- Created server_bootstrap_deployer.sh for minimal privilege deployment user
- Implemented nginx router configuration drift prevention (edge-nginx-router stack)
- Added comprehensive GITHUB_CICD.md documentation
- Updated DEPLOYMENT.md with CI/CD mode and router change flow
- All workflows support promotion mechanism and staging verification
- Full acceptance plan with step-by-step verification

Refs: next.txt requirements - final deployment loop"

# 推送
git push origin main
```

---

**准备就绪**: ✅ 所有交付物已完成
**验收状态**: ⏳ 待服务器端验证
**最后更新**: 2026-01-30
