#!/bin/bash
# ERP 完整部署脚本（本地执行）
# 用法: ./deploy-erp.sh [version]
#
# 此脚本安全地部署 ERP 到生产服务器，保护 .env 文件

set -e

VERSION=${1:-latest}
SERVER="ubuntu@54.65.127.141"
SSH_KEY="$HOME/Projects/Pem/odoo-2025.pem"
REMOTE_DIR="/srv/stacks/erp-seisei"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "ERP Seisei Deployment"
echo "Version: $VERSION"
echo "Server: $SERVER"
echo "=========================================="

# 检查 SSH key
if [ ! -f "$SSH_KEY" ]; then
    echo "[ERROR] SSH key not found: $SSH_KEY"
    exit 1
fi

SSH_CMD="ssh -i $SSH_KEY"
SCP_CMD="scp -i $SSH_KEY"

# 1. 同步文件（排除 .env）
echo ""
echo "[1/5] Syncing files (excluding .env)..."
rsync -avz --progress \
    --exclude '.env' \
    --exclude 'init-scripts/' \
    -e "ssh -i $SSH_KEY" \
    "$LOCAL_DIR/docker-compose.yml" \
    "$LOCAL_DIR/.env.example" \
    "$LOCAL_DIR/post-deploy.sh" \
    "$SERVER:$REMOTE_DIR/"

# 2. 确保 .env 存在
echo ""
echo "[2/5] Checking .env file..."
$SSH_CMD $SERVER "
    if [ ! -f $REMOTE_DIR/.env ]; then
        echo '[WARN] .env not found, copying from backup...'
        if [ -f /home/ubuntu/biznexus/infra/stacks/erp-seisei/.env ]; then
            cp /home/ubuntu/biznexus/infra/stacks/erp-seisei/.env $REMOTE_DIR/.env
            echo '.env restored from backup'
        else
            echo '[ERROR] No .env backup found!'
            exit 1
        fi
    else
        echo '.env exists'
    fi
"

# 3. 设置版本并拉取镜像
echo ""
echo "[3/5] Pulling images..."
$SSH_CMD $SERVER "
    cd $REMOTE_DIR
    export VERSION=$VERSION
    docker compose pull
"

# 4. 部署容器
echo ""
echo "[4/5] Deploying containers..."
$SSH_CMD $SERVER "
    cd $REMOTE_DIR
    export VERSION=$VERSION
    export DEPLOY_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    docker compose up -d --remove-orphans
"

# 5. 运行 post-deploy（同步密码）
echo ""
echo "[5/5] Running post-deploy..."
$SSH_CMD $SERVER "
    cd $REMOTE_DIR
    chmod +x post-deploy.sh
    ./post-deploy.sh
"

echo ""
echo "=========================================="
echo "Deployment completed!"
echo "=========================================="
echo ""
echo "Verify: https://erp.seisei.tokyo"
echo "Logs: ssh -i $SSH_KEY $SERVER 'docker logs seisei-erp-app --tail 50'"
