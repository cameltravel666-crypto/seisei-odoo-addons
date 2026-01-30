# Seisei-WWW GHCR镜像发布工作流

## 问题描述

**当前状态**：
- `seisei-www`使用本地pin tag: `seisei-www:pin-20260129-d75f3637`
- GHCR registry端`ghcr.io/seisei/www:latest`出现manifest unknown错误
- 生产环境无法可复现部署

**目标状态**：
- 使用GHCR sha tag: `ghcr.io/seisei/www:sha-<commit>`
- 每次push到main自动构建并推送
- 生产环境可以pull同一镜像复现

## 实施步骤

### 步骤1：在www仓库添加GitHub Actions Workflow

**文件路径**：`.github/workflows/docker-build.yml`（在seisei/www仓库根目录）

**文件内容**（见下方完整YAML）

**所需Secrets**：
- `GITHUB_TOKEN` - 自动提供，无需手动配置（用于推送到GHCR）

### 步骤2：启用GitHub Packages权限

1. 在seisei/www仓库设置中：
   - Settings → Actions → General
   - Workflow permissions → 选择 "Read and write permissions"
   - 勾选 "Allow GitHub Actions to create and approve pull requests"
   - 保存

2. 验证GHCR包可见性：
   - Settings → Packages（如果包已创建）
   - 设置包为Public（如果需要公开访问）

### 步骤3：触发首次构建

```bash
# 在www仓库中
git add .github/workflows/docker-build.yml
git commit -m "feat: Add GHCR sha-tag build workflow"
git push origin main

# 查看Actions页面验证构建成功
```

### 步骤4：更新web-seisei stack配置

**在服务器上**（`/srv/stacks/web-seisei`或`/home/ubuntu/biznexus/infra/stacks/web-seisei`）：

1. 更新`docker-compose.yml`：
```yaml
services:
  web:
    image: ghcr.io/seisei/www:${WWW_IMAGE_TAG:-sha-d75f3637}
    # ... 其他配置不变
```

2. 更新`.env`：
```bash
WWW_IMAGE_TAG=sha-d75f3637  # 替换为实际commit SHA
```

3. 更新`.env.example`：
```bash
# Seisei WWW Image Tag
# ⚠️  PRODUCTION: Use git SHA tag (e.g., sha-d75f3637), NOT 'latest'
# Get current SHA: git log --oneline -1 | awk '{print "sha-"$1}'
WWW_IMAGE_TAG=sha-d75f3637
```

### 步骤5：验证部署

```bash
# 同步stack到/srv（如果需要）
sudo /opt/seisei-odoo-addons/scripts/sync_to_srv.sh web-seisei

# 部署到staging测试
sudo /opt/seisei-odoo-addons/scripts/deploy.sh web-seisei staging sha-<new-commit>

# 测试通过后部署到生产
sudo /opt/seisei-odoo-addons/scripts/deploy.sh web-seisei prod sha-<new-commit>
```

## GitHub Actions Workflow文件

**文件位置**：`seisei/www` 仓库的 `.github/workflows/docker-build.yml`

```yaml
name: Build and Push WWW Docker Image

on:
  push:
    branches:
      - main
    paths-ignore:
      - '**.md'
      - 'docs/**'
  pull_request:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  build-and-push:
    name: Build and Push to GHCR
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/seisei/www
          tags: |
            # Git commit SHA (short, 7 chars)
            type=sha,prefix=sha-,format=short
            # Branch name
            type=ref,event=branch
            # Latest on main
            type=raw,value=latest,enable={{is_default_branch}}
            # Release tags (if pushed)
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
          labels: |
            org.opencontainers.image.title=Seisei WWW
            org.opencontainers.image.description=Seisei BizNexus web application
            org.opencontainers.image.vendor=Seisei

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile
          platforms: linux/amd64
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=registry,ref=ghcr.io/seisei/www:latest
          cache-to: type=inline

      - name: Output image tags
        run: |
          echo "### 🐳 Docker Image Built" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Tags:**" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          echo "${{ steps.meta.outputs.tags }}" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Deploy command:**" >> $GITHUB_STEP_SUMMARY
          echo '```bash' >> $GITHUB_STEP_SUMMARY
          echo "# On server:" >> $GITHUB_STEP_SUMMARY
          echo "sudo /opt/seisei-odoo-addons/scripts/deploy.sh web-seisei staging sha-${GITHUB_SHA::7}" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
```

## 故障排查

### 问题1：镜像推送权限错误

**错误**：`denied: permission_denied`

**解决**：
1. 检查Workflow permissions设置（Settings → Actions → General）
2. 确保`GITHUB_TOKEN`有write权限
3. 如果是组织仓库，检查组织级别的Package权限

### 问题2：镜像拉取失败（manifest unknown）

**错误**：`manifest unknown: manifest unknown`

**解决**：
1. 确认镜像已成功推送（查看Actions日志）
2. 验证镜像标签正确：`docker manifest inspect ghcr.io/seisei/www:sha-<commit>`
3. 如果是私有包，需要`docker login ghcr.io`

### 问题3：本地旧镜像冲突

**问题**：本地仍使用pin tag，无法切换到GHCR

**解决**：
```bash
# 删除本地pin tag镜像
docker rmi seisei-www:pin-20260129-d75f3637

# 清理悬空镜像
docker image prune -f

# 强制拉取新镜像
cd /srv/stacks/web-seisei
docker compose pull --no-cache
docker compose up -d --force-recreate
```

## 验证清单

- [ ] GitHub Actions workflow添加到www仓库
- [ ] Workflow permissions配置正确
- [ ] 推送commit触发构建成功
- [ ] GHCR显示新镜像（ghcr.io/seisei/www:sha-xxxxx）
- [ ] 本地可以pull镜像：`docker pull ghcr.io/seisei/www:sha-xxxxx`
- [ ] docker-compose.yml更新使用${WWW_IMAGE_TAG}
- [ ] .env配置正确的SHA tag
- [ ] 部署脚本可以成功拉取并部署

## 相关文档

- [IMAGE_STRATEGY.md](IMAGE_STRATEGY.md) - 镜像策略
- [DEPLOYMENT.md](DEPLOYMENT.md) - 部署指南
- [GitHub Packages文档](https://docs.github.com/en/packages)

## 维护者

- DevOps Team
- 最后更新：2026-01-30
