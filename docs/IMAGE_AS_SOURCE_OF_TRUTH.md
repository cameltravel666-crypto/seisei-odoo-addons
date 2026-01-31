# Image as Source of Truth - Deployment Architecture

## 概述

本系统采用"镜像即真相（Image as Source of Truth）"部署模式，这是一种业界最佳实践，确保生产环境的不可变性、可追溯性和安全性。

## 核心原则

### 1. Release 固化（Release Solidification）
每次部署都将完整的 stack 配置复制到独立的 release 目录，确保每个版本完全隔离。

```
/srv/releases/stacks/<stack>/<release_id>/
  ├── docker-compose.yml
  ├── config/
  ├── .env (包含 IMAGE_REF=image@sha256:...)
  └── ...
```

### 2. Digest Pinning（摘要固定）
使用 Docker image digest 而非 tag，确保部署的镜像永远不变。

```bash
# 旧方式（不可靠）
image: ghcr.io/org/app:sha-abc123  # tag 可被覆盖

# 新方式（可靠）
image: ghcr.io/org/app@sha256:def456...  # digest 永远指向同一二进制
```

### 3. Production Verified Gate（生产验收卡点）
生产部署必须经过 staging 验证，人工确认后才能部署。

```bash
# Staging 测试通过后
sudo touch /srv/releases/verified/sha-abc123

# Production 部署时会检查该文件是否存在
```

### 4. 禁止服务器 git pull
- `/opt/seisei-odoo-addons` 仅用于存放运维脚本（deploy.sh, rollback.sh 等）
- 运行态的 stack 配置完全来自 `/srv/releases/stacks/`
- 不再通过 git pull 修改运行态配置

### 5. Current Manifest（当前状态清单）
每次部署/回滚后都写入 JSON manifest，清楚记录当前运行的版本。

```json
{
  "stack": "odoo18-prod",
  "env": "production",
  "image_tag": "sha-abc123",
  "image_ref": "ghcr.io/.../seisei-odoo18@sha256:def456...",
  "image_digest": "sha256:def456...",
  "release_id": "sha-abc123__20260131T120000Z",
  "release_dir": "/srv/releases/stacks/odoo18-prod/sha-abc123__20260131T120000Z",
  "deployed_at_utc": "2026-01-31T12:05:00Z",
  "actor": "github-actions",
  "run_id": "123456",
  "break_glass": false,
  "break_glass_reason": ""
}
```

## 目录结构

```
/srv/
├── stacks/                          # 当前运行态（symlinks）
│   ├── odoo18-prod -> /srv/releases/stacks/odoo18-prod/sha-abc123__20260131T120000Z
│   ├── odoo18-staging -> /srv/releases/stacks/odoo18-staging/sha-def456__20260131T110000Z
│   └── erp-seisei -> /srv/releases/stacks/erp-seisei/sha-ghi789__20260130T180000Z
│
├── releases/
│   ├── stacks/                      # 所有历史 release（固化副本）
│   │   ├── odoo18-prod/
│   │   │   ├── sha-abc123__20260131T120000Z/  # 最新
│   │   │   ├── sha-xyz111__20260130T150000Z/  # 上一版本
│   │   │   └── sha-old222__20260129T100000Z/  # 更早版本
│   │   ├── odoo18-staging/
│   │   │   └── sha-def456__20260131T110000Z/
│   │   └── erp-seisei/
│   │       └── sha-ghi789__20260130T180000Z/
│   │
│   ├── verified/                    # Staging 验证标记
│   │   ├── sha-abc123               # 该版本已在 staging 测试通过
│   │   └── sha-def456
│   │
│   ├── current/                     # 当前部署清单
│   │   ├── odoo18-prod.json
│   │   ├── odoo18-staging.json
│   │   └── erp-seisei.json
│   │
│   └── deploy_history.log           # 所有部署历史记录
│
└── backups/                         # 备份（deploy.sh 自动创建）
    └── ...

/opt/
└── seisei-odoo-addons/              # 仅用于运维脚本
    ├── scripts/
    │   ├── deploy.sh                # 部署脚本
    │   ├── rollback.sh              # 回滚脚本
    │   └── ...
    ├── infra/stacks/                # Stack 配置源（被复制到 /srv/releases）
    │   ├── odoo18-prod/
    │   ├── odoo18-staging/
    │   └── erp-seisei/
    └── .github/workflows/           # CI/CD 配置
```

## 完整部署流程

### 1. 代码开发与提交

```bash
# 本地 Mac
git checkout -b feature/new-feature
# 开发...
git commit -m "feat: add new feature"
git push origin feature/new-feature
# 创建 Pull Request → Code Review → Merge to main
```

### 2. 自动构建镜像

```yaml
# .github/workflows/build_ghcr.yml (自动触发)
# 1. 构建 Docker 镜像
# 2. 推送到 GHCR with tag: sha-abc123
# 3. 获取 image digest
# 4. 生成 digest manifest JSON
# 5. 上传为 artifact: image-digests
```

**产出的 digest manifest**:
```json
{
  "git_sha": "abc123...",
  "git_sha7": "abc123",
  "built_at_utc": "2026-01-31T10:00:00Z",
  "images": {
    "seisei-odoo18": {
      "tag": "sha-abc123",
      "ref": "ghcr.io/cameltravel666-crypto/seisei-odoo18@sha256:def456...",
      "digest": "sha256:def456..."
    },
    "seisei-ocr": {
      "tag": "sha-abc123",
      "ref": "ghcr.io/cameltravel666-crypto/seisei-ocr@sha256:ghi789...",
      "digest": "sha256:ghi789..."
    }
  }
}
```

### 3. 部署到 Staging

```yaml
# GitHub Actions → Deploy to Environment
# Input:
#   environment: staging
#   stack: odoo18-staging
#   image_tag: sha-abc123

# Workflow 执行：
# 1. 下载 image-digests artifact
# 2. 验证 digest manifest
# 3. SCP manifest 到服务器 /tmp/image-digests.json
# 4. SSH 执行：
sudo /opt/seisei-odoo-addons/scripts/deploy.sh \
  odoo18-staging staging sha-abc123 \
  --digest-file /tmp/image-digests.json \
  --actor "github-actions" \
  --run-id "123456"
```

**deploy.sh 执行流程**:
1. 解析 digest manifest，提取 IMAGE_REF (image@sha256:...)
2. 跳过 verified gate（staging 环境）
3. 复制 `/opt/seisei-odoo-addons/infra/stacks/odoo18-staging/` 到 `/srv/releases/stacks/odoo18-staging/sha-abc123__20260131T120000Z/`
4. 更新 release 中的 `.env` 文件：`IMAGE_REF=ghcr.io/.../seisei-odoo18@sha256:def456...`
5. 原子切换 symlink: `/srv/stacks/odoo18-staging -> /srv/releases/stacks/odoo18-staging/sha-abc123__20260131T120000Z`
6. 在 `/srv/stacks/odoo18-staging` 执行 `docker compose pull` 和 `up -d --force-recreate`
7. 健康检查（smoke tests）
8. 写入 current manifest: `/srv/releases/current/odoo18-staging.json`
9. 记录到 deploy_history.log

**注意**: Staging 部署**不会**自动创建 verified 文件！

### 4. Josh 测试验收

```bash
# Josh 访问 staging 环境测试
https://staging.erp.seisei.tokyo

# 测试通过后，手动标记为 verified
sudo touch /srv/releases/verified/sha-abc123
```

### 5. 部署到 Production

```yaml
# GitHub Actions → Deploy to Environment
# Input:
#   environment: production  # ← 会触发 GitHub Environment 审批
#   stack: odoo18-prod
#   image_tag: sha-abc123

# Workflow 执行流程同 Staging
```

**deploy.sh 关键差异（Production）**:
1. **强制检查 verified**: 必须存在 `/srv/releases/verified/sha-abc123`
2. 如不存在且未使用 `--break-glass`，**部署直接失败**
3. 如使用 `--break-glass --reason "紧急安全补丁"`，可绕过但会记录到 manifest 和 history

### 6. 回滚（如需要）

```yaml
# GitHub Actions → Rollback Deployment
# Input:
#   environment: production
#   stack: odoo18-prod
#   steps_back: 1  # 回滚 1 个版本

# Workflow 执行：
sudo /opt/seisei-odoo-addons/scripts/rollback.sh \
  odoo18-prod production \
  --steps 1 \
  --actor "github-actions" \
  --run-id "789012"
```

**rollback.sh 执行流程**:
1. 从 deploy_history.log 查找上 N 次成功的部署
2. 确定目标 release_id
3. 原子切换 symlink 到目标 release 目录
4. 在目标 release 目录执行 `docker compose pull` 和 `up -d --force-recreate`
5. 健康检查（失败则自动继续回退，最多 3 次）
6. 更新 current manifest

## Break-glass 机制（紧急部署）

当生产环境出现紧急情况，需要绕过 verified gate 时：

```yaml
# GitHub Actions → Deploy to Environment
# Input:
#   environment: production
#   stack: odoo18-prod
#   image_tag: sha-def456
#   break_glass: true               # ← 紧急绕过
#   break_glass_reason: "Critical security patch CVE-2024-1234"
```

**Break-glass 规则**:
- 必须同时提供非空的 `reason`
- Reason 会记录到 current manifest 和 deploy_history.log
- 用于事后审计和合规检查

## 如何查看当前运行版本

### 方法 1: 查看 Current Manifest
```bash
cat /srv/releases/current/odoo18-prod.json | jq .
```

### 方法 2: 查看 Symlink
```bash
readlink -f /srv/stacks/odoo18-prod
# 输出: /srv/releases/stacks/odoo18-prod/sha-abc123__20260131T120000Z
```

### 方法 3: 查看容器镜像
```bash
cd /srv/stacks/odoo18-prod
docker compose images
# 输出: ghcr.io/.../seisei-odoo18@sha256:def456...
```

### 方法 4: 查看部署历史
```bash
grep "odoo18-prod" /srv/releases/deploy_history.log | tail -5
```

## 对比：旧 vs 新流程

| 维度 | 旧流程 | 新流程（Image as Source of Truth） |
|------|--------|----------------------------------|
| **运行态目录** | `/opt/seisei-odoo-addons/infra/stacks/` | `/srv/releases/stacks/<stack>/<release_id>/` |
| **镜像引用** | `IMAGE_TAG=sha-abc123` (tag 可变) | `IMAGE_REF=image@sha256:...` (digest 不可变) |
| **配置变更** | 直接修改 /opt/.../config/ | 必须重新部署（配置在 release 固化） |
| **git pull** | 允许在服务器 git pull | 严格禁止（仅 /opt 用于脚本） |
| **Production 卡点** | 无强制 gate | 必须 verified 文件（或 break-glass） |
| **回滚速度** | 需 pull 旧镜像 | 切换 symlink（秒级） |
| **审计能力** | 依赖 git log | Current manifest + history log |
| **存储占用** | 单份 stack | N 个 release 副本（需定期清理） |

## 维护与清理

### 清理旧 Release（建议每月执行）

```bash
# 保留每个 stack 最近 10 个 release，删除其余
for stack in $(ls /srv/releases/stacks/); do
  echo "Cleaning $stack ..."
  cd /srv/releases/stacks/$stack
  ls -t | tail -n +11 | xargs -r rm -rf
done
```

### 查看存储占用

```bash
du -sh /srv/releases/stacks/*
```

### 手动标记 Verified

```bash
# Josh 测试通过后
IMAGE_TAG="sha-abc123"
sudo touch /srv/releases/verified/$IMAGE_TAG
echo "Marked $IMAGE_TAG as verified"
```

## 故障排查

### 问题 1: Production 部署失败 - verified 文件不存在

```bash
# 错误信息
Version not verified: /srv/releases/verified/sha-abc123 does not exist

# 解决方案
# 1. 确认 Staging 已测试通过
# 2. 手动创建 verified 文件
sudo touch /srv/releases/verified/sha-abc123

# 或使用 break-glass（紧急情况）
# GitHub Actions → break_glass: true, break_glass_reason: "..."
```

### 问题 2: Symlink 指向错误

```bash
# 检查 symlink
readlink -f /srv/stacks/odoo18-prod

# 如果指向 /opt（错误）
# deploy.sh 会自动拒绝（安全检查）

# 手动修复（不推荐，应通过 deploy.sh）
sudo ln -sfn /srv/releases/stacks/odoo18-prod/sha-abc123__20260131T120000Z \
  /srv/stacks/odoo18-prod
```

### 问题 3: Digest manifest 找不到

```bash
# 错误信息
Digest manifest not found: dist/image-digests.json

# 原因：build workflow 未运行或失败
# 解决方案：
# 1. 确认 GitHub Actions build_ghcr.yml 已成功运行
# 2. 确认 artifact "image-digests" 已上传
# 3. deploy.yml 必须下载正确的 artifact
```

## 最佳实践

### 1. 始终通过 Staging 测试
- 不要跳过 staging 直接部署 production
- Josh 验收后再部署 production

### 2. 避免频繁 Break-glass
- Break-glass 是紧急机制，不是常规流程
- 每次 break-glass 都会被审计

### 3. 定期清理旧 Release
- 建议保留最近 10 个 release
- 至少每月清理一次

### 4. 监控 Digest Manifest
- 确保 build workflow 成功
- artifact 保留 90 天

### 5. 回滚测试
- 定期测试回滚流程
- 确保历史 release 可用

## FAQ

**Q: 如果我修改了 /opt/.../infra/stacks/odoo18-prod/config/odoo.conf，需要重新部署吗？**

A: 是的！旧流程中可以直接修改 /opt 下的配置，新流程中必须：
1. 在 Git 中修改 config/odoo.conf
2. 提交 + Push + Merge
3. 触发新的 build（生成新的 sha tag）
4. 重新部署

这确保了配置的不可变性和可追溯性。

**Q: Production 部署需要多久？**

A: 整个流程约 2-5 分钟：
- Release 固化（复制文件）: 5-10 秒
- Docker compose pull: 30-60 秒（如镜像已在缓存则更快）
- Container 重启: 30 秒
- 健康检查: 15 秒

**Q: 回滚需要多久？**

A: 秒级！因为只需切换 symlink，旧 release 的镜像和配置都已存在。

**Q: 如何查看某次部署的完整信息？**

A: 查看 current manifest:
```bash
cat /srv/releases/current/odoo18-prod.json | jq .
```

包含：image digest, release_id, 部署时间, 操作者, GitHub run_id, break-glass 状态等。

**Q: verified 文件可以手动删除吗？**

A: 可以，但不推荐。如果需要"取消验证"某个版本：
```bash
sudo rm /srv/releases/verified/sha-abc123
```

之后该版本无法部署到 production（除非使用 break-glass）。

**Q: 如果 smoke tests 失败会怎样？**

A: deploy.sh 会自动回滚到上一个成功的 release。rollback.sh 会继续尝试更早的 release（最多 3 次）。

## 参考资料

- **12-Factor App**: https://12factor.net/
- **GitOps Principles**: https://opengitops.dev/
- **Docker Digest**: https://docs.docker.com/engine/reference/commandline/images/#list-image-digests
- **SLSA Framework**: https://slsa.dev/

---

**文档版本**: 1.0
**最后更新**: 2026-01-31
**维护者**: DevOps Team
