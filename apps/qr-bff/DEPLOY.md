# QR-BFF Deployment Guide

## Overview

This document describes how to deploy the QR-BFF (Backend for Frontend) service for QR ordering.

## Architecture

```
Customer Scan QR → qr.seisei.tokyo (qr-bff) → Odoo JSON-RPC
                                ↓
                        Token → tenant_db mapping
                        (Redis or fallback)
```

## Prerequisites

1. Odoo tenant/admin split already deployed
2. Redis available (can reuse odoo-redis)
3. Traefik with file provider configured
4. Domain qr.seisei.tokyo configured in DNS

## Deployment Steps

### Step 1: Create Odoo Service User

Create a dedicated service user in Odoo for QR-BFF API calls:

```sql
-- Connect to the target database (e.g., ten_testodoo)
INSERT INTO res_users (login, password, name, active, company_id, partner_id)
SELECT 'qr_service', 'your_secure_password', 'QR Service Account', true, 1,
       (SELECT id FROM res_partner WHERE name = 'QR Service Account')
FROM generate_series(1,1)
WHERE NOT EXISTS (SELECT 1 FROM res_users WHERE login = 'qr_service');
```

Or via Odoo UI:
1. Go to Settings → Users & Companies → Users
2. Create user "qr_service" with minimal permissions
3. Grant access to: qr.table, qr.order, product.product, pos.config

### Step 2: Update Nginx Configuration

```bash
# SSH to server
ssh ubuntu@54.65.127.141

# Backup current config
sudo cp /opt/seisei-odoo/nginx/default.conf /opt/seisei-odoo/nginx/default.conf.backup

# Upload new config (from local machine)
scp apps/qr-bff/nginx/odoo-router.conf ubuntu@54.65.127.141:/tmp/

# On server: Apply new config
sudo cp /tmp/odoo-router.conf /opt/seisei-odoo/nginx/default.conf

# Test nginx config
docker exec seisei-odoo-router nginx -t

# Reload nginx
docker exec seisei-odoo-router nginx -s reload
```

### Step 3: Build and Deploy QR-BFF

```bash
# On server
cd /srv/stacks/odoo18-prod

# Copy qr-bff source
sudo mkdir -p /opt/qr-bff
sudo cp -r /path/to/qr-bff/* /opt/qr-bff/

# Build image
cd /opt/qr-bff
docker build -t qr-bff:latest .

# Add environment variables to .env
cat >> /srv/stacks/odoo18-prod/.env << 'EOF'
QR_SERVICE_LOGIN=qr_service
QR_SERVICE_PASSWORD=your_secure_password
EOF

# Start qr-bff with existing stack
docker compose -f docker-compose.yml -f /opt/qr-bff/docker-compose.qr-bff.yml up -d qr-bff
```

### Step 4: Update Traefik Routes

```bash
# Backup current services.yml
sudo cp /srv/stacks/edge-traefik/dynamic/services.yml /srv/stacks/edge-traefik/dynamic/services.yml.backup

# Merge qr-bff routes into services.yml
# Add the content from traefik/qr-bff-routes.yml to services.yml

# Traefik will auto-reload on file change
```

### Step 5: Create Demo Token in Redis

```bash
# On server
docker exec -it odoo-redis redis-cli -a $REDIS_PASSWORD -n 1 \
  SETEX "qr:token:R8YxZM3IsfFwYz6qp1C5_g" 31536000 \
  '{"tenantDb":"ten_testodoo","status":"active","tableName":"Demo Table"}'
```

### Step 6: Verify Deployment

```bash
# Test health endpoint
curl https://qr.seisei.tokyo/v1/qr/health

# Test context endpoint
curl https://qr.seisei.tokyo/v1/qr/R8YxZM3IsfFwYz6qp1C5_g/context

# Test menu endpoint
curl https://qr.seisei.tokyo/v1/qr/R8YxZM3IsfFwYz6qp1C5_g/menu

# Test demo.nagashiro.top login
curl -I https://demo.nagashiro.top/web/login
# Should return 200, NOT redirect to biznexus
```

## Verification Checklist

- [ ] `demo.nagashiro.top` can login with username/password
- [ ] `demo.nagashiro.top/pos/*` opens POS interface
- [ ] `qr.seisei.tokyo/v1/qr/health` returns 200
- [ ] `GET /v1/qr/:token/context` returns `tenant_db=ten_testodoo`
- [ ] `GET /v1/qr/:token/menu` returns menu items
- [ ] `POST /v1/qr/:token/order` creates order (idempotent)
- [ ] `GET /v1/qr/:token/order/:id` returns order status
- [ ] Odoo logs show no "扫码选库失败" errors
- [ ] qr-bff logs show consistent `tenant_db`

## Rollback

If issues occur:

```bash
# Restore nginx config
sudo cp /opt/seisei-odoo/nginx/default.conf.backup /opt/seisei-odoo/nginx/default.conf
docker exec seisei-odoo-router nginx -s reload

# Stop qr-bff
docker compose -f docker-compose.yml -f /opt/qr-bff/docker-compose.qr-bff.yml down qr-bff

# Restore traefik config
sudo cp /srv/stacks/edge-traefik/dynamic/services.yml.backup /srv/stacks/edge-traefik/dynamic/services.yml
```

## Monitoring

- QR-BFF logs: `docker logs -f qr-bff`
- Redis token lookup: `docker exec odoo-redis redis-cli -a $REDIS_PASSWORD -n 1 KEYS "qr:token:*"`
- Odoo logs: `docker logs -f odoo-tenant | grep -E "qr|QR"`
