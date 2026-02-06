#!/bin/bash
# health_monitor.sh - 持续监控生产环境健康状态
# 用途：检测配置漂移、连接问题、性能异常
# 执行频率：cron每5分钟执行一次
# 告警方式：日志 + Slack/Email (需配置)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$STACK_DIR/logs/health_monitor.log"
ALERT_FILE="$STACK_DIR/logs/alerts.log"

mkdir -p "$(dirname "$LOG_FILE")"

# 日志函数
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert() {
    local level=$1
    local message=$2
    log "[$level] $message"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $message" >> "$ALERT_FILE"

    # TODO: 发送告警到Slack/Email
    # send_slack_alert "$level" "$message"
}

# 检查1: 容器健康状态
check_container_health() {
    local status=$(docker inspect odoo18-prod-web --format='{{.State.Health.Status}}' 2>/dev/null || echo "not-running")

    case $status in
        "healthy")
            log "✓ Container health: OK"
            return 0
            ;;
        "unhealthy")
            alert "CRITICAL" "Container is UNHEALTHY"
            return 1
            ;;
        "starting")
            log "⚠ Container is starting..."
            return 0
            ;;
        "not-running")
            alert "CRITICAL" "Container is NOT RUNNING"
            return 1
            ;;
        *)
            alert "WARNING" "Container health status unknown: $status"
            return 1
            ;;
    esac
}

# 检查2: 数据库连接
check_database_connection() {
    if docker exec odoo18-prod-web python3 -c "
import psycopg2
import os
try:
    conn = psycopg2.connect(
        host=os.environ.get('HOST'),
        port=os.environ.get('PORT', 5432),
        user=os.environ.get('USER'),
        password=os.environ.get('PASSWORD'),
        database=os.environ.get('DB_NAME', 'postgres'),
        sslmode='require'
    )
    conn.close()
    print('OK')
except Exception as e:
    print(f'FAILED: {e}')
    exit(1)
" 2>&1 | grep -q "OK"; then
        log "✓ Database connection: OK"
        return 0
    else
        alert "CRITICAL" "Database connection FAILED"
        return 1
    fi
}

# 检查3: S3连接
check_s3_connection() {
    if docker exec odoo18-prod-web python3 -c "
import boto3
import os
try:
    s3 = boto3.client('s3',
        region_name=os.environ.get('SEISEI_S3_REGION', 'ap-northeast-1'),
        aws_access_key_id=os.environ.get('SEISEI_S3_ACCESS_KEY'),
        aws_secret_access_key=os.environ.get('SEISEI_S3_SECRET_KEY')
    )
    s3.head_bucket(Bucket=os.environ.get('SEISEI_S3_BUCKET'))
    print('OK')
except Exception as e:
    print(f'FAILED: {e}')
    exit(1)
" 2>&1 | grep -q "OK"; then
        log "✓ S3 connection: OK"
        return 0
    else
        alert "CRITICAL" "S3 connection FAILED"
        return 1
    fi
}

# 检查4: 配置漂移检测
check_config_drift() {
    local env_file="$STACK_DIR/.env"

    # 检查关键配置是否存在
    local missing=()

    for key in DB_HOST DB_USER DB_PASSWORD DB_NAME SEISEI_S3_BUCKET SEISEI_S3_ACCESS_KEY SEISEI_S3_SECRET_KEY; do
        if ! grep -q "^${key}=" "$env_file" || [ -z "$(grep "^${key}=" "$env_file" | cut -d'=' -f2)" ]; then
            missing+=("$key")
        fi
    done

    if [ ${#missing[@]} -eq 0 ]; then
        log "✓ Configuration: All required keys present"
        return 0
    else
        alert "CRITICAL" "Configuration drift detected: Missing keys: ${missing[*]}"
        return 1
    fi
}

# 检查5: 错误日志监控
check_error_logs() {
    local error_count=$(docker logs odoo18-prod-web --since 5m 2>&1 | grep -i "error\|critical\|exception" | wc -l)

    if [ "$error_count" -gt 50 ]; then
        alert "WARNING" "High error rate in logs: $error_count errors in last 5 minutes"
        return 1
    else
        log "✓ Error logs: $error_count errors (acceptable)"
        return 0
    fi
}

# 检查6: 内存使用率
check_memory_usage() {
    local mem_usage=$(docker stats odoo18-prod-web --no-stream --format "{{.MemPerc}}" | sed 's/%//')

    if (( $(echo "$mem_usage > 90" | bc -l) )); then
        alert "WARNING" "High memory usage: ${mem_usage}%"
        return 1
    else
        log "✓ Memory usage: ${mem_usage}%"
        return 0
    fi
}

# 主执行流程
main() {
    log "=========================================="
    log "Starting health monitoring cycle"

    local failed_checks=0

    check_container_health || ((failed_checks++))
    check_database_connection || ((failed_checks++))
    check_s3_connection || ((failed_checks++))
    check_config_drift || ((failed_checks++))
    check_error_logs || ((failed_checks++))
    check_memory_usage || ((failed_checks++))

    if [ $failed_checks -eq 0 ]; then
        log "✓ All health checks passed"
    else
        alert "WARNING" "$failed_checks health check(s) failed"
    fi

    log "Health monitoring cycle completed"
    log "=========================================="
}

# 执行
main

# 清理旧日志（保留7天）
find "$(dirname "$LOG_FILE")" -name "*.log" -mtime +7 -delete 2>/dev/null || true
