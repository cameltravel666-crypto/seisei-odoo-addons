# Stack Inventory

This document lists all Docker Compose stacks in the Seisei platform.

## Overview

| Stack | Purpose | Network | Status |
|-------|---------|---------|--------|
| edge-traefik | Reverse proxy, SSL | edge | Production |
| odoo18-prod | Odoo 18 multi-tenant | edge, odoo18 | Production |
| erp-seisei | Seisei ERP (Next.js) | edge, erp-internal | Production |
| ocr | OCR service for invoices | edge | Production |
| web-seisei | Marketing website | edge | Production |
| crm-api | CRM API service | edge | Production |
| langbot | AI chatbot | edge | Production |
| odoo18-test | Odoo test instance | edge | Testing |

---

## Stack Details

### edge-traefik

**Purpose:** Reverse proxy, SSL termination, routing

**Compose Path:** `infra/stacks/edge-traefik/docker-compose.yml`

**Main Containers:**
- `traefik` - Traefik v3 reverse proxy

**Ports:**
- 80 (HTTP, redirects to HTTPS)
- 443 (HTTPS)
- 8888 (Dashboard/API, internal)

**Dependencies:**
- Docker socket access
- Let's Encrypt ACME storage

**Configuration:**
- Static config: `traefik.yml`
- Dynamic configs: `dynamic/*.yml`
- File provider + Docker labels

**Routing Notes:**
- All services route through Traefik
- Uses file provider for static routes
- Docker labels for dynamic routes
- Priority matters for overlapping paths

---

### odoo18-prod

**Purpose:** Odoo 18 multi-tenant ERP

**Compose Path:** `infra/stacks/odoo18-prod/docker-compose.yml`

**Main Containers:**
- `odoo18-prod-web` - Odoo application
- `seisei-odoo-router` - Nginx router for tenant routing
- `seisei-db` - PostgreSQL 15 database

**Ports:**
- 8069 (Odoo, via nginx router)
- 5432 (PostgreSQL, internal only)

**Traefik Routes:**
- `Host(\`*.erp.seisei.tokyo\`)` - Tenant wildcard
- `Host(\`testodoo.seisei.tokyo\`)` - Test instance

**Dependencies:**
- PostgreSQL database
- Nginx router for tenant DB routing
- Shared addon volumes

**Multi-tenant Notes:**
- Each tenant has database `ten_<code>`
- Nginx router maps Host to DB name
- QR ordering uses tenant-specific DB

**Related Configs:**
- `infra/stacks/odoo18-prod/config/odoo.conf`
- Nginx: Container `/etc/nginx/conf.d/default.conf`

---

### erp-seisei

**Purpose:** Seisei ERP Next.js application (BizNexus)

**Compose Path:** `infra/stacks/erp-seisei/docker-compose.yml`

**Main Containers:**
- `seisei-erp-app` - Next.js application
- `seisei-erp-db` - PostgreSQL for ERP

**Ports:**
- 3000 (Next.js, internal)

**Traefik Routes:**
- `Host(\`biznexus.seisei.tokyo\`)`

**Dependencies:**
- PostgreSQL database (separate from Odoo)
- Prisma ORM
- Auth system

**Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection
- `NEXTAUTH_SECRET` - Auth secret
- `ODOO_*` - Odoo API credentials

---

### ocr

**Purpose:** OCR service for invoice/receipt processing

**Compose Path:** `infra/stacks/ocr/docker-compose.yml`

**Main Containers:**
- `ocr-service` - FastAPI OCR service
- `ocr-db` - PostgreSQL for OCR data

**Ports:**
- 8180 (OCR API)

**Traefik Routes:**
- `Host(\`ocr.seisei.tokyo\`)` or internal only

**Dependencies:**
- Gemini API key (for LLM OCR)
- PostgreSQL database

**Environment Variables:**
- `GEMINI_API_KEY` - Google Gemini API
- `OCR_DATABASE_URL` - PostgreSQL connection

---

### web-seisei

**Purpose:** Marketing/landing website

**Compose Path:** `infra/stacks/web-seisei/docker-compose.yml`

**Main Containers:**
- `web-seisei` - Static website

**Ports:**
- 80 (internal)

**Traefik Routes:**
- `Host(\`seisei.tokyo\`)`
- `Host(\`www.seisei.tokyo\`)`

---

### crm-api

**Purpose:** CRM API backend

**Compose Path:** `infra/stacks/crm-api/docker-compose.yml`

**Main Containers:**
- `crm-api` - API service

**Ports:**
- 3001 (internal)

**Traefik Routes:**
- `Host(\`api.seisei.tokyo\`) && PathPrefix(\`/crm\`)`

---

### langbot

**Purpose:** AI chatbot service

**Compose Path:** `infra/stacks/langbot/docker-compose.yml`

**Main Containers:**
- `langbot` - LangChain bot

**Configuration:**
- `config/config.yaml` - Bot configuration

---

### odoo18-test

**Purpose:** Odoo testing instance

**Compose Path:** `infra/stacks/odoo18-test/docker-compose.yml`

**Main Containers:**
- `odoo18-test` - Test Odoo instance

**Notes:**
- Separate from production
- Uses same addons but isolated DB

---

## Network Topology

```
                    Internet
                        |
                   [Traefik:443]
                        |
        +-------+-------+-------+-------+
        |       |       |       |       |
    [odoo]  [erp-app] [ocr]  [web]   [crm]
        |       |       |
   [nginx]  [erp-db]  [ocr-db]
        |
   [seisei-db]
```

## Volume Mounts

| Volume | Stack | Path | Purpose |
|--------|-------|------|---------|
| odoo-data | odoo18-prod | /var/lib/odoo | Odoo filestore |
| pg-data | odoo18-prod | /var/lib/postgresql | Odoo database |
| erp-pg | erp-seisei | /var/lib/postgresql | ERP database |
| traefik-acme | edge-traefik | /etc/traefik/acme | SSL certificates |

## Adding New Stacks

1. Create directory: `infra/stacks/<name>/`
2. Add `docker-compose.yml`
3. Add `.env.example` with all required variables
4. Document in this file
5. Add Traefik labels or file provider config
6. Update `scripts/validate_routes.sh` if needed
7. Test with `docker compose up -d`
8. Run `./scripts/drift_check.sh` after deployment
