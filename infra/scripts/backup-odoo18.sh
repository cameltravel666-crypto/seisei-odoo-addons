#!/bin/bash
# Odoo 备份脚本
# 用法: ./backup-odoo18.sh <odoo18-test|odoo18-prod> [tag]

set -eo pipefail

STACK=${1:-odoo18-test}
TAG=${2:-$(date +%Y%m%d-%H%M%S)}
BACKUP_DIR="/srv/backups/${STACK}/${TAG}"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo "[$(date '+%H:%M:%S')] $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }

# 根据 stack 确定容器和卷名
case $STACK in
    odoo18-test)
        DB_CONTAINER="seisei-test-db"
        WEB_VOLUME="odoo18-test_odoo18-test-data"
        DB_USER="odoo"
        ;;
    odoo18-prod)
        DB_CONTAINER="seisei-project-db"
        WEB_VOLUME="odoo18-prod_odoo18-prod-data"
        DB_USER="odoo"
        ;;
    *)
        echo "Unknown stack: $STACK"
        echo "Usage: $0 <odoo18-test|odoo18-prod> [tag]"
        exit 1
        ;;
esac

mkdir -p "$BACKUP_DIR"

log "Starting backup for ${STACK} with tag ${TAG}"
log "Backup directory: ${BACKUP_DIR}"
echo ""

# 1. 数据库备份
log "Backing up database..."
if docker exec ${DB_CONTAINER} pg_dumpall -U ${DB_USER} 2>/dev/null | gzip > "${BACKUP_DIR}/db.sql.gz"; then
    success "Database backup completed"
else
    warn "Database backup failed or container not running"
fi

# 2. Filestore 备份
log "Backing up filestore..."
if docker run --rm \
    -v ${WEB_VOLUME}:/data:ro \
    -v ${BACKUP_DIR}:/backup \
    alpine tar czf /backup/filestore.tar.gz -C /data . 2>/dev/null; then
    success "Filestore backup completed"
else
    warn "Filestore backup failed or volume not found"
fi

# 3. 配置备份
log "Backing up config..."
if [[ -d "/srv/stacks/${STACK}/config" ]]; then
    cp -r "/srv/stacks/${STACK}/config" "${BACKUP_DIR}/"
    success "Config backup completed"
else
    warn "Config directory not found"
fi

# 4. 元数据
cat > "${BACKUP_DIR}/info.txt" << EOF
stack=${STACK}
tag=${TAG}
date=$(date -Iseconds)
db_container=${DB_CONTAINER}
web_volume=${WEB_VOLUME}
hostname=$(hostname)
EOF
success "Metadata saved"

echo ""
log "Backup completed: ${BACKUP_DIR}"
echo ""
echo "Files:"
ls -lh "${BACKUP_DIR}" 2>/dev/null || echo "(empty)"
echo ""

# 计算大小
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo "unknown")
log "Total size: ${TOTAL_SIZE}"

# 清理旧备份 (保留 7 天)
log "Cleaning up old backups (>7 days)..."
find "/srv/backups/${STACK}" -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
success "Cleanup completed"
