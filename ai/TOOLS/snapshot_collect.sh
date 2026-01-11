#!/bin/bash
# snapshot_collect.sh - 收集 repo 与运行态信号
# Encoding: UTF-8
# 作用：收集系统状态信息，输出到 ai/SNAPSHOT/raw/*.txt
# 注意：必须脱敏（token/secret/password/api_key）

set -euo pipefail

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SNAPSHOT_DIR="${PROJECT_ROOT}/ai/SNAPSHOT"
RAW_DIR="${SNAPSHOT_DIR}/raw"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 创建输出目录
mkdir -p "${RAW_DIR}"

# 脱敏函数：替换敏感信息
mask_secrets() {
    local text="$1"
    # 使用 sed 替换常见的敏感信息模式
    echo "$text" | sed -E \
        -e 's/(api[_-]?key|API[_-]?KEY)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/\1=***MASKED***/gi' \
        -e 's/(token|TOKEN)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/token=***MASKED***/gi' \
        -e 's/(secret|SECRET)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/secret=***MASKED***/gi' \
        -e 's/(password|PASSWORD)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/password=***MASKED***/gi' \
        -e 's/(auth|AUTH)[=:][[:space:]]*["'\'']?[^"'\''[:space:]]+["'\'']?/auth=***MASKED***/gi'
}

# 1. Docker 容器状态
echo "收集 Docker 容器状态..."
docker ps -a 2>&1 | mask_secrets > "${RAW_DIR}/docker_ps_${TIMESTAMP}.txt" || echo "docker ps failed" > "${RAW_DIR}/docker_ps_${TIMESTAMP}.txt"

# 2. Docker Compose 状态（如果存在 docker-compose.yml）
if [ -f "${PROJECT_ROOT}/docker-compose.yml" ]; then
    echo "收集 Docker Compose 状态..."
    (cd "${PROJECT_ROOT}" && docker compose ps 2>&1) | mask_secrets > "${RAW_DIR}/docker_compose_ps_${TIMESTAMP}.txt" || echo "docker compose ps failed" > "${RAW_DIR}/docker_compose_ps_${TIMESTAMP}.txt"
fi

# 3. Git 信息
echo "收集 Git 信息..."
{
    echo "=== Git HEAD ==="
    (cd "${PROJECT_ROOT}" && git rev-parse HEAD 2>/dev/null || echo "not a git repo")
    echo ""
    echo "=== Git HEAD (short) ==="
    (cd "${PROJECT_ROOT}" && git rev-parse --short HEAD 2>/dev/null || echo "not a git repo")
    echo ""
    echo "=== Git Status ==="
    (cd "${PROJECT_ROOT}" && git status --short 2>/dev/null || echo "not a git repo")
    echo ""
    echo "=== Git Log (last 10) ==="
    (cd "${PROJECT_ROOT}" && git log --oneline -10 2>/dev/null || echo "not a git repo")
} | mask_secrets > "${RAW_DIR}/git_info_${TIMESTAMP}.txt"

# 4. 健康检查（如果配置了服务）
if [ -f "${PROJECT_ROOT}/ai-template/PROJECT.yaml" ] || [ -f "${PROJECT_ROOT}/ai/PROJECT.yaml" ]; then
    echo "收集健康检查..."
    # 从 PROJECT.yaml 读取服务配置（简化版，实际需要解析 YAML）
    # 这里只是示例，实际实现需要解析 YAML
    {
        echo "=== Health Checks ==="
        echo "NOTE: Parse PROJECT.yaml to get service endpoints"
        echo "Example: curl http://localhost:PORT/health"
    } | mask_secrets > "${RAW_DIR}/health_checks_${TIMESTAMP}.txt"
fi

# 5. 系统信息
echo "收集系统信息..."
{
    echo "=== System Info ==="
    uname -a
    echo ""
    echo "=== Disk Usage ==="
    df -h | head -5
    echo ""
    echo "=== Memory Usage ==="
    free -h 2>/dev/null || echo "free command not available"
} | mask_secrets > "${RAW_DIR}/system_info_${TIMESTAMP}.txt"

echo "快照收集完成: ${RAW_DIR}/"
echo "时间戳: ${TIMESTAMP}"

