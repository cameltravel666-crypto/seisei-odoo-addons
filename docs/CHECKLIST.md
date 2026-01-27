# Production Deployment Checklist

## Pre-Deployment

### 1. Code Verification

- [ ] All modules in `odoo_modules/seisei/` verified
- [ ] All modules in `odoo_modules/community/` verified
- [ ] `odoo.conf` addons_path includes both directories
- [ ] No uncommitted changes in repository

```bash
# Verify
git status
ls odoo_modules/seisei/
ls odoo_modules/community/
grep addons_path infra/stacks/odoo18-prod/config/odoo.conf
```

### 2. Environment Configuration

- [ ] `.env` file created from `.env.example`
- [ ] `DB_PASSWORD` set (strong password)
- [ ] `REDIS_PASSWORD` set (strong password)
- [ ] `GITHUB_REPO_OWNER` set (for immutable image mode)
- [ ] `ODOO18_IMAGE_TAG` set (for immutable image mode)

```bash
# Verify
cd infra/stacks/odoo18-prod
cat .env | grep -v PASSWORD  # Don't show passwords
```

### 3. Database Templates

- [ ] Template `ten_tpl_food_v1` exists (or create)
- [ ] Template `ten_tpl_trade_v1` exists (or create)
- [ ] Template `ten_tpl_service_v1` exists (or create)

```bash
# Check templates (on server)
PGPASSWORD="$PG_PASSWORD" psql -h localhost -U odoo -lqt | grep tpl
```

---

## Deployment Steps

### 4. Stop Existing Services (if migrating)

- [ ] Backup database before migration
- [ ] Stop old containers gracefully

```bash
# Backup
docker exec odoo18-prod-db pg_dumpall -U odoo > backup_$(date +%Y%m%d).sql

# Stop (only if migrating from old naming)
docker compose down
```

### 5. Deploy New Stack

- [ ] Pull latest code
- [ ] Deploy stack
- [ ] Verify containers started

```bash
cd /opt/seisei-odoo-addons
git pull origin main

cd infra/stacks/odoo18-prod

# For immutable image mode:
docker compose pull
docker compose up -d

# For bind mount mode:
# docker compose -f docker-compose.bind.yml up -d

# Verify
docker compose ps
```

### 6. Container Naming Verification

- [ ] `odoo18-prod-web` is running
- [ ] `odoo18-prod-db` is running
- [ ] `odoo18-prod-redis` is running

```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep odoo18-prod
```

---

## Post-Deployment Verification

### 7. Health Checks

- [ ] Odoo health endpoint responds
- [ ] Database connection works
- [ ] Redis connection works

```bash
# Health check
curl -sf http://localhost:8069/web/health && echo "OK"

# Database
docker exec odoo18-prod-web odoo shell -c "print('DB OK')" --no-http

# Redis
docker exec odoo18-prod-redis redis-cli -a "$REDIS_PASSWORD" ping
```

### 8. Addons Verification

- [ ] Required modules present in container
- [ ] addons_path configured correctly

```bash
# Check modules
docker exec odoo18-prod-web ls /mnt/extra-addons/seisei/ | head -10
docker exec odoo18-prod-web ls /mnt/extra-addons/community/ | head -10

# Check specific required modules
docker exec odoo18-prod-web test -d /mnt/extra-addons/seisei/seisei_entitlements && echo "OK"
docker exec odoo18-prod-web test -d /mnt/extra-addons/seisei/qr_ordering && echo "OK"

# Check config
docker exec odoo18-prod-web grep addons_path /etc/odoo/odoo.conf
```

### 9. Routing Verification

- [ ] Traefik routes configured
- [ ] Wildcard domain works
- [ ] WebSocket/longpolling works

```bash
# Test external access (from outside)
curl -sf https://demo.erp.seisei.tokyo/web/health

# Check Traefik routers
docker exec traefik traefik status 2>/dev/null || \
  curl -sf http://localhost:8080/api/http/routers
```

### 10. Database Filter

- [ ] dbfilter configured correctly
- [ ] Tenant databases accessible

```bash
# Check dbfilter
docker exec odoo18-prod-web grep dbfilter /etc/odoo/odoo.conf

# List databases
docker exec odoo18-prod-db psql -U odoo -lqt | cut -d'|' -f1 | grep -E "^ten_|^TPL"
```

---

## Tenant Operations

### 11. Create New Tenant (if needed)

```bash
cd infra/stacks/odoo18-prod/scripts

# Create tenant (7-8位英数混合, replace with actual values)
./tenant_create.sh TEN-ABCD123 food

# Verify
docker exec odoo18-prod-db psql -U odoo -lqt | grep ten_abcd123
```

### 12. Test Tenant Access

- [ ] New tenant database created
- [ ] Subdomain routes correctly
- [ ] Admin login works

```bash
# Test access (subdomain is lowercase)
curl -sf https://abcd123.erp.seisei.tokyo/web/health
```

---

## Rollback Procedure

### If Issues Occur

```bash
# 1. Check logs
docker compose logs web --tail 100

# 2. If critical, restore backup
docker exec odoo18-prod-db psql -U odoo -f /backup/backup_YYYYMMDD.sql

# 3. If image issue, rollback tag
sed -i 's/ODOO18_IMAGE_TAG=.*/ODOO18_IMAGE_TAG=sha-previous/' .env
docker compose pull web
docker compose up -d web
```

---

## Final Sign-off

| Item | Status | Verified By | Date |
|------|--------|-------------|------|
| Containers running | [ ] | | |
| Health checks pass | [ ] | | |
| Addons loaded | [ ] | | |
| Routing works | [ ] | | |
| Tenant creation works | [ ] | | |
| Backup verified | [ ] | | |

---

## Documentation References

- [INVENTORY.md](INVENTORY.md) - Infrastructure inventory
- [ISOLATION.md](ISOLATION.md) - Module isolation strategy
- [ADDONS_SOURCING.md](ADDONS_SOURCING.md) - Addons source policy
- [DEPLOY.md](../infra/stacks/odoo18-prod/docs/DEPLOY.md) - Detailed deployment guide
