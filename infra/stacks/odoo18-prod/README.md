# Odoo 18 Production Stack

## Overview

Production Odoo 18 deployment using immutable Docker images.

**Key Features:**
- All addons baked into image (no volume mounts for code)
- Config baked into image
- Only data volume persisted
- CI/CD via GitHub Actions

## Quick Start

### Environment Variables

Create `.env` file:

```bash
# Required
GITHUB_REPO_OWNER=cameltravel666-crypto
ODOO18_IMAGE_TAG=sha-abc1234  # or 'latest'
DB_PASSWORD=<secure-password>
REDIS_PASSWORD=<secure-password>

# Optional
DB_USER=odoo                  # default: odoo
ADMIN_PASSWORD=<admin-pwd>    # default: changeme
```

### Deploy

```bash
# Pull and start
docker compose pull
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f web
```

### Rollback

```bash
# Change tag in .env
sed -i 's/ODOO18_IMAGE_TAG=.*/ODOO18_IMAGE_TAG=sha-previous/' .env

# Redeploy
docker compose pull web
docker compose up -d web
```

## Verify Deployment

### Check Addons

```bash
# List all addons in container
docker exec seisei-project-web ls /mnt/extra-addons/

# Verify specific addon (e.g., seisei_entitlements)
docker exec seisei-project-web cat /mnt/extra-addons/seisei_entitlements/__manifest__.py
```

### Check Config

```bash
# View baked config
docker exec seisei-project-web cat /etc/odoo/odoo.conf

# Verify addons_path
docker exec seisei-project-web grep addons_path /etc/odoo/odoo.conf
```

### Health Check

```bash
# Internal health check
docker exec seisei-project-web curl -sf http://localhost:8069/web/health

# External (via Traefik)
curl https://demo.erp.seisei.tokyo/web/health
```

## Build Image Locally

For testing before CI:

```bash
# From repository root
docker build -f infra/stacks/odoo18-prod/Dockerfile -t seisei-odoo18:test .

# Test locally
cd infra/stacks/odoo18-prod
ODOO18_IMAGE_TAG=test docker compose up -d
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                      Traefik                         │
│                   (edge network)                     │
└─────────────────┬───────────────┬───────────────────┘
                  │               │
                  │ 8069          │ 8072
                  ▼               ▼
        ┌─────────────────────────────────┐
        │        seisei-project-web       │
        │         (Odoo 18 Image)         │
        │                                 │
        │  /mnt/extra-addons/ (in image)  │
        │  /etc/odoo/odoo.conf (in image) │
        │  /var/lib/odoo (volume mount)   │
        └─────────────┬───────────────────┘
                      │
        ┌─────────────┼───────────────┐
        │             │               │
        ▼             ▼               ▼
   ┌─────────┐  ┌─────────┐    ┌─────────┐
   │   db    │  │  redis  │    │  data   │
   │ (pg15)  │  │  (7)    │    │ (volume)│
   └─────────┘  └─────────┘    └─────────┘
```

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Builds immutable image with addons/config |
| `docker-compose.yml` | Production stack definition |
| `config/odoo.conf` | Odoo configuration (baked into image) |
| `.env.example` | Template for environment variables |

## Related Docs

- [Operations Guide](../../docs/ops/odoo18-prod-stability.md)
- [Monitoring Setup](../../docs/ops/monitoring-minimal.md)
