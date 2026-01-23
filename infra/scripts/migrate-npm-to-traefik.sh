#!/bin/bash
# NPM 到 Traefik 迁移脚本
# 支持最小停机迁移和一键回退

set -eo pipefail

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

STACKS_DIR="/srv/stacks"
BACKUP_DIR="/srv/backups/npm-migration"
TRAEFIK_DIR="${STACKS_DIR}/edge-traefik"

log() { echo -e "[$(date '+%H:%M:%S')] $1"; }
info() { log "${BLUE}INFO${NC}: $1"; }
success() { log "${GREEN}SUCCESS${NC}: $1"; }
warn() { log "${YELLOW}WARN${NC}: $1"; }
error() { log "${RED}ERROR${NC}: $1"; }

usage() {
    cat << EOF
NPM to Traefik Migration Script

Usage: $0 <command>

Commands:
  prepare     Prepare migration (backup NPM, start Traefik shadow)
  test        Test Traefik with shadow ports (8080/8443)
  switch      Switch traffic from NPM to Traefik (requires downtime)
  rollback    Rollback to NPM
  cleanup     Remove NPM after successful migration

Recommended flow:
  1. $0 prepare    # Backup and start shadow Traefik
  2. $0 test       # Verify Traefik routing
  3. $0 switch     # Switch traffic (1-2 min downtime)
  4. Wait 24-48h for stability
  5. $0 cleanup    # Remove NPM
EOF
    exit 1
}

# 准备迁移
prepare() {
    info "Preparing migration..."

    # 检测 NPM
    info "Detecting NPM configuration..."
    ${STACKS_DIR}/../scripts/detect-npm.sh || true

    # 备份 NPM
    info "Backing up NPM configuration..."
    mkdir -p "$BACKUP_DIR"

    NPM_CONTAINER=$(docker ps --filter "name=npm" --format "{{.Names}}" | head -1)
    if [[ -n "$NPM_CONTAINER" ]]; then
        docker inspect ${NPM_CONTAINER} > "${BACKUP_DIR}/npm-inspect.json"
        success "NPM container config backed up"
    fi

    # 备份 NPM 数据目录
    if [[ -d "/opt/npm" ]]; then
        cp -r /opt/npm "${BACKUP_DIR}/" 2>/dev/null || true
        success "NPM data directory backed up"
    fi

    # 启动 Traefik shadow (使用 8080/8443)
    info "Starting Traefik in shadow mode (8080/8443)..."
    cd "$TRAEFIK_DIR"

    # 创建 shadow 配置
    cat > docker-compose.shadow.yml << 'EOF'
services:
  traefik:
    ports:
      - "8080:80"
      - "8443:443"
EOF

    docker compose -f docker-compose.yml -f docker-compose.shadow.yml up -d

    success "Traefik started in shadow mode"
    echo ""
    info "Test with: curl -H 'Host: erp.seisei.tokyo' http://localhost:8080"
}

# 测试 Traefik
test_traefik() {
    info "Testing Traefik routing..."
    echo ""

    local failed=0

    # 测试各域名
    for host in "erp.seisei.tokyo" "seisei.tokyo" "testodoo.seisei.tokyo"; do
        local status=$(curl -sf -o /dev/null -w "%{http_code}" -H "Host: ${host}" http://localhost:8080 2>/dev/null || echo "000")
        if [[ "$status" =~ ^(200|301|302|304)$ ]]; then
            success "${host} -> ${status}"
        else
            error "${host} -> ${status}"
            ((failed++))
        fi
    done

    echo ""
    if [[ $failed -eq 0 ]]; then
        success "All tests passed!"
        info "Ready for switch. Run: $0 switch"
    else
        error "${failed} tests failed"
        warn "Fix issues before switching"
        exit 1
    fi
}

# 切换流量
switch_traffic() {
    warn "This will cause 1-2 minutes of downtime!"
    read -p "Continue? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        info "Aborted"
        exit 0
    fi

    info "Switching traffic from NPM to Traefik..."

    # 停止 NPM
    info "Stopping NPM..."
    NPM_CONTAINER=$(docker ps --filter "name=npm" --format "{{.Names}}" | head -1)
    if [[ -n "$NPM_CONTAINER" ]]; then
        docker stop ${NPM_CONTAINER}
        success "NPM stopped"
    fi

    # 重启 Traefik 使用标准端口
    info "Restarting Traefik with standard ports..."
    cd "$TRAEFIK_DIR"
    docker compose down 2>/dev/null || true
    rm -f docker-compose.shadow.yml
    docker compose up -d

    # 等待启动
    sleep 5

    # 验证
    info "Verifying..."
    ${STACKS_DIR}/../scripts/smoke-test.sh all || {
        error "Smoke tests failed!"
        warn "Run '$0 rollback' to restore NPM"
        exit 1
    }

    success "Traffic switched to Traefik!"
    echo ""
    info "Monitor for 24-48 hours, then run: $0 cleanup"
}

# 回滚
rollback() {
    warn "Rolling back to NPM..."

    # 停止 Traefik
    info "Stopping Traefik..."
    cd "$TRAEFIK_DIR"
    docker compose down 2>/dev/null || true

    # 启动 NPM
    info "Starting NPM..."
    NPM_CONTAINER=$(docker ps -a --filter "name=npm" --format "{{.Names}}" | head -1)
    if [[ -n "$NPM_CONTAINER" ]]; then
        docker start ${NPM_CONTAINER}
        success "NPM restored"
    else
        error "NPM container not found!"
        warn "Manual recovery may be needed from: ${BACKUP_DIR}"
        exit 1
    fi

    # 验证
    sleep 5
    ${STACKS_DIR}/../scripts/smoke-test.sh all || warn "Some tests failed, check manually"

    success "Rollback completed"
}

# 清理
cleanup() {
    warn "This will permanently remove NPM!"
    read -p "Are you sure? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        info "Aborted"
        exit 0
    fi

    info "Removing NPM..."

    NPM_CONTAINER=$(docker ps -a --filter "name=npm" --format "{{.Names}}" | head -1)
    if [[ -n "$NPM_CONTAINER" ]]; then
        docker rm -f ${NPM_CONTAINER}
        success "NPM container removed"
    fi

    info "NPM backup preserved at: ${BACKUP_DIR}"
    success "Cleanup completed"
}

# 主入口
case ${1:-} in
    prepare) prepare ;;
    test) test_traefik ;;
    switch) switch_traffic ;;
    rollback) rollback ;;
    cleanup) cleanup ;;
    *) usage ;;
esac
