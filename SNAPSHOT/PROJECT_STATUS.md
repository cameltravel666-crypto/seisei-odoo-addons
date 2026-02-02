# Project Status - Seisei Odoo Addons

**Last Updated**: 2026-02-02
**Repo**: seisei-odoo-addons
**Overall Status**: Active Production

---

## Current State

### Odoo Platform

| Component | Version | Status |
|-----------|---------|--------|
| Odoo | 18.0 | Production |
| Python | 3.11 | Stable |
| Database | PostgreSQL (AWS RDS) | Multi-AZ |
| Custom Addons | 26+ modules | Active |

### Environments

| Environment | URL | Database | Status |
|-------------|-----|----------|--------|
| Staging | staging.erp.seisei.tokyo | AWS RDS Staging | Active |
| Production | erp.seisei.tokyo | AWS RDS Multi-AZ | Live |
| Tenants | *.erp.seisei.tokyo | Multi-tenant routing | Live |

---

## Custom Addons Inventory

### Core Platform (6 modules)

- `seisei_db_router`: Multi-tenant database routing
- `seisei_admin_gate`: Admin access restrictions
- `seisei_entitlements`: Feature flag system
- `seisei_mutex_toggle`: Exclusive option toggles
- `seisei_pos_printer`: POS printer routing
- `seisei_print_manager`: Print job management

### Billing & Integration (4 modules)

- `seisei_billing`: Subscription management + API push
- `seisei_contact_api`: External API connector
- `seisei_gdoc_import`: Google Docs integration
- `seisei_s3_attachment`: AWS S3 file storage

### Finance & Operations (5 modules)

- `custom_ocr_finance`: Invoice OCR
- `seisei_ar_ap_netting`: AR/AP reconciliation
- `bi_hr_payroll_jp`: Japan payroll compliance
- `invoice_ocr`: Invoice processing
- `ocr_file`: OCR file handling

### UI & UX (6 modules)

- `seisei_theme`: Custom branding
- `qr_ordering`: QR code menu system
- `product_image_clipboard`: Image paste functionality
- `my_pos_screensaver_branding`: POS screensaver
- `nagashiro_pos_receipt_branding`: (Legacy)
- `nagashiro_theme`: (Legacy - should be deprecated)

### Reporting & Tools (5 modules)

- `report_lang_api`: Multi-language reports
- `seisei_hr_menu`: HR menu customization
- `seisei_multilang_send`: Multi-language email
- `ai_companion`: AI assistant integration
- `odoo_ocr_final`: OCR finalization
- `web_patch`: Web interface patches

---

## Known Issues

### 1. Next.js Duplicate Files

**Issue**: Repo contains duplicate Next.js files (package.json, src/, prisma/)

**Impact**: High confusion risk

**Status**: Documented, should be removed/archived

**Workaround**: Ignore these files, edit frontend in `Seisei ERP` repo

### 2. Legacy Nagashiro References

**Issue**: Some modules still reference "nagashiro" branding

**Modules affected**:
- `nagashiro_pos_receipt_branding`
- `nagashiro_theme`

**Status**: Should be deprecated or renamed

**Action**: Audit and replace with Seisei branding

### 3. Duplicate Infrastructure

**Issue**: `infra/` directory may not be in sync with `server-apps/infra/`

**Impact**: Medium - deployment confusion

**Status**: `server-apps` is Source of Truth

**Workaround**: For infra changes, use `server-apps` repo

---

## Recent Changes

### 2026-02-02
- Created CTO Skills documentation
- Documented all 26+ custom addons
- Identified duplicate Next.js files

### Earlier
- Production Odoo 18 deployment
- AWS RDS Multi-AZ migration
- Multi-tenant routing implementation

---

## Deployment Status

### Staging Environment

```
URL: https://staging.erp.seisei.tokyo
RDS: odoo18-staging-rds (Single-AZ)
Container: odoo18-staging-rds
Stack: server-apps/infra/stacks/odoo18-staging-rds/
```

### Production Environment

```
URL: https://erp.seisei.tokyo
RDS: odoo18-prod-rds (Multi-AZ)
Container: odoo18-prod-rds
Stack: server-apps/infra/stacks/odoo18-prod-rds/
Tenants: Wildcard routing via Traefik
```

---

## Addon Development Workflow

### Create New Addon

```bash
cd odoo_modules/seisei/
mkdir my_addon
cd my_addon
# Create structure: __init__.py, __manifest__.py, models/, views/, security/
```

### Test Addon

```bash
# Restart Odoo
docker restart odoo18-staging-rds

# Install via UI
# Apps > Update Apps List > Search "My Addon" > Install
```

### Deploy Addon

```bash
# 1. Test in staging
# 2. Git commit
# 3. Deploy via server-apps/infra/scripts/deploy.sh
```

---

## Database Information

### RDS Configuration

**Staging**:
- Instance: db.t3.medium
- Storage: 100 GB SSD
- Multi-AZ: No
- Backups: 7 days

**Production**:
- Instance: db.t3.large (or higher)
- Storage: 500 GB SSD
- Multi-AZ: Yes
- Backups: 30 days
- Deletion Protection: Yes

---

## Next Steps / TODO

### Short Term

- [ ] Remove/archive duplicate Next.js files
- [ ] Audit nagashiro references
- [ ] Document each addon's purpose
- [ ] Add README to each addon

### Medium Term

- [ ] Set up automated addon testing
- [ ] Create addon development template
- [ ] Deprecate unused addons
- [ ] Improve addon documentation

### Long Term

- [ ] Migrate away from nagashiro branding entirely
- [ ] Consolidate similar functionality
- [ ] Performance optimization
- [ ] Security audit of all addons

---

## Related Documentation

- **Global Rules**: `~/Projects/CLAUDE_GLOBAL.md`
- **Workspace Map**: `~/Projects/WORKSPACE_MAP.md`
- **Deployment**: `server-apps/docs/DEPLOYMENT_GUIDE.md`
- **Odoo Docs**: https://www.odoo.com/documentation/18.0/

---

**Last Status Check**: 2026-02-02
**Next Review Due**: 2026-02-09 (weekly)
