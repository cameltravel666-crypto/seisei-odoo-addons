#!/bin/bash
# NPM 配置检测脚本
# 用于迁移前检测 NPM 当前配置

set -e

echo "============================================"
echo "NPM Configuration Detection"
echo "============================================"
echo ""

# 检查 NPM 容器
NPM_CONTAINER=$(docker ps --filter "name=npm" --format "{{.Names}}" | head -1)

if [[ -z "$NPM_CONTAINER" ]]; then
    echo "WARNING: NPM container not found or not running"
    echo ""
    echo "Searching for NPM-related containers..."
    docker ps -a --filter "name=npm" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    exit 1
fi

echo "Found NPM container: ${NPM_CONTAINER}"
echo ""

# 获取挂载点
echo "--- Volume Mounts ---"
docker inspect ${NPM_CONTAINER} --format '{{range .Mounts}}{{.Type}}: {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
echo ""

# 获取端口
echo "--- Port Mappings ---"
docker inspect ${NPM_CONTAINER} --format '{{range $p, $conf := .NetworkSettings.Ports}}{{$p}} -> {{range $conf}}{{.HostIp}}:{{.HostPort}}{{end}}{{"\n"}}{{end}}'
echo ""

# 获取网络
echo "--- Networks ---"
docker inspect ${NPM_CONTAINER} --format '{{range $net, $conf := .NetworkSettings.Networks}}{{$net}}: {{$conf.IPAddress}}{{"\n"}}{{end}}'
echo ""

# 检查数据目录
echo "--- Data Directories ---"
DATA_DIR=$(docker inspect ${NPM_CONTAINER} --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')
CERT_DIR=$(docker inspect ${NPM_CONTAINER} --format '{{range .Mounts}}{{if eq .Destination "/etc/letsencrypt"}}{{.Source}}{{end}}{{end}}')

if [[ -n "$DATA_DIR" ]]; then
    echo "Data directory: ${DATA_DIR}"
    if [[ -d "$DATA_DIR" ]]; then
        echo "  Size: $(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)"
        echo "  Contents:"
        ls -la "$DATA_DIR" 2>/dev/null | head -10
    fi
else
    echo "Data directory: Not found (checking /opt/npm/data)"
    if [[ -d "/opt/npm/data" ]]; then
        DATA_DIR="/opt/npm/data"
        echo "  Found at: ${DATA_DIR}"
        echo "  Size: $(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)"
    fi
fi
echo ""

if [[ -n "$CERT_DIR" ]]; then
    echo "Certificate directory: ${CERT_DIR}"
else
    echo "Certificate directory: Checking common locations..."
    for dir in "/opt/npm/letsencrypt" "/opt/npm/data/letsencrypt" "/etc/letsencrypt"; do
        if [[ -d "$dir" ]]; then
            CERT_DIR="$dir"
            echo "  Found at: ${CERT_DIR}"
            break
        fi
    done
fi

if [[ -n "$CERT_DIR" && -d "$CERT_DIR" ]]; then
    echo "  Certificates:"
    find "$CERT_DIR" -name "*.pem" -o -name "*.crt" 2>/dev/null | head -10
fi
echo ""

# 导出配置摘要
echo "--- Configuration Summary ---"
cat << EOF
NPM_CONTAINER=${NPM_CONTAINER}
NPM_DATA_DIR=${DATA_DIR:-/opt/npm/data}
NPM_CERT_DIR=${CERT_DIR:-/opt/npm/letsencrypt}
EOF

echo ""
echo "============================================"
echo "Detection Complete"
echo "============================================"
