# Odoo Addons Sourcing Policy

## Overview

This document defines the single source of truth for all Odoo addons deployed to production.

**Key Principle**: Production environment (`/mnt/extra-addons`) MUST only contain addons from this repository (`seisei-odoo-addons`).

## Repository Structure

```
seisei-odoo-addons/
├── odoo_modules/
│   ├── seisei/              # Seisei self-developed modules
│   │   ├── seisei_entitlements/
│   │   ├── vendor_ops_core/
│   │   ├── seisei_admin_gate/
│   │   ├── seisei_ar_ap_netting/
│   │   ├── ... (other seisei_* modules)
│   │   ├── nagashiro_*/
│   │   ├── custom_ocr_finance/
│   │   └── qr_ordering/
│   │
│   └── community/           # Third-party/community modules
│       ├── abichinger_kitchen_screen/
│       ├── account_financial_report/
│       ├── bi_hr_payroll/
│       └── ...
│
├── infra/
│   └── stacks/
│       └── odoo18-prod/     # Production deployment config
│
└── docs/
    └── ADDONS_SOURCING.md   # This file
```

## Module Categories

### Self-Developed (`seisei/`)

Modules developed and maintained by Seisei team:

| Module | Description | Source |
|--------|-------------|--------|
| `seisei_entitlements` | Entitlements management for business DB | Synced from Seisei ERP |
| `vendor_ops_core` | Tenant & billing operations | Synced from Seisei ERP |
| `seisei_admin_gate` | Admin access control | Direct development |
| `seisei_ar_ap_netting` | AR/AP netting functionality | Direct development |
| `seisei_gdoc_import` | Google Doc import | Direct development |
| `seisei_pos_printer` | POS printer integration | Direct development |
| `qr_ordering` | QR code ordering | Direct development |
| `nagashiro_theme` | Nagashiro client theme | Direct development |
| `custom_ocr_finance` | Financial OCR integration | Direct development |

### Community (`community/`)

Third-party modules from OCA or vendors:

| Module | Source |
|--------|--------|
| `account_financial_report` | OCA |
| `bi_hr_payroll` | BrowseInfo |
| `date_range` | OCA |
| `report_xlsx` | OCA |
| `web_responsive` | OCA |

## Synced Modules (From Seisei ERP)

The following modules are developed in the **Seisei ERP** repository and synced here:

1. **seisei_entitlements**
   - Receives entitlements from billing system
   - Manages feature access control
   - Used by: Production tenant databases (Odoo 18)

2. **vendor_ops_core**
   - Tenant management with auto-generated codes
   - Intake batch management
   - Entitlement billing integration
   - Used by: Central billing database (Odoo 19)

### Sync Process

```bash
# In Seisei ERP repository
cd /path/to/Seisei-ERP

# Dry run (preview changes)
SYNC_DRY_RUN=1 ./scripts/sync_odoo_addons.sh

# Actual sync
./scripts/sync_odoo_addons.sh
```

The sync script:
- Copies `seisei_entitlements/` and `vendor_ops_core/` to this repo
- Excludes: `.git`, `__pycache__`, `*.pyc`, `node_modules`, `.DS_Store`
- Shows git diff summary after sync

## Release Workflow

### Standard Release

```bash
# 1. Sync from ERP (if modules updated there)
cd /path/to/Seisei-ERP
./scripts/sync_odoo_addons.sh

# 2. Review and commit in addons repo
cd /path/to/seisei-odoo-addons
git diff odoo_modules/seisei/
git add .
git commit -m "feat: update seisei_entitlements - add feature X"

# 3. Tag release
git tag -a v1.2.3 -m "Release v1.2.3 - Feature description"
git push origin main --tags

# 4. CI/CD builds and pushes image
# (automatic via GitHub Actions)

# 5. Deploy to production
cd infra/stacks/odoo18-prod
# Update ODOO18_IMAGE_TAG in .env
docker compose pull web
docker compose up -d web
```

### Emergency Hotfix

```bash
# 1. Make fix directly in addons repo
cd seisei-odoo-addons/odoo_modules/seisei/seisei_entitlements
# ... edit files ...

# 2. Commit and tag
git add .
git commit -m "fix: critical bug in entitlements"
git tag -a v1.2.4-hotfix -m "Hotfix: critical bug"
git push origin main --tags

# 3. Deploy immediately
# ... same as above ...

# 4. IMPORTANT: Backport to ERP repo
cd /path/to/Seisei-ERP/seisei_entitlements
# ... apply same fix ...
git commit -m "fix: critical bug in entitlements (backport from addons)"
```

## Prohibited Actions

1. **DO NOT** mount addons from Seisei ERP repo in production
2. **DO NOT** use Docker volumes for `/mnt/extra-addons` (use bind mount or bake into image)
3. **DO NOT** modify addons directly on production servers
4. **DO NOT** skip the sync/release workflow for ERP-sourced modules

## Verification

Run verification script after deployment:

```bash
# On production server
./scripts/verify_addons_source.sh seisei-project-web

# Checks:
# - Mount type is bind (not volume)
# - Required modules present
# - addons_path configured correctly
# - dbfilter set
```

## Migration Note

As of 2026-01-27, the `odoo_modules/` directory has been restructured:
- Self-developed modules moved to `odoo_modules/seisei/`
- Community modules moved to `odoo_modules/community/`

The Odoo `addons_path` should include both:
```ini
addons_path = /mnt/extra-addons/seisei,/mnt/extra-addons/community,/usr/lib/python3/dist-packages/odoo/addons
```

Or for backward compatibility, a symlink approach can be used.
