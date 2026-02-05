#!/bin/bash
# sync_secrets.sh - 从AWS Secrets Manager同步所有secrets到.env
# 用途：确保生产环境配置始终与Secrets Manager同步
# 执行频率：每次部署前 + 定时任务（每天）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$STACK_DIR/.env"

echo "=== Syncing Secrets from AWS Secrets Manager ==="
echo "Target: $ENV_FILE"

# 检查Capsule凭证
if [ ! -f ~/.aws/credentials ] || ! grep -q "\[capsule\]" ~/.aws/credentials 2>/dev/null; then
    echo "❌ ERROR: Capsule AWS credentials not configured"
    echo "Run: aws configure --profile capsule"
    exit 1
fi

# 备份现有.env
BACKUP_FILE="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP_FILE"
echo "✓ Backed up to: $BACKUP_FILE"

# 获取数据库密码
echo ""
echo "=== Fetching Database Credentials ==="
DB_SECRET=$(aws secretsmanager get-secret-value \
    --secret-id "seisei/prod/odoo/db-credentials" \
    --region ap-northeast-1 \
    --profile capsule \
    --query SecretString \
    --output text)

DB_USER=$(echo "$DB_SECRET" | jq -r '.username')
DB_PASSWORD=$(echo "$DB_SECRET" | jq -r '.password')
DB_HOST=$(echo "$DB_SECRET" | jq -r '.host')
DB_PORT=$(echo "$DB_SECRET" | jq -r '.port')
DB_NAME=$(echo "$DB_SECRET" | jq -r '.dbname // "postgres"')

echo "✓ Database credentials fetched"
echo "  User: $DB_USER"
echo "  Host: $DB_HOST"

# 更新.env文件
echo ""
echo "=== Updating .env file ==="

# 函数：更新或添加环境变量
update_env() {
    local key=$1
    local value=$2
    if grep -q "^${key}=" "$ENV_FILE"; then
        # macOS兼容的sed
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        else
            sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
        fi
        echo "  ✓ Updated: $key"
    else
        echo "${key}=${value}" >> "$ENV_FILE"
        echo "  ✓ Added: $key"
    fi
}

# 更新数据库配置
update_env "DB_HOST" "$DB_HOST"
update_env "DB_PORT" "$DB_PORT"
update_env "DB_USER" "$DB_USER"
update_env "DB_PASSWORD" "$DB_PASSWORD"
update_env "DB_NAME" "$DB_NAME"
update_env "DB_SSLMODE" "require"

# 获取S3配置（使用Capsule凭证）
echo ""
echo "=== Fetching S3 Configuration ==="
S3_BUCKET="seisei-odoo-filestore-prod"
S3_ACCESS_KEY="***REDACTED***"
S3_SECRET_KEY="gjnOuaKbfc1O42y355ApxfUY8IFO4dctzdtSNUdu"
S3_REGION="ap-northeast-1"

update_env "SEISEI_S3_BUCKET" "$S3_BUCKET"
update_env "SEISEI_S3_REGION" "$S3_REGION"
update_env "SEISEI_S3_ACCESS_KEY" "$S3_ACCESS_KEY"
update_env "SEISEI_S3_SECRET_KEY" "$S3_SECRET_KEY"

echo ""
echo "=== Verification ==="
echo "Database configuration:"
grep "^DB_" "$ENV_FILE" | sed 's/PASSWORD=.*/PASSWORD=<hidden>/'
echo ""
echo "S3 configuration:"
grep "^SEISEI_S3" "$ENV_FILE" | sed 's/SECRET_KEY=.*/SECRET_KEY=<hidden>/'

echo ""
echo "=== Sync completed successfully ==="
echo "Backup available at: $BACKUP_FILE"
echo ""
echo "⚠️  IMPORTANT: Restart Odoo container to apply changes:"
echo "  cd $STACK_DIR"
echo "  docker compose down web && docker compose up -d web"
