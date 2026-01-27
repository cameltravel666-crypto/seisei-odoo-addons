#!/bin/bash
# =============================================================================
# Seisei 统一部署脚本
# =============================================================================
# 用法: ./deploy.sh <stack> [version] [environment] [operator]
#
# Parameters:
#   stack       - Stack name (e.g., odoo18-prod, erp-seisei)
#   version     - Image tag (default: latest)
#   environment - stage or prod (default: stage)
#   operator    - GitHub username or manual operator (default: manual)
# =============================================================================

set -eo pipefail

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
STACKS_DIR="/srv/stacks"
SCRIPTS_DIR="/srv/scripts"
HISTORY_LOG="/srv/deployments/history.log"
LAST_GOOD_DIR="/srv/deployments/last_good_sha"

# 参数
STACK=$1
VERSION=${2:-latest}
ENV=${3:-stage}
OPERATOR=${4:-manual}

log() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }
info() { log "${BLUE}INFO${NC}: $1"; }
success() { log "${GREEN}SUCCESS${NC}: $1"; }
warn() { log "${YELLOW}WARN${NC}: $1"; }
error() { log "${RED}ERROR${NC}: $1"; }

usage() {
    cat << EOF
Seisei Deploy Script v1.0

Usage: $0 <stack> [version] [environment]

Stacks:
  edge-traefik    Traefik reverse proxy
  erp-seisei      Next.js ERP application
  web-seisei      Main website
  odoo18-test     Odoo 18 test environment
  odoo18-prod     Odoo 18 production
  langbot         LangBot chatbot
  ocr             OCR service
  crm-api         CRM API service

Options:
  version         Image tag (default: latest)
  environment     stage or prod (default: stage)

Examples:
  $0 erp-seisei v1.2.0 prod
  $0 odoo18-test latest stage
EOF
    exit 1
}

check_stack() {
    if [[ ! -d "${STACKS_DIR}/${STACK}" ]]; then
        error "Stack '${STACK}' not found in ${STACKS_DIR}"
        echo "Available stacks:"
        ls -1 ${STACKS_DIR} 2>/dev/null || echo "  (none)"
        exit 1
    fi
}

record() {
    local status=$1
    mkdir -p "$(dirname $HISTORY_LOG)"
    # Format: timestamp | stack | version | env | status | operator
    echo "$(date -Iseconds) | ${STACK} | ${VERSION} | ${ENV} | ${status} | ${OPERATOR}" >> $HISTORY_LOG
}

save_last_good() {
    mkdir -p $LAST_GOOD_DIR
    echo "$VERSION" > "$LAST_GOOD_DIR/$STACK"
}

get_last_good() {
    cat "$LAST_GOOD_DIR/$STACK" 2>/dev/null || echo "latest"
}

# 发布闸门检查
gate_check() {
    info "Running gate checks..."

    # 磁盘空间
    local disk_usage=$(df -h /srv 2>/dev/null | awk 'NR==2 {print $5}' | sed 's/%//' || echo "0")
    if [[ $disk_usage -gt 85 ]]; then
        error "Disk usage is ${disk_usage}% (>85%). Aborting."
        exit 1
    fi

    # 内存
    local mem_available=$(free -m 2>/dev/null | awk 'NR==2 {print $7}' || echo "1024")
    if [[ $mem_available -lt 256 ]]; then
        error "Available memory is ${mem_available}MB (<256MB). Aborting."
        exit 1
    fi

    # Docker
    if ! docker info &>/dev/null; then
        error "Docker is not running"
        exit 1
    fi

    success "Gate checks passed"
}

# Odoo 备份
odoo_backup() {
    if [[ "$STACK" =~ odoo ]]; then
        info "Triggering Odoo backup before deployment..."
        if [[ -x "${SCRIPTS_DIR}/backup-odoo18.sh" ]]; then
            ${SCRIPTS_DIR}/backup-odoo18.sh "$STACK" "pre-deploy-${VERSION}"
        else
            warn "Backup script not found, skipping backup"
        fi
    fi
}

# 部署
deploy_stack() {
    cd "${STACKS_DIR}/${STACK}"
    export VERSION
    export DEPLOY_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    info "Pulling images for ${STACK}:${VERSION}..."
    docker compose pull 2>/dev/null || docker-compose pull

    info "Deploying ${STACK}:${VERSION}..."
    docker compose up -d --remove-orphans 2>/dev/null || docker-compose up -d --remove-orphans

    # 等待健康检查
    info "Waiting for health checks..."
    sleep 10

    local unhealthy=$(docker compose ps 2>/dev/null | grep -c "unhealthy" || docker-compose ps | grep -c "unhealthy" || echo "0")
    if [[ $unhealthy -gt 0 ]]; then
        error "Found ${unhealthy} unhealthy containers"
        docker compose ps 2>/dev/null || docker-compose ps
        return 1
    fi

    success "Deployment successful"
    return 0
}

# 冒烟测试
smoke_test() {
    info "Running smoke tests..."
    if [[ -x "${SCRIPTS_DIR}/smoke-test.sh" ]]; then
        if ${SCRIPTS_DIR}/smoke-test.sh "$STACK"; then
            success "Smoke tests passed"
            return 0
        else
            error "Smoke tests failed"
            return 1
        fi
    else
        warn "Smoke test script not found, skipping"
        return 0
    fi
}

# 回滚
rollback() {
    local last=$(get_last_good)
    warn "Rolling back ${STACK} to ${last}..."
    VERSION=$last deploy_stack
}

# 主流程
main() {
    echo "============================================"
    info "Seisei Deploy Script v1.1"
    info "Stack: ${STACK}"
    info "Version: ${VERSION}"
    info "Environment: ${ENV}"
    info "Operator: ${OPERATOR}"
    echo "============================================"

    check_stack
    gate_check
    odoo_backup

    if deploy_stack; then
        record "deployed"

        if [[ "$ENV" == "stage" ]]; then
            if smoke_test; then
                save_last_good
                record "success"
                success "Stage deployment completed. Ready for production."
            else
                warn "Smoke tests failed, rolling back..."
                rollback
                record "rollback"
                exit 1
            fi
        else
            save_last_good
            record "success"
            success "Production deployment completed!"
        fi
    else
        record "failed"
        error "Deployment failed"
        if [[ "$ENV" == "prod" ]]; then
            warn "Attempting rollback..."
            rollback
            record "rollback"
        fi
        exit 1
    fi
}

if [[ -z "$STACK" ]]; then
    usage
fi

main
