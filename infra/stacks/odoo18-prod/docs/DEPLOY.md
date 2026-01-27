# Odoo 18 Production Deployment Guide

## Overview

This document describes how to deploy Odoo 18 production using addons from the `seisei-odoo-addons` repository as the **single source of truth**.

## Deployment Modes

### Mode 1: Immutable Image (Recommended for Production)

Addons are baked into the Docker image during CI/CD build.

**Pros:**
- Consistent deployments
- Easy rollback (just change image tag)
- No file sync issues

**Files:**
- `docker-compose.yml` (default)
- `Dockerfile`

### Mode 2: Bind Mount

Addons are mounted from host filesystem at runtime.

**Pros:**
- Quick updates without image rebuild
- Good for testing

**Files:**
- `docker-compose.bind.yml`

---

## Deployment Steps

### Prerequisites

1. Server has Docker and Docker Compose installed
2. `edge` network exists for Traefik
3. DNS configured for `*.erp.seisei.tokyo`

### Step 1: Clone Repository

```bash
# On production server
cd /opt
git clone https://github.com/YOUR_ORG/seisei-odoo-addons.git
cd seisei-odoo-addons/infra/stacks/odoo18-prod
```

### Step 2: Configure Environment

```bash
# Copy example and edit
cp .env.example .env
nano .env
```

**Required variables:**

```bash
# For Immutable Image mode
GITHUB_REPO_OWNER=your-org
ODOO18_IMAGE_TAG=sha-abc1234  # or 'latest'

# For Bind Mount mode
ADDONS_PATH=/opt/seisei-odoo-addons/odoo_modules

# Both modes
DB_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>
ADMIN_PASSWORD=<odoo-admin-password>
```

### Step 3: Deploy

**Immutable Image mode:**
```bash
docker compose pull
docker compose up -d
```

**Bind Mount mode:**
```bash
docker compose -f docker-compose.bind.yml up -d
```

### Step 4: Verify Deployment

```bash
# Run verification script
/opt/seisei-odoo-addons/infra/scripts/verify_addons_source.sh

# Or manually check:

# Check container is running
docker compose ps

# Check addons are present
docker exec odoo18-prod-web ls /mnt/extra-addons/seisei/
docker exec odoo18-prod-web ls /mnt/extra-addons/community/

# Verify required modules
docker exec odoo18-prod-web test -d /mnt/extra-addons/seisei/seisei_entitlements && echo "OK"
docker exec odoo18-prod-web test -d /mnt/extra-addons/seisei/vendor_ops_core && echo "OK"

# Check odoo.conf addons_path
docker exec odoo18-prod-web grep addons_path /etc/odoo/odoo.conf

# Expected output:
# addons_path = /mnt/extra-addons/seisei,/mnt/extra-addons/community,/usr/lib/python3/dist-packages/odoo/addons

# Check health endpoint
curl -sf http://localhost:8069/web/health && echo "Healthy"
```

---

## Update Procedures

### Update Addons (Bind Mount Mode)

```bash
cd /opt/seisei-odoo-addons

# Pull latest changes
git pull origin main

# Restart Odoo to reload modules
docker compose -f docker-compose.bind.yml restart web

# For module updates requiring -u flag:
docker exec odoo18-prod-web odoo -u seisei_entitlements --stop-after-init
docker compose -f docker-compose.bind.yml restart web
```

### Update Image (Immutable Mode)

```bash
cd /opt/seisei-odoo-addons/infra/stacks/odoo18-prod

# Update image tag in .env
sed -i 's/ODOO18_IMAGE_TAG=.*/ODOO18_IMAGE_TAG=sha-newcommit/' .env

# Pull and restart
docker compose pull web
docker compose up -d web
```

---

## Rollback Procedures

### Immutable Mode (Easy)

```bash
# Change to previous tag
sed -i 's/ODOO18_IMAGE_TAG=.*/ODOO18_IMAGE_TAG=sha-previous/' .env

# Deploy
docker compose pull web
docker compose up -d web
```

### Bind Mount Mode

```bash
cd /opt/seisei-odoo-addons

# Revert to previous commit
git checkout <previous-commit>

# Restart
docker compose -f docker-compose.bind.yml restart web
```

---

## Configuration Drift Verification

Run these commands to ensure configuration hasn't drifted:

```bash
# 1. Verify mount type (should be bind, not volume)
docker inspect odoo18-prod-web --format '{{range .Mounts}}{{.Destination}}: {{.Type}}{{"\n"}}{{end}}' | grep extra-addons

# Expected: /mnt/extra-addons: bind

# 2. Verify addons_path in config
docker exec odoo18-prod-web cat /etc/odoo/odoo.conf | grep addons_path

# Expected: /mnt/extra-addons/seisei,/mnt/extra-addons/community,...

# 3. Verify required modules exist
for module in seisei_entitlements vendor_ops_core; do
  docker exec odoo18-prod-web test -f /mnt/extra-addons/seisei/$module/__manifest__.py \
    && echo "$module: OK" \
    || echo "$module: MISSING"
done

# 4. Check dbfilter
docker exec odoo18-prod-web cat /etc/odoo/odoo.conf | grep dbfilter

# 5. Compare local config with deployed
diff config/odoo.conf <(docker exec odoo18-prod-web cat /etc/odoo/odoo.conf)
# Should show no differences (or only env var substitutions)
```

---

## Troubleshooting

### Module Not Found

```bash
# Check if module exists in addons path
docker exec odoo18-prod-web find /mnt/extra-addons -name "__manifest__.py" | grep <module_name>

# If not found, check host mount
ls -la /opt/seisei-odoo-addons/odoo_modules/seisei/<module_name>/
```

### Addons Path Issues

```bash
# Verify addons path includes all directories
docker exec odoo18-prod-web python3 -c "import odoo; print(odoo.tools.config['addons_path'])"
```

### Container Won't Start

```bash
# Check logs
docker compose logs web --tail 100

# Common issues:
# - Database connection failed: Check DB_PASSWORD
# - addons_path invalid: Check mount paths
# - Permission denied: Check file permissions on bind mount
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Production Server                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  /opt/seisei-odoo-addons/                                       │
│  ├── odoo_modules/                                              │
│  │   ├── seisei/          ← Self-developed modules              │
│  │   │   ├── seisei_entitlements/                               │
│  │   │   ├── vendor_ops_core/                                   │
│  │   │   └── ...                                                │
│  │   └── community/       ← Third-party modules                 │
│  │       ├── bi_hr_payroll/                                     │
│  │       └── ...                                                │
│  │                                                               │
│  │   BIND MOUNT (read-only)                                     │
│  │         │                                                     │
│  │         ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              odoo18-prod-web (Odoo 18)               │    │
│  │                                                         │    │
│  │  /mnt/extra-addons/ ──────────────────────────────────┐│    │
│  │  ├── seisei/          (from odoo_modules/seisei)     ││    │
│  │  └── community/       (from odoo_modules/community)  ││    │
│  │                                                       ││    │
│  │  /etc/odoo/odoo.conf  (from config/)                 ││    │
│  │  addons_path = /mnt/extra-addons/seisei,             ││    │
│  │                /mnt/extra-addons/community,...       ││    │
│  │                                                       ││    │
│  │  /var/lib/odoo        (Docker volume for filestore)  ││    │
│  └───────────────────────────────────────────────────────┘│    │
│                                                              │    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [ADDONS_SOURCING.md](../../../docs/ADDONS_SOURCING.md) - Module source policy
- [README.md](../README.md) - Stack overview
