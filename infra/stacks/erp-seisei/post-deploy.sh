#!/bin/bash
# ERP 部署后脚本
# 确保 PostgreSQL 密码与环境变量同步

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "[Post-Deploy] ERP Seisei"
echo "=========================================="

# 从 .env 文件加载变量
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "[ERROR] .env file not found!"
    exit 1
fi

# 等待 PostgreSQL 就绪
echo "[1/3] Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker exec seisei-erp-db pg_isready -U "${POSTGRES_USER:-seisei}" &>/dev/null; then
        echo "      PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "[ERROR] PostgreSQL not ready after 30 seconds"
        exit 1
    fi
    sleep 1
done

# 同步密码
echo "[2/3] Syncing PostgreSQL password..."
docker exec seisei-erp-db psql -U "${POSTGRES_USER:-seisei}" -d "${POSTGRES_DB:-seisei_erp}" \
    -c "ALTER USER ${POSTGRES_USER:-seisei} WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "      Password synced successfully"
else
    echo "[WARN] Password sync failed (may already be correct)"
fi

# 重启 app 容器以使用新连接
echo "[3/3] Restarting app container..."
docker restart seisei-erp-app

# 验证
sleep 5
if docker logs seisei-erp-app --tail 5 2>&1 | grep -q "Prisma.*Client created successfully"; then
    echo ""
    echo "=========================================="
    echo "[SUCCESS] Post-deploy completed"
    echo "=========================================="
else
    echo ""
    echo "[WARN] Could not verify Prisma connection"
    echo "Check logs: docker logs seisei-erp-app --tail 20"
fi
