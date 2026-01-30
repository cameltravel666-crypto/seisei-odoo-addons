# GitHub CI/CD 完整指南

## 概述

本文档描述如何使用 GitHub Actions 进行自动化构建、部署和回滚。

**工作流**：
1. **build_ghcr.yml** - 构建并推送 Docker 镜像到 GHCR
2. **deploy.yml** - 部署到服务器（支持 staging 和 production）
3. **rollback.yml** - 回滚到之前的版本

## 必需的 GitHub Secrets

在 GitHub 仓库设置中配置以下 Secrets（Settings → Secrets and variables → Actions）：

| Secret Name | 描述 | 示例值 | 必需 |
|-------------|------|--------|------|
| `DEPLOY_SSH_HOST` | 服务器 IP 地址 | `47.245.12.205` | 是 |
| `DEPLOY_SSH_USER` | SSH 用户名 | `deployer` 或 `root` | 是 |
| `DEPLOY_SSH_KEY` | SSH 私钥（完整内容） | `-----BEGIN OPENSSH PRIVATE KEY-----\n...` | 是 |

**可选 Secrets**：
- `GHCR_TOKEN` - 如果需要自定义 GHCR token（默认使用 `GITHUB_TOKEN`）
- Slack/邮件通知的 webhooks（未来扩展）

### 生成 SSH 密钥对

```bash
# 在本地生成专用于部署的密钥对
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy_key

# 公钥添加到服务器
ssh-copy-id -i ~/.ssh/github_deploy_key.pub deployer@47.245.12.205

# 或者使用 server_bootstrap_deployer.sh
sudo /opt/seisei-odoo-addons/scripts/server_bootstrap_deployer.sh \
  --user deployer \
  --pubkey ~/.ssh/github_deploy_key.pub

# 私钥内容添加到 GitHub Secrets
cat ~/.ssh/github_deploy_key
# 复制完整输出（包括 -----BEGIN... 和 -----END...）到 DEPLOY_SSH_KEY
```

## 工作流详解

### 1. Build GHCR Images (build_ghcr.yml)

**触发条件**：
- 自动：push 到 `main` 分支（排除文档和脚本变更）
- 手动：Actions 页面点击 "Run workflow"

**产物**：
- `ghcr.io/cameltravel666-crypto/seisei-odoo18:sha-<commit>`
- `ghcr.io/cameltravel666-crypto/seisei-odoo18:latest`
- `ghcr.io/cameltravel666-crypto/seisei-ocr:sha-<commit>`
- `ghcr.io/cameltravel666-crypto/seisei-ocr:latest`

**手动触发**：
1. 进入 Actions → Build and Push GHCR Images
2. 点击 "Run workflow"
3. 选择分支（通常 `main`）
4. 可选：force_build = true（强制构建所有镜像）
5. 点击 "Run workflow"

**查看结果**：
- 查看 workflow 的 Summary 标签页
- 会显示生成的 SHA tag 和部署命令

### 2. Deploy to Server (deploy.yml)

**触发条件**：
- 仅手动触发（workflow_dispatch）

**输入参数**：
- `stack`: 选择要部署的 stack（odoo18-staging, odoo18-prod, web-seisei, ocr, langbot, edge-traefik）
- `sha`: SHA tag（可以是 `sha-19b9b98` 或简写 `19b9b98`）
- `promote_to_prod`: 仅对 odoo18-staging 有效，staging 成功后自动部署到 production

**约束**：
- `odoo18-staging` → environment: `staging`
- `odoo18-prod` → environment: `prod`（必须先在 staging 验证）
- `web-seisei`, `ocr`, `langbot` → environment: `prod`
- `edge-traefik` → environment: `infra`

**执行流程**：
1. **Validate** - 验证输入并规范化 SHA tag
2. **Deploy** - 通过 SSH 连接服务器执行 `deploy.sh`
   - 对 `odoo18-prod`：强制检查 `/srv/releases/verified/odoo18-staging.txt`
   - 运行完整部署流程（preflight → backup → deploy → smoke）
3. **Promote to Prod**（可选）- 如果 staging 成功且勾选 promote，自动部署到 production

**手动触发**：

#### 部署到 Staging

1. 进入 Actions → Deploy to Server
2. 点击 "Run workflow"
3. 输入：
   - stack: `odoo18-staging`
   - sha: `sha-19b9b98`（从 build workflow 获取）
   - promote_to_prod: `false`
4. 点击 "Run workflow"
5. 等待完成，查看 Summary

#### 部署到 Production（已验证版本）

1. 确认 staging 部署成功
2. 进入 Actions → Deploy to Server
3. 点击 "Run workflow"
4. 输入：
   - stack: `odoo18-prod`
   - sha: `sha-19b9b98`（与 staging 相同）
   - promote_to_prod: `false`
5. Workflow 会自动验证 SHA 是否在 staging verified
6. 验证通过后执行部署

#### 一键 Staging → Production（Promote）

1. 进入 Actions → Deploy to Server
2. 点击 "Run workflow"
3. 输入：
   - stack: `odoo18-staging`
   - sha: `sha-19b9b98`
   - promote_to_prod: `true` ✅
4. 点击 "Run workflow"
5. Staging 成功后自动触发 Production 部署

### 3. Rollback Deployment (rollback.yml)

**触发条件**：
- 仅手动触发

**输入参数**：
- `stack`: 选择要回滚的 stack
- `steps_back`: 回滚步数（默认 1 = 上一个版本）
- `target_sha`: 指定回滚目标 SHA（可选，优先于 steps_back）

**执行流程**：
1. **Validate** - 验证输入
2. **Rollback** - 通过 SSH 执行 `rollback.sh`
   - 从 `/srv/deploy-history.log` 查找目标版本
   - 更新 `.env`
   - Pull 镜像
   - 重新创建容器
   - 运行 smoke tests

**手动触发**：

#### 回滚到上一版本

1. 进入 Actions → Rollback Deployment
2. 点击 "Run workflow"
3. 输入：
   - stack: `odoo18-prod`
   - steps_back: `1`
   - target_sha: （留空）
4. 点击 "Run workflow"

#### 回滚到指定版本

1. 进入 Actions → Rollback Deployment
2. 点击 "Run workflow"
3. 输入：
   - stack: `odoo18-prod`
   - steps_back: `1`（会被忽略）
   - target_sha: `sha-4b1ce21`
4. 点击 "Run workflow"

## 完整部署演练

### 场景 1：正常发布流程

```
1. 开发者 push 代码到 main
   ↓
2. build_ghcr.yml 自动触发
   → 生成 sha-abc1234
   ↓
3. 手动触发 deploy.yml
   → stack: odoo18-staging
   → sha: sha-abc1234
   → promote_to_prod: false
   ↓
4. 测试 staging 环境
   → 访问 https://staging.erp.seisei.tokyo
   → 确认功能正常
   ↓
5. 手动触发 deploy.yml
   → stack: odoo18-prod
   → sha: sha-abc1234
   → ✅ 自动验证 staging verified
   ↓
6. Production 部署完成
   → 访问 https://demo.nagashiro.top
```

### 场景 2：一键 Promote 流程

```
1. Push 代码 → build_ghcr.yml → sha-xyz789
   ↓
2. 手动触发 deploy.yml
   → stack: odoo18-staging
   → sha: sha-xyz789
   → promote_to_prod: true ✅
   ↓
3. Staging 部署成功
   → 写入 /srv/releases/verified/odoo18-staging.txt = sha-xyz789
   ↓
4. 自动触发 Production 部署
   → 验证 SHA 匹配
   → 部署到 odoo18-prod
   ↓
5. 完成
```

### 场景 3：紧急回滚

```
1. Production 发现问题
   ↓
2. 手动触发 rollback.yml
   → stack: odoo18-prod
   → steps_back: 1
   ↓
3. 回滚到上一版本
   → 从 deploy-history.log 读取
   → Pull 旧镜像
   → 重新创建容器
   → Smoke 测试
   ↓
4. 验证 production 恢复正常
   → 访问域名测试
   ↓
5. 修复问题并重新部署
```

### 场景 4：Nginx Router 配置变更

```
1. 修改 infra/stacks/edge-nginx-router/default.conf
   → 例如：添加新域名路由规则
   ↓
2. Commit 并 push 到 main
   ↓
3. 手动触发 deploy.yml
   → stack: edge-traefik 或 edge-nginx-router
   → sha: latest（或特定 commit）
   ↓
4. Deploy 流程会：
   → Sync 配置到 /srv/stacks/edge-nginx-router/
   → 运行 nginx -t 验证配置
   → Reload nginx
   → Smoke 测试域名
   ↓
5. 验证路由生效
   → 测试新域名或修改的规则
```

## 故障排查

### 问题 1: SSH 连接失败

**症状**：
```
ssh: connect to host 47.245.12.205 port 22: Connection refused
```

**排查**：
1. 检查服务器是否在线：`ping 47.245.12.205`
2. 检查 SSH 服务：`systemctl status sshd`
3. 检查 GitHub Secrets 中的 `DEPLOY_SSH_HOST` 是否正确
4. 检查防火墙规则

### 问题 2: SSH 认证失败

**症状**：
```
Permission denied (publickey)
```

**排查**：
1. 检查 `DEPLOY_SSH_KEY` 是否正确（完整私钥内容）
2. 检查服务器上的 `~deployer/.ssh/authorized_keys`
3. 检查文件权限：
   ```bash
   chmod 700 ~deployer/.ssh
   chmod 600 ~deployer/.ssh/authorized_keys
   ```
4. 查看服务器 SSH 日志：`journalctl -u sshd -f`

### 问题 3: Production 部署被阻止（Verification Failed）

**症状**：
```
::error::Production deployment blocked: sha-xyz789 not verified in staging
Verified version: sha-abc1234
Requested version: sha-xyz789
```

**原因**：
- 尝试部署未在 staging 验证过的版本

**解决**：
1. **方案 A（推荐）**：先部署到 staging
   ```
   deploy.yml → stack: odoo18-staging → sha: sha-xyz789
   等待成功后再部署到 production
   ```

2. **方案 B（紧急）**：在服务器上使用 `--force`
   ```bash
   sudo /opt/seisei-odoo-addons/scripts/deploy.sh odoo18-prod prod sha-xyz789 --force
   ```
   ⚠️ 会在 deploy-history.log 中标记为 "FORCED"

### 问题 4: Smoke 测试失败

**症状**：
```
❌ Deployment failed
Smoke tests failed, rollback attempted
```

**排查**：
1. 查看 Actions workflow 日志
2. 查看服务器上的 `/tmp/deploy.log`
3. 检查容器状态：
   ```bash
   cd /srv/stacks/odoo18-prod
   docker compose ps
   docker compose logs --tail=100
   ```
4. 手动运行 smoke 测试：
   ```bash
   sudo /opt/seisei-odoo-addons/scripts/smoke.sh odoo18-prod prod sha-xxxxx
   ```
5. 检查域名访问：
   ```bash
   curl -v https://demo.nagashiro.top/web/health
   ```

### 问题 5: 镜像拉取失败

**症状**：
```
Error response from daemon: manifest for ghcr.io/.../seisei-odoo18:sha-xxx not found
```

**排查**：
1. 确认镜像已构建：查看 build_ghcr.yml workflow
2. 确认 SHA tag 正确：`sha-` 前缀
3. 检查 GHCR 镜像是否存在：
   ```bash
   docker manifest inspect ghcr.io/cameltravel666-crypto/seisei-odoo18:sha-xxx
   ```
4. 检查服务器是否登录 GHCR（应该不需要，镜像是 public）

### 问题 6: Rollback 找不到历史版本

**症状**：
```
No deployment found 2 steps back in history
```

**原因**：
- deploy-history.log 中没有足够的成功部署记录

**解决**：
1. 查看实际历史：
   ```bash
   grep "odoo18-prod.*deploy.*success" /srv/deploy-history.log
   ```
2. 使用 `--to` 指定具体版本：
   ```bash
   rollback.yml → target_sha: sha-abc1234
   ```

### 问题 7: Workflow 权限错误

**症状**：
```
Error: Resource not accessible by integration
```

**排查**：
1. 检查 workflow 文件中的 `permissions` 设置
2. 检查仓库设置：Settings → Actions → General → Workflow permissions
3. 确保 "Read and write permissions" 已启用

## 监控与审计

### 查看部署历史

**在 GitHub**：
- Actions 页面查看所有 workflow runs
- 每个 run 的 Summary 包含详细信息

**在服务器**：
```bash
# 查看完整历史
cat /srv/deploy-history.log

# 查看某个 stack 的历史
grep "odoo18-prod" /srv/deploy-history.log | tail -20

# 查看失败的部署
grep "fail" /srv/deploy-history.log

# 查看强制部署（需审计）
grep "FORCED" /srv/deploy-history.log

# 查看最近的回滚
grep "rollback" /srv/deploy-history.log | tail -10
```

### 审计检查点

**每日**：
- 检查 deploy-history.log 中的 "FORCED" 标记
- 验证 production 版本与 staging verified 一致

**每周**：
- 审计所有 production 部署
- 确认所有变更都有对应的 git commit

**每月**：
- 回顾回滚记录，分析原因
- 更新文档和流程

## 最佳实践

### ✅ 推荐

1. **总是通过 Staging 验证**
   - 任何 production 部署前必须在 staging 测试
   - 使用 promote_to_prod 实现自动化

2. **使用 SHA tags**
   - 永远不要在 production 使用 `:latest`
   - SHA tag 确保可追溯和可复现

3. **小步快跑**
   - 频繁部署小的变更
   - 出问题容易回滚

4. **监控 Actions**
   - 启用 GitHub notifications
   - 失败时立即响应

5. **文档化变更**
   - Commit message 要清晰
   - 重要变更在 PR 中讨论

### ❌ 避免

1. ❌ 跳过 staging 直接部署到 production
2. ❌ 在服务器上手动修改配置文件
3. ❌ 使用 `--force` 绕过 promotion 检查（除非紧急）
4. ❌ 忽略 smoke 测试失败
5. ❌ 不查看 workflow 日志就重试

## 相关文档

- [DEPLOYMENT.md](DEPLOYMENT.md) - 完整部署指南
- [VERIFICATION_COMMANDS.md](../VERIFICATION_COMMANDS.md) - 服务器验证命令
- [WWW_GHCR_WORKFLOW.md](WWW_GHCR_WORKFLOW.md) - WWW 镜像发布
- [edge-nginx-router/README.md](../infra/stacks/edge-nginx-router/README.md) - Router 配置管理

## 支持

如有问题，请：
1. 查看本文档的故障排查章节
2. 查看 Actions workflow 日志
3. 查看服务器上的 `/srv/deploy-history.log`
4. 联系 DevOps Team

---

**最后更新**: 2026-01-30
**维护者**: DevOps Team
