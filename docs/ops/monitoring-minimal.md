# Minimal Monitoring Setup

## Overview

Two options for lightweight monitoring without heavy infrastructure.

## Option A: Cron-based Health Checks (Simplest)

### Setup Script

Create `/srv/scripts/health-monitor.sh`:

```bash
#!/bin/bash
# =============================================================================
# Minimal Health Monitor
# =============================================================================
# Run via cron every 5 minutes
# Sends alerts to Slack/LINE/Email when services fail

set -e

# Configuration
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
EMAIL_TO="${ALERT_EMAIL:-}"
ALERT_LOG="/var/log/health-alerts.log"

# Services to check
declare -A SERVICES=(
    ["odoo18-prod"]="https://demo.erp.seisei.tokyo/web/health"
    ["biznexus"]="https://biznexus.seisei.tokyo/api/health"
    ["traefik"]="http://localhost:8080/ping"
)

# Container health
declare -A CONTAINERS=(
    ["seisei-project-web"]="Odoo 18 Prod"
    ["seisei-project-db"]="Odoo DB"
    ["traefik"]="Traefik"
)

alert() {
    local message=$1
    local timestamp=$(date -Iseconds)

    echo "[$timestamp] ALERT: $message" >> $ALERT_LOG

    # Slack
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -s -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"🚨 ALERT: $message\"}" &>/dev/null || true
    fi

    # Email (requires mailutils)
    if [[ -n "$EMAIL_TO" ]] && command -v mail &>/dev/null; then
        echo "$message" | mail -s "[ALERT] Seisei Service Issue" "$EMAIL_TO" || true
    fi
}

# Check URLs
for service in "${!SERVICES[@]}"; do
    url="${SERVICES[$service]}"
    status=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

    if [[ ! "$status" =~ ^(200|301|302|303)$ ]]; then
        alert "$service is DOWN (HTTP $status)"
    fi
done

# Check containers
for container in "${!CONTAINERS[@]}"; do
    name="${CONTAINERS[$container]}"
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        alert "$name container ($container) is not running"
    fi
done

# Check disk space
disk_usage=$(df -h /srv | awk 'NR==2 {print $5}' | sed 's/%//')
if [[ $disk_usage -gt 85 ]]; then
    alert "Disk usage is ${disk_usage}% on /srv"
fi

# Check memory
mem_available=$(free -m | awk 'NR==2 {print $7}')
if [[ $mem_available -lt 256 ]]; then
    alert "Low memory: ${mem_available}MB available"
fi
```

### Cron Setup

```bash
# /etc/cron.d/health-monitor
*/5 * * * * root SLACK_WEBHOOK="https://hooks.slack.com/..." /srv/scripts/health-monitor.sh 2>&1 | logger -t health-monitor
```

## Option B: Prometheus + Grafana Stack

### Docker Compose (Separate Stack)

Create `/srv/stacks/monitoring/docker-compose.yml`:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=15d'
    networks:
      - monitoring
    ports:
      - "127.0.0.1:9090:9090"

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    restart: unless-stopped
    networks:
      - monitoring
    pid: host
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    restart: unless-stopped
    networks:
      - monitoring
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro

  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    restart: unless-stopped
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    networks:
      - monitoring
    ports:
      - "127.0.0.1:9093:9093"

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    restart: unless-stopped
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana-data:/var/lib/grafana
    networks:
      - monitoring
      - edge
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.grafana.rule=Host(`grafana.seisei.tokyo`)"
      - "traefik.http.routers.grafana.entrypoints=websecure"
      - "traefik.http.routers.grafana.tls.certresolver=cloudflare"

volumes:
  prometheus-data:
  grafana-data:

networks:
  monitoring:
    driver: bridge
  edge:
    external: true
```

### Prometheus Config

Create `/srv/stacks/monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - /etc/prometheus/alerts/*.yml

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  - job_name: 'traefik'
    static_configs:
      - targets: ['traefik:8080']

  - job_name: 'odoo18-blackbox'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://demo.erp.seisei.tokyo/web/health
          - https://biznexus.seisei.tokyo/api/health
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115
```

### Alert Rules

Create `/srv/stacks/monitoring/alerts/odoo.yml`:

```yaml
groups:
  - name: odoo18
    rules:
      - alert: OdooDown
        expr: probe_success{job="odoo18-blackbox"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Odoo 18 is down"
          description: "{{ $labels.instance }} has been down for 2 minutes"

      - alert: OdooHighMemory
        expr: container_memory_usage_bytes{name="seisei-project-web"} > 3758096384
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Odoo memory usage high"
          description: "Odoo container using > 3.5GB memory"

      - alert: OdooContainerRestart
        expr: increase(container_restart_count{name="seisei-project-web"}[1h]) > 3
        labels:
          severity: warning
        annotations:
          summary: "Odoo container restarting frequently"
          description: "{{ $value }} restarts in the last hour"

      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes{mountpoint="/srv"} / node_filesystem_size_bytes{mountpoint="/srv"}) * 100 < 15
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Disk space low on /srv"
          description: "{{ $value | printf \"%.1f\" }}% free"
```

## Key Metrics to Monitor

| Metric | Warning Threshold | Critical Threshold |
|--------|------------------|-------------------|
| Disk Usage (/srv) | 75% | 85% |
| Memory (Odoo container) | 3GB | 3.5GB |
| Response Time (8069) | 2s | 5s |
| Container Restarts/hour | 2 | 5 |
| Traefik 5xx rate | 1% | 5% |
| DB Connections | 80% of max | 95% of max |

## Recommended: Start with Option A

Option A (cron-based) is recommended for initial setup because:
- Zero additional infrastructure
- Easy to understand and maintain
- Covers critical alerts
- Can migrate to Option B later if needed

Start monitoring today with just the health-monitor.sh script and a Slack webhook.
