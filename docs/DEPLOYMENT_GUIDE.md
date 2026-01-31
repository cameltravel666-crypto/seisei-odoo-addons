# Seisei Odoo18 部署指南

**版本**: 1.0
**最后更新**: 2026-01-31
**维护者**: 技术团队
**审批者**: Josh

---

## 目录

1. [概述](#概述)
2. [架构设计](#架构设计)
3. [部署工作流](#部署工作流)
4. [操作手册](#操作手册)
5. [故障排查](#故障排查)
6. [安全与合规](#安全与合规)
7. [附录](#附录)

---

## 概述

### 什么是 "Image as Source of Truth"？

**核心理念**: 容器镜像是应用的唯一可信源，所有环境使用相同的镜像，只有配置不同。

**传统部署的问题**:
- ❌ Staging 和 Production 用不同的代码
- ❌ "在我机器上可以运行"
- ❌ 配置漂移
- ❌ 无法准确回滚

**我们的解决方案**:
- ✅ **不可变镜像**: 一次构建，到处部署
- ✅ **Digest 钉住**: 使用 `image@sha256:...` 而非标签
- ✅ **Release 固化**: 每次部署创建独立的 release 目录
- ✅ **原子切换**: 符号链接切换，零停机时间
- ✅ **自动回滚**: Smoke tests 失败自动回退
- ✅ **Production Verified Gate**: Staging 验证后才能部署生产

### 适用场景

本系统适用于：
- ✅ Odoo18 ERP 生产环境
- ✅ Odoo18 Staging 环境
- ✅ 任何需要高可靠性的容器化应用

### 关键指标

- **构建时间**: ~1-2 分钟
- **部署时间**: ~30-60 秒
- **回滚时间**: ~10 秒（自动）
- **停机时间**: 0 秒（原子切换）

---

## 架构设计

### 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│  ┌────────────────┐    ┌──────────────────┐                 │
│  │  Code Changes  │───▶│  Build Workflow  │                 │
│  │  (main branch) │    │  (build_ghcr.yml)│                 │
│  └────────────────┘    └──────────────────┘                 │
│                               │                              │
│                               ▼                              │
│                    ┌─────────────────────┐                  │
│                    │  Push to GHCR       │                  │
│                    │  + Digest Manifest  │                  │
│                    └─────────────────────┘                  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              GitHub Container Registry (GHCR)                │
│   ghcr.io/cameltravel666-crypto/seisei-odoo18:sha-xxxxxxx   │
│   ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:...    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Deploy Workflow                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Download digest manifest (cross-workflow)         │   │
│  │ 2. SSH to server                                     │   │
│  │ 3. Execute deploy.sh with digest                     │   │
│  │ 4. Production: Check verified gate                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Production Server (54.65.127.141)          │
│                                                              │
│  /opt/seisei-odoo-addons/          ← Scripts & Config       │
│  ├── scripts/                                               │
│  │   ├── deploy.sh                 ← Main deploy script    │
│  │   ├── rollback.sh               ← Rollback script       │
│  │   └── lib.sh                    ← Common functions      │
│  └── infra/stacks/                                          │
│      └── odoo18-staging/           ← Source config          │
│                                                              │
│  /srv/releases/                    ← Release Storage        │
│  ├── stacks/odoo18-staging/                                 │
│  │   ├── sha-724f892__20260131T065331Z/  ← Release         │
│  │   │   ├── docker-compose.yml                            │
│  │   │   ├── .env (with IMAGE_REF@sha256:...)             │
│  │   │   └── config/                                       │
│  │   └── sha-f53c9fa__20260131T063928Z/  ← Old release     │
│  ├── current/                      ← Current manifests      │
│  │   └── odoo18-staging.json       ← Deployment metadata   │
│  └── verified/                     ← Verified releases      │
│      └── odoo18-staging.txt        ← sha-724f892           │
│                                                              │
│  /srv/stacks/                      ← Active Deployments     │
│  └── odoo18-staging/  → (symlink to release)               │
│                                                              │
│  /srv/deploy-history.log           ← Audit log             │
└─────────────────────────────────────────────────────────────┘
```

### 2. 目录结构说明

#### `/opt/seisei-odoo-addons`
- **用途**: 存放部署脚本和配置模板（源代码）
- **更新方式**: `git pull` 从 GitHub 同步
- **权限**: root 所有，只读
- **重要性**: ⚠️ 脚本的单一真相源，不要手动修改

#### `/srv/releases/stacks/{stack}/{release_id}`
- **用途**: 存储每次部署的完整配置快照
- **格式**: `sha-{commit}__{timestamp}`
- **内容**: docker-compose.yml, .env, config/, 完整的部署配置
- **特点**: 不可变，每次部署创建新目录
- **保留策略**: 保留最近 10 个 release（自动清理）

#### `/srv/stacks/{stack}`
- **用途**: 当前活跃的部署（符号链接）
- **指向**: `/srv/releases/stacks/{stack}/{current_release_id}`
- **切换**: 通过原子 `mv -T` 操作更新符号链接
- **docker-compose**: 在此目录运行 `docker compose up -d`

#### `/srv/releases/current/{stack}.json`
- **用途**: 当前部署的元数据
- **内容**: image_tag, image_digest, release_id, deployed_at, actor 等
- **用途**: 用于回滚、审计、监控

#### `/srv/releases/verified/{stack}.txt`
- **用途**: 标记已在 staging 验证的版本
- **内容**: 一行文本，如 `sha-724f892`
- **检查**: 生产部署前强制检查（除非 break-glass）

### 3. 镜像标签策略

#### Tag vs Digest

| 类型 | 示例 | 可变性 | 生产使用 |
|------|------|--------|----------|
| **Tag** | `ghcr.io/.../odoo18:sha-724f892` | 可变（可重新推送） | ❌ 不推荐 |
| **Digest** | `ghcr.io/.../odoo18@sha256:1db6436...` | 不可变 | ✅ 必须 |

#### 我们的策略

```yaml
# ❌ 错误 - 使用 tag
image: ghcr.io/cameltravel666-crypto/seisei-odoo18:sha-724f892

# ✅ 正确 - 使用 digest
image: ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:1db6436ca7e084705cffcf3e760b6659cce449bd636edf94917b28de2df3fbe5
```

**原因**:
- Digest 是镜像内容的 SHA256 哈希，无法被篡改
- Tag 可以被重新推送，指向不同的镜像
- 生产环境必须保证镜像的不可变性

---

## 部署工作流

### 工作流 1: Staging 部署（测试新功能）

**目标**: 在 staging 环境测试新代码

```
开发者提交代码
    ↓
GitHub Actions 自动构建镜像
    ↓
手动触发 Deploy to Staging
    ↓
自动 Smoke Tests (4项检查)
    ↓
通过 → 标记为 Verified
失败 → 自动回滚 + 告警
```

#### 详细步骤

**Step 1: 提交代码到 main 分支**

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```

**Step 2: GitHub Actions 自动构建**

触发条件: Push 到 main 分支

- Workflow: `.github/workflows/build_ghcr.yml`
- 构建时间: ~1-2 分钟
- 输出:
  - 镜像推送到 GHCR: `ghcr.io/.../seisei-odoo18:sha-{commit}`
  - Digest manifest artifact: `image-digests.json`

等待构建完成（绿色勾号）。

**Step 3: 手动触发部署**

访问: https://github.com/cameltravel666-crypto/seisei-odoo-addons/actions/workflows/deploy.yml

点击 "Run workflow"，填写参数:

| 参数 | 值 | 说明 |
|------|-----|------|
| **environment** | `staging` | 目标环境 |
| **stack** | `odoo18-staging` | 堆栈名称 |
| **image_tag** | `sha-{commit}` | 例如: sha-724f892 |
| **break_glass** | 不勾选 | Staging 不需要 |
| **break_glass_reason** | 留空 | Staging 不需要 |

点击绿色 "Run workflow" 按钮。

**Step 4: 等待部署完成**

部署流程（30-60秒）:

1. ✅ 下载 digest manifest
2. ✅ SSH 连接到服务器
3. ✅ 执行 deploy.sh
4. ✅ 创建 release 目录
5. ✅ 复制配置文件
6. ✅ 注入 IMAGE_REF (digest)
7. ✅ Docker Compose pull 镜像
8. ✅ 原子切换符号链接
9. ✅ Docker Compose up -d
10. ✅ 运行 Smoke Tests:
    - Test 1: Docker Compose 配置有效 ✓
    - Test 2: 所有容器健康 ✓
    - Test 3: 域名可访问 (https://staging.odoo.seisei.tokyo) ✓
    - Test 4: OCR 服务可用 ✓
11. ✅ 写入部署历史

**Step 5: 验证部署**

访问 https://staging.odoo.seisei.tokyo/

- 应该看到 Odoo 登录界面
- 测试关键功能
- 确认一切正常

**Step 6: 标记为已验证**

SSH 到服务器:

```bash
ssh -i /path/to/key ubuntu@54.65.127.141

# 标记当前部署为已验证
echo "sha-724f892" | sudo tee /srv/releases/verified/odoo18-staging.txt
```

或者让部署脚本自动标记（推荐）。

### 工作流 2: Production 部署（发布到生产）

**前提条件**:
- ✅ 必须先在 staging 部署并验证
- ✅ 必须标记为 verified
- ✅ 需要 Josh 审批（GitHub Environment protection rule）

**目标**: 将已验证的镜像部署到生产环境

```
Staging 部署成功并验证
    ↓
触发 Deploy to Production (需审批)
    ↓
Josh 审批
    ↓
检查 Verified Gate
    ↓
部署相同的镜像
    ↓
Smoke Tests
    ↓
成功 → 上线完成
失败 → 自动回滚到上一个版本
```

#### 详细步骤

**Step 1: 确认 Staging 已验证**

检查 verified 状态:

```bash
ssh -i /path/to/key ubuntu@54.65.127.141

cat /srv/releases/verified/odoo18-staging.txt
# 输出: sha-724f892
```

**Step 2: 触发生产部署**

访问: https://github.com/cameltravel666-crypto/seisei-odoo-addons/actions/workflows/deploy.yml

点击 "Run workflow"，填写参数:

| 参数 | 值 | 说明 |
|------|-----|------|
| **environment** | `production` | ⚠️ 生产环境 |
| **stack** | `odoo18-prod` | 生产堆栈 |
| **image_tag** | `sha-724f892` | **与 staging 相同** |
| **break_glass** | 不勾选 | 紧急情况才用 |
| **break_glass_reason** | 留空 | |

点击 "Run workflow"。

**Step 3: Josh 审批**

GitHub 会暂停部署，等待审批:

- Josh 收到邮件/通知
- 审查变更内容
- 点击 "Review deployments"
- 选择 "Approve and deploy" 或 "Reject"

**Step 4: 自动检查 Verified Gate**

部署脚本会检查:

```bash
# 检查 staging 是否已验证此版本
verified=$(cat /srv/releases/verified/odoo18-staging.txt)

if [ "$verified" != "sha-724f892" ]; then
    echo "❌ 版本未验证，部署终止"
    exit 1
fi

echo "✅ 版本已验证，继续部署"
```

**Step 5: 执行生产部署**

与 staging 相同的流程，但：
- 使用 `odoo18-prod` 配置
- 使用生产数据库
- 使用生产域名 (https://demo.nagashiro.top)

**Step 6: Smoke Tests 生产版**

- Test 1: Docker Compose 配置有效 ✓
- Test 2: 所有容器健康 ✓
- Test 3: 生产域名可访问 ✓
- Test 4: 依赖服务可用 ✓

如果任何测试失败 → **自动回滚到上一个版本**

**Step 7: 验证上线**

访问 https://demo.nagashiro.top/

- 测试关键业务流程
- 监控错误日志
- 检查性能指标

### 工作流 3: 回滚（出现问题时）

**场景**: 部署后发现问题，需要回滚

#### 自动回滚

如果 Smoke Tests 失败，**自动触发回滚**:

```bash
# deploy.sh 检测到测试失败
echo "❌ Smoke tests failed. Attempting rollback..."

# 调用 rollback.sh
/opt/seisei-odoo-addons/scripts/rollback.sh odoo18-staging staging 1

# 回滚到上一个版本
```

#### 手动回滚

如果部署后发现问题，可以手动回滚:

**方法 1: 使用 GitHub Actions (推荐)**

访问: https://github.com/cameltravel666-crypto/seisei-odoo-addons/actions/workflows/rollback.yml

| 参数 | 值 |
|------|-----|
| **stack** | `odoo18-prod` |
| **environment** | `production` |
| **steps_back** | `1` (回滚到上一个版本) |

**方法 2: SSH 手动回滚**

```bash
ssh -i /path/to/key ubuntu@54.65.127.141

# 回滚 odoo18-prod 到上一个版本
sudo /opt/seisei-odoo-addons/scripts/rollback.sh odoo18-prod production 1

# 回滚到指定版本
sudo /opt/seisei-odoo-addons/scripts/rollback.sh odoo18-prod production --target sha-abc123
```

**回滚速度**: ~10 秒（符号链接切换 + 容器重启）

### 工作流 4: Break-Glass 紧急部署（仅生产）

**什么是 Break-Glass？**

紧急情况下跳过 Verified Gate 的机制，用于:
- 🔥 生产环境紧急修复
- 🔥 安全漏洞快速补丁
- 🔥 Staging 环境损坏，无法验证

⚠️ **警告**:
- 滥用 Break-Glass 会破坏部署安全
- 每次使用都会被审计记录
- 需要填写详细原因

#### 使用步骤

**Step 1: 触发部署**

| 参数 | 值 |
|------|-----|
| **environment** | `production` |
| **stack** | `odoo18-prod` |
| **image_tag** | `sha-{hotfix}` |
| **break_glass** | ✅ **勾选** |
| **break_glass_reason** | `Critical security patch for CVE-2024-XXXX` |

**Step 2: Josh 审批**

- Josh 会看到 Break-Glass 警告
- 必须审查原因是否合理
- 批准或拒绝

**Step 3: 部署跳过 Verified Gate**

```bash
# deploy.sh 检测到 break_glass
if [ "$BREAK_GLASS" = "true" ]; then
    echo "⚠️  BREAK-GLASS DEPLOYMENT"
    echo "Reason: $BREAK_GLASS_REASON"
    echo "Skipping verified gate check..."
    # 不检查 verified，直接部署
fi
```

**Step 4: 审计记录**

```bash
# /srv/deploy-history.log
2026-01-31 10:23:45 | odoo18-prod | prod | deploy | sha-hotfix | success | BREAK_GLASS: Critical security patch for CVE-2024-XXXX
```

---

## 操作手册

### 1. 日常部署检查清单

#### 部署前检查

- [ ] 代码已合并到 main 分支
- [ ] Build workflow 已成功完成
- [ ] image-digests artifact 已生成
- [ ] 本地测试已通过
- [ ] 数据库迁移脚本已准备（如有）
- [ ] 通知团队即将部署

#### Staging 部署

- [ ] 触发 Deploy to Staging workflow
- [ ] 等待部署完成（~1分钟）
- [ ] 检查 Smoke Tests 全部通过
- [ ] 手动测试关键功能
- [ ] 检查日志无异常
- [ ] 标记为 verified

#### Production 部署

- [ ] 确认 Staging 已验证
- [ ] 触发 Deploy to Production workflow
- [ ] 等待 Josh 审批
- [ ] 等待部署完成
- [ ] 监控 Smoke Tests
- [ ] 监控生产环境指标
- [ ] 通知团队部署完成

#### 部署后检查

- [ ] 访问生产域名确认正常
- [ ] 检查关键业务流程
- [ ] 监控错误日志（至少15分钟）
- [ ] 检查数据库连接
- [ ] 检查第三方集成（OCR、S3）
- [ ] 更新部署文档

### 2. 服务器维护

#### 清理旧 releases

```bash
# 自动清理（保留最近10个）
sudo /opt/seisei-odoo-addons/scripts/deploy.sh --cleanup odoo18-staging

# 手动清理
cd /srv/releases/stacks/odoo18-staging
sudo rm -rf sha-old-release__*
```

#### 清理 Docker 镜像

```bash
# 查看镜像占用
docker images | grep seisei-odoo18

# 清理未使用的镜像
docker image prune -a --filter "until=720h"  # 30天前
```

#### 更新部署脚本

```bash
ssh -i /path/to/key ubuntu@54.65.127.141

cd /opt/seisei-odoo-addons
sudo git fetch origin
sudo git reset --hard origin/main

# 验证脚本完整性
/opt/seisei-odoo-addons/scripts/deploy.sh --version
```

### 3. 监控与告警

#### 查看当前部署状态

```bash
# 查看当前运行的版本
cat /srv/releases/current/odoo18-staging.json | jq .

# 查看部署历史
tail -20 /srv/deploy-history.log

# 查看容器状态
cd /srv/stacks/odoo18-staging
sudo docker compose ps
```

#### 查看日志

```bash
# Odoo 应用日志
sudo docker logs odoo18-staging-web -f --tail 100

# Redis 日志
sudo docker logs odoo18-staging-redis -f --tail 50

# 系统日志
journalctl -u docker -f
```

#### 健康检查

```bash
# 本地健康检查
curl http://localhost:8069/web/health

# 公网健康检查
curl https://staging.odoo.seisei.tokyo/web/health

# 容器健康状态
docker inspect odoo18-staging-web | jq '.[0].State.Health'
```

### 4. 常见操作

#### 重启服务（不改变版本）

```bash
cd /srv/stacks/odoo18-staging
sudo docker compose restart web
```

#### 查看环境变量

```bash
cat /srv/stacks/odoo18-staging/.env
```

#### 进入容器调试

```bash
# 进入 Odoo 容器
sudo docker exec -it odoo18-staging-web bash

# 查看 Odoo 版本
odoo --version

# 查看 Python 依赖
pip list | grep -i odoo
```

#### 手动运行 Smoke Tests

```bash
cd /opt/seisei-odoo-addons
./scripts/lib.sh

# 测试单个堆栈
smoke_test odoo18-staging
```

---

## 故障排查

### 问题 1: 部署失败 - 镜像拉取失败

**症状**:
```
Error response from daemon: manifest for ghcr.io/.../seisei-odoo18:sha-xxx not found
```

**原因**:
- Build workflow 未完成
- 镜像标签错误
- GHCR 认证失败

**解决**:

1. 检查 Build workflow 是否成功:
   ```
   https://github.com/cameltravel666-crypto/seisei-odoo-addons/actions/workflows/build_ghcr.yml
   ```

2. 验证镜像存在:
   ```bash
   # 在服务器上
   docker pull ghcr.io/cameltravel666-crypto/seisei-odoo18:sha-724f892
   ```

3. 检查 GitHub token 权限:
   - Settings → Secrets → GITHUB_TOKEN
   - 需要 `packages: read` 权限

### 问题 2: Smoke Test 失败 - 域名不可访问

**症状**:
```
[✗] Domain not accessible: https://staging.odoo.seisei.tokyo (HTTP 000000)
```

**原因**:
- DNS 未配置
- Traefik 未运行
- 容器未启动
- 数据库连接失败

**解决**:

1. 检查 DNS:
   ```bash
   nslookup staging.odoo.seisei.tokyo
   # 应该返回 54.65.127.141
   ```

2. 检查容器状态:
   ```bash
   cd /srv/stacks/odoo18-staging
   sudo docker compose ps
   # 所有容器应该 (healthy)
   ```

3. 检查 Odoo 日志:
   ```bash
   sudo docker logs odoo18-staging-web --tail 50
   # 查找错误信息
   ```

4. 检查数据库连接:
   ```bash
   # 查看 .env 配置
   cat /srv/stacks/odoo18-staging/.env | grep DB_

   # 测试数据库连接
   docker exec -it seisei-db psql -U odoo -c "SELECT version();"
   ```

5. 检查 Traefik:
   ```bash
   cd /srv/stacks/edge-traefik
   sudo docker compose ps
   # traefik 应该运行中
   ```

### 问题 3: 部署成功但网站 404

**症状**: 部署显示成功，但访问域名返回 404

**原因**:
- 错误的镜像（如 Next.js 而非 Odoo）
- 端口映射错误
- Traefik 路由配置错误

**解决**:

1. 检查运行的镜像:
   ```bash
   docker inspect odoo18-staging-web | jq -r '.[0].Config.Image'
   # 应该是 Odoo 镜像，带 sha256 digest
   ```

2. 检查容器内容:
   ```bash
   # 检查是否有 odoo 命令
   docker exec odoo18-staging-web which odoo
   # 应该返回 /usr/bin/odoo
   ```

3. 检查 Traefik labels:
   ```bash
   docker inspect odoo18-staging-web | jq '.[0].Config.Labels' | grep traefik
   # 检查 Host() 规则是否正确
   ```

4. 测试本地端口:
   ```bash
   curl http://localhost:8069/web/health
   # 应该返回 200 OK
   ```

### 问题 4: 生产部署被 Verified Gate 阻止

**症状**:
```
❌ Version sha-xxx is NOT verified for odoo18-prod
```

**原因**:
- 未在 staging 部署此版本
- 未标记为 verified

**解决**:

1. 检查 verified 状态:
   ```bash
   cat /srv/releases/verified/odoo18-staging.txt
   ```

2. 确认 staging 部署:
   ```bash
   cat /srv/releases/current/odoo18-staging.json | jq '.image_tag'
   ```

3. 标记为 verified:
   ```bash
   echo "sha-724f892" | sudo tee /srv/releases/verified/odoo18-staging.txt
   ```

4. 如果紧急情况，使用 Break-Glass:
   - 勾选 `break_glass`
   - 填写详细原因

### 问题 5: 回滚失败 - 找不到历史版本

**症状**:
```
[✗] No deployment found 1 steps back in history
```

**原因**:
- 部署历史不足
- 所有旧版本都失败了

**解决**:

1. 查看部署历史:
   ```bash
   grep "odoo18-staging.*success" /srv/deploy-history.log | tail -5
   ```

2. 查看可用的 releases:
   ```bash
   ls -lt /srv/releases/stacks/odoo18-staging/
   ```

3. 手动切换到已知良好版本:
   ```bash
   cd /srv/stacks
   sudo ln -sfn /srv/releases/stacks/odoo18-staging/sha-abc123__timestamp odoo18-staging
   cd odoo18-staging
   sudo docker compose up -d
   ```

### 问题 6: SSH 部署失败 - 权限被拒绝

**症状**:
```
sudo: a password is required
```

**原因**: sudoers 配置未正确设置

**解决**:

1. SSH 到服务器:
   ```bash
   ssh -i /path/to/key ubuntu@54.65.127.141
   ```

2. 检查 sudoers 配置:
   ```bash
   sudo cat /etc/sudoers.d/deploy-scripts
   ```

3. 应该包含:
   ```
   ubuntu ALL=(ALL) NOPASSWD: /opt/seisei-odoo-addons/scripts/deploy.sh, /opt/seisei-odoo-addons/scripts/rollback.sh
   ```

4. 测试 sudo:
   ```bash
   sudo /opt/seisei-odoo-addons/scripts/deploy.sh --help
   # 不应该要求密码
   ```

### 问题 7: 数据库密码认证失败

**症状**:
```
Database connection failure: password authentication failed for user "odoo"
```

**原因**: .env 中的密码与数据库实际密码不匹配

**解决**:

1. 检查数据库实际密码:
   ```bash
   docker inspect seisei-db | jq -r '.[0].Config.Env[] | select(contains("POSTGRES_PASSWORD"))'
   # 输出: POSTGRES_PASSWORD=odoo
   ```

2. 检查 .env 配置:
   ```bash
   cat /srv/stacks/odoo18-staging/.env | grep DB_PASSWORD
   # 应该匹配数据库密码
   ```

3. 更新密码:
   ```bash
   cd /srv/stacks/odoo18-staging
   sudo sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=odoo/' .env
   sudo docker compose restart web
   ```

4. 更新源配置（避免下次部署出错）:
   ```bash
   cd /opt/seisei-odoo-addons
   sudo vi infra/stacks/odoo18-staging/.env.example
   # 修改 DB_PASSWORD
   sudo git add .
   sudo git commit -m "fix: update DB_PASSWORD"
   sudo git push origin main
   ```

---

## 安全与合规

### 1. 访问控制

#### GitHub 权限

| 角色 | 权限 | 说明 |
|------|------|------|
| **Josh** | Admin | 审批 production 部署 |
| **技术团队** | Maintain | 触发部署，查看日志 |
| **只读成员** | Read | 查看代码，无法部署 |

#### 服务器访问

| 用户 | 权限 | 用途 |
|------|------|------|
| **ubuntu** | sudo (有限) | 运行部署脚本 |
| **deployer** | 无 sudo | Release 文件所有者 |
| **root** | 完全控制 | 紧急维护（不推荐日常使用） |

### 2. 密钥管理

#### GitHub Secrets

必需的 secrets:

```
DEPLOY_SSH_KEY        - 服务器 SSH 私钥（ubuntu 用户）
DEPLOY_SSH_HOST       - 服务器 IP（54.65.127.141）
DEPLOY_SSH_USER       - SSH 用户名（ubuntu）
```

⚠️ **警告**:
- 永远不要在代码中硬编码密钥
- 定期轮换 SSH 密钥（每 90 天）
- 使用 GitHub Environments 隔离 staging/production secrets

#### 服务器密钥

```bash
# 数据库密码
/srv/stacks/odoo18-staging/.env (DB_PASSWORD)

# S3 密钥
/srv/stacks/odoo18-staging/.env (SEISEI_S3_ACCESS_KEY, SEISEI_S3_SECRET_KEY)

# OCR 服务密钥
/srv/stacks/odoo18-staging/.env (OCR_SERVICE_KEY)
```

⚠️ **安全措施**:
- .env 文件权限: 600 (仅 root 可读写)
- 不要提交 .env 到 Git（已在 .gitignore）
- 定期审计密钥使用日志

### 3. 审计日志

#### 部署历史

```bash
# 查看所有部署
cat /srv/deploy-history.log

# 查看失败的部署
grep "failed" /srv/deploy-history.log

# 查看 Break-Glass 部署
grep "BREAK_GLASS" /srv/deploy-history.log

# 查看特定版本
grep "sha-724f892" /srv/deploy-history.log
```

#### GitHub Actions 日志

- 所有 workflow 运行记录保留 90 天
- 包含完整的部署输出
- 记录触发者、审批者

### 4. 合规要求

#### SOC2 / ISO27001

- ✅ 所有部署需审批（production）
- ✅ 完整的审计日志
- ✅ 不可变基础设施
- ✅ 自动安全扫描（容器镜像）
- ✅ 最小权限原则

#### GDPR

- ✅ 数据库密码加密存储
- ✅ 访问日志记录
- ✅ 可追溯的变更历史

---

## 附录

### A. 术语表

| 术语 | 定义 |
|------|------|
| **Image Tag** | 镜像标签，如 `sha-724f892`，可变 |
| **Image Digest** | 镜像 SHA256 哈希，如 `sha256:1db6436...`，不可变 |
| **Release** | 一次部署的完整配置快照 |
| **Release ID** | 格式: `sha-{commit}__{timestamp}` |
| **Smoke Test** | 部署后自动运行的基本功能测试 |
| **Verified Gate** | 生产部署前检查 staging 是否已验证 |
| **Break-Glass** | 紧急情况下跳过安全检查的机制 |
| **Atomic Switch** | 通过符号链接原子切换，零停机 |
| **Rollback** | 回滚到之前的版本 |
| **GHCR** | GitHub Container Registry，镜像仓库 |

### B. 快速参考

#### 重要 URL

| 用途 | URL |
|------|-----|
| **GitHub Repo** | https://github.com/cameltravel666-crypto/seisei-odoo-addons |
| **Build Workflow** | https://github.com/.../actions/workflows/build_ghcr.yml |
| **Deploy Workflow** | https://github.com/.../actions/workflows/deploy.yml |
| **Rollback Workflow** | https://github.com/.../actions/workflows/rollback.yml |
| **Staging 网站** | https://staging.odoo.seisei.tokyo |
| **Production 网站** | https://demo.nagashiro.top |

#### 服务器路径

| 用途 | 路径 |
|------|------|
| **脚本源码** | `/opt/seisei-odoo-addons/scripts/` |
| **配置源码** | `/opt/seisei-odoo-addons/infra/stacks/` |
| **Release 存储** | `/srv/releases/stacks/{stack}/` |
| **当前部署** | `/srv/stacks/{stack}/ (symlink)` |
| **部署历史** | `/srv/deploy-history.log` |
| **Verified 标记** | `/srv/releases/verified/{stack}.txt` |

#### 关键命令

```bash
# 查看当前版本
cat /srv/releases/current/odoo18-staging.json | jq .

# 查看容器状态
cd /srv/stacks/odoo18-staging && sudo docker compose ps

# 查看日志
sudo docker logs odoo18-staging-web -f --tail 100

# 重启服务
cd /srv/stacks/odoo18-staging && sudo docker compose restart web

# 手动回滚
sudo /opt/seisei-odoo-addons/scripts/rollback.sh odoo18-staging staging 1

# 更新脚本
cd /opt/seisei-odoo-addons && sudo git pull origin main
```

### C. Stack 配置

#### odoo18-staging

- **域名**: https://staging.odoo.seisei.tokyo
- **数据库**: seisei-db (共享，使用 staging 数据库)
- **容器名**:
  - `odoo18-staging-web`
  - `odoo18-staging-redis`
- **端口**: 8069 (HTTP), 8072 (Longpolling)
- **网络**:
  - `seisei-odoo-network` (连接数据库)
  - `odoo18-staging-internal` (内部通信)
  - `edge` (Traefik)

#### odoo18-prod

- **域名**: https://demo.nagashiro.top
- **数据库**: seisei-db (共享，使用 production 数据库)
- **容器名**:
  - `odoo18-prod-web`
  - `odoo18-prod-redis`
- **端口**: 18069 (HTTP), 18072 (Longpolling)
- **资源限制**:
  - Memory: 4G
  - CPU: 2.0

### D. 联系人

| 角色 | 联系方式 | 职责 |
|------|---------|------|
| **Josh** | josh@seisei.tokyo | 审批 production 部署 |
| **技术负责人** | tech-lead@seisei.tokyo | 部署决策，故障处理 |
| **运维团队** | ops@seisei.tokyo | 日常部署，监控 |
| **紧急联系** | oncall@seisei.tokyo | 24/7 on-call |

### E. 变更历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| 1.0 | 2026-01-31 | 初始版本，完整工作流文档 | Claude + Tech Team |

---

## 附加资源

- **Odoo 官方文档**: https://www.odoo.com/documentation/18.0/
- **Docker Compose 文档**: https://docs.docker.com/compose/
- **Traefik 文档**: https://doc.traefik.io/traefik/
- **GitHub Actions 文档**: https://docs.github.com/en/actions

---

**文档维护**: 请在每次重大变更后更新此文档。

**反馈**: 如有问题或改进建议，请提交 GitHub Issue。
