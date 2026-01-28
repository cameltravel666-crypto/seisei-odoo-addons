# Odoo 路由拆分升级 Runbook

## 变更总览

### 为什么需要这次变更
1. **路由冲突**: Traefik 同时存在 file provider 路由和 Docker labels 直连路由，导致同一 Host 有多个落点
2. **选库机制混用**: `db_name` + `?db=` URL参数 + `X-Odoo-dbfilter` 三种机制并存
3. **upstream 不一致**: QR 路由使用 `odoo18-prod-web:8069`，其他路由使用 `web:8069`
4. **单点容器**: tenant 和 admin 共用同一容器，无法独立管理

### 预期影响
- 彻底消除路由打架问题
- 统一选库机制为 X-Odoo-dbfilter（由 Nginx 注入）
- 拆分为 tenant/admin 两个容器，互不影响
- admin 域名增加访问限制

### 停机窗口
预计 15-30 分钟

---

## 回滚策略

### 配置回滚（优先）
```bash
# 回滚 docker-compose
cd /srv/stacks/odoo18-prod
cp docker-compose.yml.backup docker-compose.yml
docker compose up -d

# 回滚 Nginx 配置
cp /srv/stacks/seisei-odoo/nginx/default.conf.backup /srv/stacks/seisei-odoo/nginx/default.conf
docker restart seisei-odoo-router

# 回滚 odoo.conf
cp /srv/stacks/odoo18-prod/config/odoo.conf.backup /srv/stacks/odoo18-prod/config/odoo.conf
docker compose restart web
```

### 快照回滚（最后手段）
如果配置回滚无效，从 AWS 快照恢复 EBS 卷。

---

## Phase A — 备案/备份

### A1. 记录现状
```bash
# 创建备份目录
sudo mkdir -p /mnt/backup/$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/mnt/backup/$(date +%Y%m%d_%H%M%S)

# 导出 Docker 状态
docker ps -a > $BACKUP_DIR/docker_ps.txt
docker inspect odoo18-prod-web > $BACKUP_DIR/odoo18_inspect.json

# 导出配置
cp /srv/stacks/edge-traefik/dynamic/*.yml $BACKUP_DIR/
cp -r /srv/stacks/odoo18-prod $BACKUP_DIR/odoo18-prod-stack
cp -r /srv/stacks/seisei-odoo $BACKUP_DIR/seisei-odoo-stack
```

### A2. Postgres 逻辑备份
```bash
# 备份所有租户数据库
docker exec seisei-db pg_dumpall -U odoo > $BACKUP_DIR/pg_dumpall.sql

# 或单独备份关键数据库
for db in ten_testodoo ten_public ten_00000001 ten_00000002 ten_00000003; do
  docker exec seisei-db pg_dump -U odoo -d $db > $BACKUP_DIR/${db}.sql
done
```

### A3. 备份 Odoo data_dir
```bash
docker run --rm -v odoo18-prod_odoo18-prod-data:/data -v $BACKUP_DIR:/backup alpine \
  tar czf /backup/odoo_data.tar.gz -C /data .
```

### A4. 创建配置备份点
```bash
# 备份当前配置
cp /srv/stacks/odoo18-prod/docker-compose.yml /srv/stacks/odoo18-prod/docker-compose.yml.backup
cp /srv/stacks/odoo18-prod/config/odoo.conf /srv/stacks/odoo18-prod/config/odoo.conf.backup
cp /srv/stacks/seisei-odoo/nginx/default.conf /srv/stacks/seisei-odoo/nginx/default.conf.backup
```

---

## Phase B — 停机切换

### B1. 进入维护模式
```bash
# 停止 Odoo 容器
cd /srv/stacks/odoo18-prod
docker compose down
```

---

## Phase C — 路由单射根治

### C1. 删除 Docker labels 直连路由

**必须删除的 labels（在 docker-compose.yml 中）：**
- `traefik.enable`
- `traefik.http.routers.odoo18-prod.*`
- `traefik.http.routers.odoo18-prod-lp.*`
- `traefik.http.routers.odoo18-nagashiro.*`
- `traefik.http.routers.odoo18-nagashiro-lp.*`
- `traefik.http.services.odoo18-prod.*`
- `traefik.http.services.odoo18-prod-lp.*`

### C2. 禁用/删除 Traefik dbfilter middlewares

编辑 `/srv/stacks/edge-traefik/dynamic/middlewares.yml`，删除以下部分：
```yaml
# 删除这些（选库由 Nginx 完成）
    odoo-db-header:
      ...
    nagashiro-dbfilter:
      ...
```

### C3. 验证 Traefik 路由
```bash
# 检查 Traefik dashboard
curl -s http://localhost:8888/api/http/routers | jq '.[] | select(.name | contains("odoo")) | {name, service, rule}'

# 应该只看到 file provider 的路由：odoo-tenant, nagashiro, odoo
# 不应该看到 odoo18-prod, odoo18-nagashiro 等
```

---

## Phase D — Nginx odoo-router 最终化

### D1. 创建新的 Nginx 配置

创建文件 `/srv/stacks/seisei-odoo/nginx/default.conf`：

```nginx
# =============================================================================
# Odoo Database Router - 最终版
# =============================================================================
# 设计原则：
# 1. 所有选库通过 X-Odoo-dbfilter header 完成
# 2. 禁止 ?db= URL 参数
# 3. 统一 upstream
# 4. tenant/admin 分流
# =============================================================================

# 租户数据库映射
map $host $tenant_db {
    admin.erp.seisei.tokyo                            "";
    testodoo.seisei.tokyo                             ten_testodoo;
    demo.nagashiro.top                                ten_testodoo;
    ~^(?<subdomain>[a-z0-9]+)\.erp\.seisei\.tokyo$    ten_$subdomain;
    default                                           "";
}

# 判断是否是租户子域名
map $host $is_tenant_subdomain {
    admin.erp.seisei.tokyo      0;
    testodoo.seisei.tokyo       0;
    demo.nagashiro.top          0;
    ~^[a-z0-9]+\.erp\.seisei\.tokyo$  1;
    default                     0;
}

# 判断是否是 admin 域名
map $host $is_admin {
    admin.erp.seisei.tokyo      1;
    default                     0;
}

map $http_x_forwarded_proto $real_scheme {
    https   https;
    default $scheme;
}

# =============================================================================
# Upstream 定义 - 统一命名
# =============================================================================
upstream odoo_tenant {
    server odoo-tenant:8069;
    keepalive 16;
}

upstream odoo_tenant_lp {
    server odoo-tenant:8072;
    keepalive 8;
}

upstream odoo_admin {
    server odoo-admin:8069;
    keepalive 4;
}

upstream odoo_admin_lp {
    server odoo-admin:8072;
    keepalive 2;
}

# =============================================================================
# Server Block
# =============================================================================
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;

    # 安全：覆盖外部传入的 X-Odoo-dbfilter
    set $final_dbfilter $tenant_db;

    # 健康检查
    location = /nginx-health {
        return 200 "OK";
        add_header Content-Type text/plain;
    }

    # =========================================================================
    # Admin 域名专属路由
    # =========================================================================
    location @admin_proxy {
        proxy_pass http://odoo_admin;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        # Admin 不设置 dbfilter，允许切库
        proxy_set_header X-Odoo-dbfilter "";
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        proxy_cookie_flags ~ secure;
    }

    location @admin_proxy_lp {
        proxy_pass http://odoo_admin_lp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Odoo-dbfilter "";
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_cookie_flags ~ secure;
    }

    # =========================================================================
    # 禁止 /web/database/* 对非 admin 域名
    # =========================================================================
    location ~ ^/web/database/ {
        if ($is_admin = 0) {
            return 403 "Database management disabled";
        }
        try_files /nonexistent @admin_proxy;
    }

    # =========================================================================
    # 租户 UI 302 到 BizNexus（API/QR 除外）
    # =========================================================================
    location = /web/login {
        if ($is_tenant_subdomain = 1) {
            return 302 https://biznexus.seisei.tokyo/login;
        }
        if ($is_admin = 1) {
            try_files /nonexistent @admin_proxy;
        }
        proxy_pass http://odoo_tenant;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Odoo-dbfilter $final_dbfilter;
        proxy_cookie_flags ~ secure;
    }

    location = / {
        if ($is_tenant_subdomain = 1) {
            return 302 https://biznexus.seisei.tokyo;
        }
        if ($is_admin = 1) {
            try_files /nonexistent @admin_proxy;
        }
        proxy_pass http://odoo_tenant;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Odoo-dbfilter $final_dbfilter;
        proxy_cookie_flags ~ secure;
    }

    # =========================================================================
    # WebSocket/Longpolling - 按 host 分流
    # =========================================================================
    location ~ ^/(websocket|bus/|longpolling/) {
        if ($is_admin = 1) {
            try_files /nonexistent @admin_proxy_lp;
        }
        proxy_pass http://odoo_tenant_lp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Odoo-dbfilter $final_dbfilter;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_cookie_flags ~ secure;
    }

    # =========================================================================
    # QR Ordering - 统一走 tenant upstream
    # =========================================================================
    location ~ ^/qr/ {
        proxy_pass http://odoo_tenant;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Odoo-dbfilter $final_dbfilter;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        proxy_cookie_flags ~ secure;
    }

    # =========================================================================
    # JSON-RPC / XML-RPC - API 调用
    # =========================================================================
    location ~ ^/(jsonrpc|xmlrpc) {
        if ($is_admin = 1) {
            try_files /nonexistent @admin_proxy;
        }
        proxy_pass http://odoo_tenant;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Odoo-dbfilter $final_dbfilter;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        proxy_cookie_flags ~ secure;
    }

    # =========================================================================
    # Report/PDF
    # =========================================================================
    location ~ ^/report/ {
        if ($is_admin = 1) {
            try_files /nonexistent @admin_proxy;
        }
        proxy_pass http://odoo_tenant;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Odoo-dbfilter $final_dbfilter;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_cookie_flags ~ secure;
    }

    # =========================================================================
    # 静态资源
    # =========================================================================
    location ~ ^/web/(static|assets)/ {
        if ($is_admin = 1) {
            try_files /nonexistent @admin_proxy;
        }
        proxy_pass http://odoo_tenant;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Odoo-dbfilter $final_dbfilter;
        proxy_cache_valid 200 1d;
        proxy_cookie_flags ~ secure;
    }

    # =========================================================================
    # 默认路由
    # =========================================================================
    location / {
        if ($is_tenant_subdomain = 1) {
            return 302 https://biznexus.seisei.tokyo;
        }
        if ($is_admin = 1) {
            try_files /nonexistent @admin_proxy;
        }
        proxy_pass http://odoo_tenant;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $real_scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Odoo-dbfilter $final_dbfilter;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_cookie_flags ~ secure;
    }
}
```

---

## Phase E — Odoo 拆分为 tenant/admin 两容器

### E1. Odoo Tenant 配置

创建 `/srv/stacks/odoo18-prod/config/odoo-tenant.conf`：
```ini
[options]
addons_path = /mnt/extra-addons/seisei,/mnt/extra-addons/community,/usr/lib/python3/dist-packages/odoo/addons
data_dir = /var/lib/odoo
db_host = seisei-db
db_port = 5432
db_user = odoo
admin_passwd = changeme
workers = 4
max_cron_threads = 2
limit_memory_soft = 1073741824
limit_memory_hard = 1342177280
limit_time_cpu = 600
limit_time_real = 1200
proxy_mode = True
gevent_port = 8072
list_db = False
log_level = warn
# 注意：移除 db_name，选库由 X-Odoo-dbfilter 完成
```

### E2. Odoo Admin 配置

创建 `/srv/stacks/odoo18-prod/config/odoo-admin.conf`：
```ini
[options]
addons_path = /mnt/extra-addons/seisei,/mnt/extra-addons/community,/usr/lib/python3/dist-packages/odoo/addons
data_dir = /var/lib/odoo_admin
db_host = seisei-db
db_port = 5432
db_user = odoo
admin_passwd = changeme
# 轻配：单 worker，无 cron
workers = 1
max_cron_threads = 0
limit_memory_soft = 536870912
limit_memory_hard = 671088640
limit_time_cpu = 600
limit_time_real = 1200
proxy_mode = True
gevent_port = 8072
list_db = True
log_level = warn
# admin 允许切库
```

### E3. 新的 docker-compose.yml

创建 `/srv/stacks/odoo18-prod/docker-compose.yml`：

```yaml
# =============================================================================
# Seisei Odoo 18 Production Stack - Tenant/Admin Split
# =============================================================================
# 架构：
# - odoo-tenant: 承载租户 API/QR，通过 X-Odoo-dbfilter 选库
# - odoo-admin: 仅 admin 域名访问，可切库，轻配
# - 两者共用同一镜像和 addons
# =============================================================================

services:
  # ===========================================================================
  # Odoo Tenant - 租户业务
  # ===========================================================================
  odoo-tenant:
    image: ghcr.io/${GITHUB_REPO_OWNER}/seisei-odoo18:${ODOO18_IMAGE_TAG:-latest}
    container_name: odoo-tenant
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_started
    environment:
      - HOST=seisei-db
      - USER=${DB_USER:-odoo}
      - PASSWORD=${DB_PASSWORD}
      - SEISEI_S3_BUCKET=${SEISEI_S3_BUCKET}
      - SEISEI_S3_REGION=${SEISEI_S3_REGION:-ap-northeast-1}
      - SEISEI_S3_ACCESS_KEY=${SEISEI_S3_ACCESS_KEY}
      - SEISEI_S3_SECRET_KEY=${SEISEI_S3_SECRET_KEY}
      - OCR_SERVICE_URL=${OCR_SERVICE_URL:-http://172.17.0.1:8180/api/v1}
      - OCR_SERVICE_KEY=${OCR_SERVICE_KEY}
    volumes:
      - odoo-tenant-data:/var/lib/odoo
      - ./config/odoo-tenant.conf:/etc/odoo/odoo.conf:ro
    networks:
      - seisei-odoo-network
      - odoo-internal
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8069/web/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    deploy:
      resources:
        limits:
          memory: 3G
          cpus: '2'
    # 注意：不再有 traefik labels

  # ===========================================================================
  # Odoo Admin - 管理后台
  # ===========================================================================
  odoo-admin:
    image: ghcr.io/${GITHUB_REPO_OWNER}/seisei-odoo18:${ODOO18_IMAGE_TAG:-latest}
    container_name: odoo-admin
    restart: unless-stopped
    depends_on:
      - odoo-tenant
    environment:
      - HOST=seisei-db
      - USER=${DB_USER:-odoo}
      - PASSWORD=${DB_PASSWORD}
      - SEISEI_S3_BUCKET=${SEISEI_S3_BUCKET}
      - SEISEI_S3_REGION=${SEISEI_S3_REGION:-ap-northeast-1}
      - SEISEI_S3_ACCESS_KEY=${SEISEI_S3_ACCESS_KEY}
      - SEISEI_S3_SECRET_KEY=${SEISEI_S3_SECRET_KEY}
    volumes:
      - odoo-admin-data:/var/lib/odoo_admin
      - ./config/odoo-admin.conf:/etc/odoo/odoo.conf:ro
    networks:
      - seisei-odoo-network
      - odoo-internal
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8069/web/health"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 60s
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1'
    # 注意：不对公网暴露，只通过 Nginx 访问

  # ===========================================================================
  # Redis Cache
  # ===========================================================================
  redis:
    image: redis:7-alpine
    container_name: odoo-redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --save 60 1000
      --appendonly yes
    volumes:
      - odoo-redis-data:/data
    networks:
      - odoo-internal
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  odoo-tenant-data:
  odoo-admin-data:
  odoo-redis-data:

networks:
  odoo-internal:
    driver: bridge
  seisei-odoo-network:
    external: true
```

### E4. 更新 Traefik services.yml

添加 admin 路由到 `/srv/stacks/edge-traefik/dynamic/services.yml`：

```yaml
http:
  routers:
    # ... 保留现有的 erp, www, dify, langbot 路由 ...

    # Odoo Admin - 仅内网/VPN 访问
    odoo-admin:
      rule: "Host(`admin.erp.seisei.tokyo`)"
      entryPoints:
        - websecure
      service: odoo-router-service
      tls:
        certResolver: cloudflare
      # TODO: 添加 IP allowlist middleware
      # middlewares:
      #   - admin-ip-allowlist@file

    # Odoo Tenant - *.erp.seisei.tokyo
    odoo-tenant:
      rule: "HostRegexp(`^[a-z0-9]+\\.erp\\.seisei\\.tokyo$`) && !Host(`admin.erp.seisei.tokyo`)"
      entryPoints:
        - websecure
      service: odoo-router-service
      priority: 100
      tls:
        certResolver: cloudflare
        domains:
          - main: "erp.seisei.tokyo"
            sans:
              - "*.erp.seisei.tokyo"

    # testodoo.seisei.tokyo
    odoo:
      rule: "Host(`testodoo.seisei.tokyo`)"
      entryPoints:
        - websecure
      service: odoo-router-service
      tls:
        certResolver: letsencrypt

    # demo.nagashiro.top
    nagashiro:
      rule: "Host(`demo.nagashiro.top`)"
      entryPoints:
        - websecure
      service: odoo-router-service
      tls:
        certResolver: letsencrypt

  services:
    # ... 保留现有 services ...

    odoo-router-service:
      loadBalancer:
        servers:
          - url: "http://seisei-odoo-router:80"
```

### E5. 更新 Nginx Router docker-compose

更新 `/srv/stacks/seisei-odoo/docker-compose.yml`：

```yaml
services:
  nginx:
    image: nginx:alpine
    container_name: seisei-odoo-router
    restart: unless-stopped
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - seisei-odoo-network
      - edge
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/nginx-health"]
      interval: 10s
      timeout: 3s
      retries: 3

networks:
  seisei-odoo-network:
    external: true
  edge:
    external: true
```

---

## Phase F — 功能验证

### F1. 路由唯一性验证
```bash
# 检查 Traefik 路由
curl -s http://localhost:8888/api/http/routers | jq '.[] | select(.name | contains("odoo")) | {name, service}'

# 预期：所有 odoo 相关路由都指向 odoo-router-service

# 检查请求路径
curl -v https://demo.nagashiro.top/ 2>&1 | grep -E "^< |^> Host"
```

### F2. 选库稳定性验证
```bash
# 测试 testodoo
curl -s -o /dev/null -w "%{http_code}" https://testodoo.seisei.tokyo/web/login
# 预期：200 或 302 到登录页

# 测试 demo.nagashiro.top
curl -s -o /dev/null -w "%{http_code}" https://demo.nagashiro.top/web/login
# 预期：200 或 302 到登录页

# 检查 Odoo 日志确认 dbfilter
docker logs odoo-tenant 2>&1 | grep -E "dbfilter|database" | tail -10
```

### F3. Admin 跨库验证
```bash
# 测试 admin 域名
curl -s -o /dev/null -w "%{http_code}" https://admin.erp.seisei.tokyo/web/login
# 预期：200（显示登录页，可选择数据库）
```

### F4. QR 验证
```bash
# 测试 QR 路由
curl -s -o /dev/null -w "%{http_code}" "https://demo.nagashiro.top/qr/order/test-token"
# 预期：200 或 302

# 检查 Nginx 日志
docker logs seisei-odoo-router 2>&1 | grep "/qr/" | tail -5
```

### F5. 日志检查
```bash
# 检查 Odoo 错误
docker logs odoo-tenant 2>&1 | grep -E "ERROR|KeyError" | tail -20

# 检查 Nginx 错误
docker logs seisei-odoo-router 2>&1 | grep -E "error|502|503" | tail -10
```

---

## Phase G — 模块升级（如需要）

```bash
# 升级特定模块（在路由稳定后执行）
docker exec odoo-tenant odoo -c /etc/odoo/odoo.conf -d ten_testodoo \
  -u qr_ordering,ab_pos -i qr_ordering,ab_pos --stop-after-init --no-http
```

---

## Phase H — 上线与观察

### H1. 启动服务
```bash
# 按顺序启动
cd /srv/stacks/odoo18-prod
docker compose up -d

# 等待健康检查通过
sleep 30
docker compose ps
```

### H2. 观察指标
- Odoo 日志错误率：`docker logs odoo-tenant 2>&1 | grep ERROR | wc -l`
- Nginx 5xx：`docker logs seisei-odoo-router 2>&1 | grep -E " 5[0-9]{2} " | wc -l`
- CPU/Memory：`docker stats --no-stream`

---

## 风险点与观察项

1. **429 Rate Limiting**: 如果出现过多 429，调整 Traefik rate-limit middleware
2. **Worker Memory**: 观察 `docker stats`，如果 OOM 则调整 limit_memory_*
3. **Session 丢失**: 新旧容器切换可能导致 session 丢失，用户需重新登录
4. **Cron 任务**: admin 容器禁用 cron，确保 tenant 容器的 cron 正常

---

## Admin 网络限制建议

### 方案 A: Traefik IP Allowlist
```yaml
# middlewares.yml
http:
  middlewares:
    admin-ip-allowlist:
      ipWhiteList:
        sourceRange:
          - "127.0.0.1/32"
          - "10.0.0.0/8"
          - "172.16.0.0/12"
          - "192.168.0.0/16"
          # 添加你的办公室 IP
```

### 方案 B: Cloudflare Access
使用 Cloudflare Zero Trust 保护 admin 域名

### 方案 C: VPN
只允许 VPN 内网访问 admin 域名
