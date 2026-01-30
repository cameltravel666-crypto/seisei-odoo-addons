# Docker镜像策略

## 目标

- ✅ 所有服务使用预构建镜像，服务器**只pull不build**
- ✅ 使用Git SHA作为镜像tag，实现可追溯部署
- ✅ 支持快速回滚到任意历史版本
- ✅ staging和production使用相同镜像，仅配置不同

## 镜像命名规范

### 格式

```
ghcr.io/{GITHUB_REPO_OWNER}/{service}:{git_sha}
```

### 示例

```bash
# Odoo18生产环境
ghcr.io/cameltravel666-crypto/seisei-odoo18:sha-19b9b98

# OCR服务
ghcr.io/cameltravel666-crypto/ocr-service:sha-abc1234

# 前端Web
ghcr.io/cameltravel666-crypto/www:sha-def5678
```

## 服务映射表

| 服务 | 镜像名 | 构建路径 | Dockerfile |
|------|--------|----------|-----------|
| **odoo18-prod** | `seisei-odoo18` | 项目根目录 | `infra/stacks/odoo18-prod/Dockerfile` |
| **ocr** | `ocr-service` | OCR服务仓库 | 独立仓库 |
| **web-seisei** | `www` | 前端仓库 | 独立仓库 |
| **erp-seisei** | `erp` | ERP服务仓库 | 独立仓库 |
| **crm-api** | `crm-api` | CRM仓库 | 独立仓库 |

## Tag策略

### 主要Tag

- **`sha-<git_sha>`** - 每次commit自动构建（推荐用于生产）
  - 例: `sha-19b9b98`
  - 完全可追溯
  - 永不变更

### 辅助Tag

- **`latest`** - 指向main分支最新commit
  - 自动更新
  - 仅用于开发/测试环境

- **`v<version>`** - 发布版本tag
  - 例: `v1.2.3`
  - 手动创建
  - 用于重要里程碑

## GitHub Actions工作流

### 构建并推送镜像

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-odoo18:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

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
          images: ghcr.io/${{ github.repository_owner }}/seisei-odoo18
          tags: |
            type=sha,prefix=sha-,format=short
            type=ref,event=branch
            type=semver,pattern={{version}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: infra/stacks/odoo18-prod/Dockerfile
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=registry,ref=ghcr.io/${{ github.repository_owner }}/seisei-odoo18:latest
          cache-to: type=inline
```

## 部署流程

### 1. 自动构建（CI）

```bash
# main分支每次push自动触发
git push origin main

# GitHub Actions自动：
# 1. 构建镜像
# 2. 推送到 ghcr.io/owner/seisei-odoo18:sha-<commit>
# 3. 更新 latest tag
```

### 2. 部署到环境（CD）

```bash
# 在服务器上执行
cd /root/seisei-odoo-addons/infra/stacks/odoo18-prod

# 更新.env文件指定镜像版本
echo "ODOO18_IMAGE_TAG=sha-19b9b98" >> .env

# 拉取并部署
docker compose pull
docker compose up -d
```

### 3. 验证部署

```bash
# 检查运行中的容器
docker compose ps

# 查看镜像版本
docker inspect odoo18-prod-web | grep Image

# 健康检查
curl -f http://localhost:8069/web/health
```

## 环境变量配置

### .env文件示例

```bash
# GitHub Container Registry
GITHUB_REPO_OWNER=cameltravel666-crypto

# Odoo18镜像tag（使用git SHA）
ODOO18_IMAGE_TAG=sha-19b9b98

# OCR服务镜像tag
OCR_IMAGE_TAG=sha-abc1234

# 其他服务配置...
```

## 回滚流程

```bash
# 1. 查看历史部署
git log --oneline -10

# 2. 选择要回滚的版本
ROLLBACK_SHA=4b1ce21

# 3. 更新环境变量
cd /root/seisei-odoo-addons/infra/stacks/odoo18-prod
sed -i "s/ODOO18_IMAGE_TAG=.*/ODOO18_IMAGE_TAG=sha-${ROLLBACK_SHA}/" .env

# 4. 拉取旧版本镜像
docker compose pull

# 5. 重新部署
docker compose up -d

# 6. 验证
docker compose ps
curl -f http://localhost:8069/web/health
```

## 最佳实践

### ✅ 推荐

- 使用git SHA tag部署生产环境
- staging和production使用相同镜像
- 部署前在staging环境测试
- 记录每次部署的SHA和时间
- 保留最近10个镜像版本

### ❌ 避免

- 在生产环境使用`latest` tag
- 在服务器上本地构建镜像
- 跳过staging直接部署到生产
- 使用相同tag覆盖已有镜像
- 删除正在使用的镜像版本

## 监控与维护

### 镜像清理

```bash
# 查看所有镜像
docker images | grep seisei-odoo18

# 删除旧的未使用镜像（保留最近10个）
docker image prune -a --filter "label=org.opencontainers.image.source=https://github.com/owner/repo"
```

### 镜像仓库配额

- GitHub Packages: 500MB免费存储
- 超出部分按使用量计费
- 定期清理未使用的镜像

## 故障排查

### 镜像拉取失败

```bash
# 1. 检查认证
docker login ghcr.io -u $GITHUB_USERNAME

# 2. 验证镜像存在
docker manifest inspect ghcr.io/owner/seisei-odoo18:sha-19b9b98

# 3. 检查网络
ping ghcr.io

# 4. 查看详细日志
docker compose pull --verbose
```

### 版本不匹配

```bash
# 检查运行中的镜像
docker inspect odoo18-prod-web | jq '.[0].Config.Image'

# 检查compose配置
docker compose config | grep image

# 检查环境变量
env | grep IMAGE_TAG
```
