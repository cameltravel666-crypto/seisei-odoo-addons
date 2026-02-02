# Seisei Odoo Addons Repository

**Read Time**: 30 seconds
**Last Updated**: 2026-02-02

---

## What Is This?

**THIS REPO IS**:
- Source of Truth for 26+ Odoo custom addons
- Production multi-tenant ERP backend
- Location: `odoo_modules/seisei/`

**THIS REPO IS NOT**:
- ❌ Next.js frontend (ignore duplicates: `package.json`, `src/`, `prisma/`)
- ❌ Infrastructure hub (ignore duplicated `infra/` - use `server-apps`)

**Identity**: **Odoo Custom Addons Repository** (Source of Truth)

```
Purpose:  All Odoo custom modules for Seisei BizNexus ERP
Contains: 26+ custom Odoo addons
Runtime:  Odoo 18 (Docker containers)
URL:      https://erp.seisei.tokyo, https://*.erp.seisei.tokyo
```

---

## 30-Second Overview

This repository is the **single source of truth** for all Odoo custom addons:
- Multi-tenant database routing
- Subscription billing integration
- Custom theme and branding
- Finance/HR modules
- OCR and integrations

**IMPORTANT**: This repo also contains duplicate Next.js files (should be ignored).

---

## Tech Stack

```
Platform:   Odoo 18 (Community Edition base)
Language:   Python 3.11
Database:   PostgreSQL (AWS RDS Multi-AZ)
Hosting:    Docker + Traefik
Addons:     26+ custom modules
```

---

## Key Directories

```
odoo_modules/
├── seisei/           **SOURCE OF TRUTH: Custom addons**
│   ├── seisei_billing/
│   ├── seisei_db_router/
│   ├── seisei_theme/
│   └── ... (26+ modules)
└── community/        Community addons

infra/                Infrastructure configs (may be duplicate)
├── stacks/           Docker Compose stacks
└── scripts/          Deployment scripts

WARNING: Ignore these (duplicates from Seisei ERP):
├── package.json      (Next.js duplicate)
├── src/              (Next.js duplicate)
├── prisma/           (Next.js duplicate)
└── node_modules/     (Should be deleted)
```

---

## Core Modules

**Platform Foundation**:
- `seisei_db_router`: Multi-tenant database routing
- `seisei_admin_gate`: Admin access restrictions
- `seisei_entitlements`: Feature flag management

**Billing**:
- `seisei_billing`: Subscription management + API push

**Integrations**:
- `seisei_gdoc_import`: Google Docs integration
- `seisei_s3_attachment`: AWS S3 file storage
- `seisei_contact_api`: External API connector

**Finance/Operations**:
- `custom_ocr_finance`: Invoice OCR
- `seisei_ar_ap_netting`: Account reconciliation
- `bi_hr_payroll_jp`: Japan payroll

**UI/UX**:
- `seisei_theme`: Custom branding
- `qr_ordering`: QR code menu system

---

## Quick Start (Addon Development)

### Create New Addon

```bash
cd odoo_modules/seisei/
mkdir my_new_addon
cd my_new_addon

# Create structure
touch __init__.py __manifest__.py
mkdir models views security

# Edit __manifest__.py
cat > __manifest__.py <<EOF
{
    'name': 'My New Addon',
    'version': '18.0.1.0.0',
    'category': 'Custom',
    'summary': 'Description',
    'depends': ['base'],
    'data': [],
    'installable': True,
    'application': False,
}
EOF
```

### Test Addon Locally

```bash
# Add to addons path in docker-compose.yml
# Then restart Odoo
docker restart odoo18-staging-rds

# Install via Odoo UI
# Apps > Update Apps List > Search > Install
```

---

## Production Environment

**URLs**:
- Main: https://erp.seisei.tokyo
- Staging: https://staging.erp.seisei.tokyo
- Tenants: https://*.erp.seisei.tokyo

**Database**: AWS RDS PostgreSQL (Multi-AZ)

**Deployment**: See `server-apps/docs/DEPLOYMENT_GUIDE.md`

---

## Related Repositories

| Repo | Purpose | Relationship |
|------|---------|--------------|
| `Seisei ERP` | Next.js frontend | Calls Odoo API |
| `server-apps` | Infrastructure | Deployment & RDS |

---

## What NOT to Do

- **DO NOT** edit Next.js files here (use `Seisei ERP` instead)
- **DO NOT** modify `infra/` without checking `server-apps` first
- **DO NOT** create addons outside `odoo_modules/seisei/`
- **DO NOT** modify community addons

---

## Deprecated / Duplicate Parts

**These should NOT be here**:
- `package.json`, `src/`, `app/` (Next.js code)
- `prisma/` (database schema for Next.js)
- `node_modules/` (can be deleted)

**Action**: Ignore these files. They are duplicates from `Seisei ERP`.

---

## Getting Help

1. Read `AI_RULES.md` for Odoo development rules
2. Check `SNAPSHOT/PROJECT_STATUS.md` for current state
3. Review `~/Projects/CLAUDE_GLOBAL.md` for workspace rules
4. Check `~/Projects/WORKSPACE_MAP.md` for navigation

---

**Remember**: This is the **Odoo addons repository**. For frontend, see `Seisei ERP`.
