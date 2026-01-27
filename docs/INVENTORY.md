# Infrastructure Inventory Report

Generated: 2026-01-27

This document provides a comprehensive inventory of the current implementation state, sourced from actual code scanning.

---

## 1. Tenant/Customer Naming Rules

### 1.1 Source Files

| Component | File Path | Purpose |
|-----------|-----------|---------|
| Tenant Model | `Seisei ERP/vendor_ops_core/models/vendor_ops_tenant.py` | Core tenant entity with naming rules |
| Bridge Client | `Seisei ERP/vendor_ops_core/services/bridge_client.py` | API integration using tenant codes |
| OCR API | `Seisei ERP/vendor_ops_core/controllers/ocr_api.py` | OCR webhook with tenant normalization |

### 1.2 Naming Convention (Verified from Code)

```python
# From vendor_ops_tenant.py:258-281
def _extract_subdomain_from_code(self, code):
    """Extract subdomain from tenant_code (TEN-MKQZYN0 -> mkqzyn0)"""
    if not code or not code.startswith('TEN-'):
        return None
    # Extract alphanumeric part after TEN-
    return code[4:].lower()  # Returns 'mkqzyn0'

def _generate_tenant_fields(self, code):
    """Generate subdomain, domain_primary, customer_db_name from code"""
    subdomain = self._extract_subdomain_from_code(code)
    # ...
    domain_primary = f"{subdomain}.{base_domain}"       # e.g., mkqzyn0.erp.seisei.tokyo
    customer_db_name = f"ten_{subdomain}"               # e.g., ten_mkqzyn0
```

**Pattern Summary:**

| Field | Format | Example |
|-------|--------|---------|
| Tenant Code | `TEN-XXXXXXX` (7-8位英数混合) | `TEN-MKQZYN0`, `TEN-MKT0940` |
| Subdomain | `xxxxxxx` (from code, lowercase) | `mkqzyn0`, `mkt0940` |
| Domain | `{subdomain}.erp.seisei.tokyo` | `mkqzyn0.erp.seisei.tokyo` |
| Database Name | `ten_{subdomain}` | `ten_mkqzyn0` |

**命名规则特点：**
- 7-8位英数混合（非纯数字）
- 大小写不敏感（存储时转为小写）
- 格式：字母+数字混合，如 `MKQZYN0`, `MKT0940`

### 1.3 OCR Webhook Normalization

```python
# From vendor_ops_core/controllers/ocr_api.py:86-95
# Normalize tenant code: ten_mkqzyn00 -> MKQZYN00
subdomain = tenant_code
if tenant_code.startswith('ten_'):
    subdomain = tenant_code[4:].upper()

# Search for tenant by subdomain or code
tenant = request.env['vendor.ops.tenant'].sudo().search([
    '|',
    ('subdomain', '=ilike', subdomain),
    ('code', '=ilike', f'TEN-{subdomain}')
], limit=1)
```

---

## 2. OCR Management (Odoo 19 Central Service)

### 2.1 Architecture

```
┌─────────────────┐     OCR Webhook      ┌─────────────────┐
│  Odoo 18 (Biz)  │ ◄──────────────────► │  Odoo 19 (Ops)  │
│  - ocr.usage    │                      │  - vendor.ops   │
│  - HR Expense   │                      │  - OCR billing  │
│  - Purchase OCR │     tenant_code      │  - Usage sync   │
└─────────────────┘                      └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  OCR Service    │
                    │  (Port 8868)    │
                    │  /ocr/invoice   │
                    └─────────────────┘
```

### 2.2 Odoo 19 Side (Central Billing)

| File | Purpose |
|------|---------|
| `vendor_ops_core/controllers/ocr_api.py` | OCR webhook receiver `/api/v1/ocr/usage` |
| `vendor_ops_core/models/vendor_ops_tenant.py` | Tenant with `ocr_usage_count`, `ocr_usage_billable` |

**Key Fields (vendor.ops.tenant):**
```python
ocr_usage_count = fields.Integer('OCR Usage Count')
ocr_usage_billable = fields.Integer('OCR Billable')
ocr_usage_last_sync = fields.Datetime('Last OCR Sync')
```

### 2.3 Odoo 18 Side (Business DB)

| File | Purpose |
|------|---------|
| `odoo_modules/seisei/odoo_ocr_final/models/ocr_usage.py` | Local usage tracking |
| `odoo_modules/seisei/custom_ocr_finance/models/ocr_usage.py` | Finance OCR usage |
| `odoo_modules/seisei/invoice_ocr/models/ocr_document.py` | Invoice OCR integration |

**OCR Service URL (from code):**
```python
# odoo_modules/seisei/invoice_ocr/models/ocr_document.py:12
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://ocr:8868")
```

**BizNexus Webhook (usage notification):**
```python
# custom_ocr_finance/models/ocr_usage.py:135-166
def _notify_biznexus(self, billing_info):
    """Send OCR usage notification to BizNexus webhook"""
    webhook_url = os.getenv('BIZNEXUS_WEBHOOK_URL')
    # POST to BizNexus with tenant_code and usage data
```

### 2.4 Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `OCR_SERVICE_URL` | Odoo 18 | OCR service endpoint (default: `http://ocr:8868`) |
| `BIZNEXUS_WEBHOOK_URL` | Odoo 18 | BizNexus usage webhook |
| `BRIDGE_API_URL` | Odoo 19 | Bridge service endpoint |

---

## 3. Production Deployment Configuration

### 3.1 File Locations

| File | Path | Purpose |
|------|------|---------|
| Docker Compose (prod) | `infra/stacks/odoo18-prod/docker-compose.yml` | Production stack |
| Docker Compose (bind) | `infra/stacks/odoo18-prod/docker-compose.bind.yml` | Bind mount mode |
| Odoo Config | `infra/stacks/odoo18-prod/config/odoo.conf` | Odoo configuration |
| Traefik Middlewares | `infra/stacks/edge-traefik/dynamic/middlewares.yml` | Routing middlewares |
| Deploy Script | `infra/scripts/deploy_odoo18.sh` | Deployment automation |
| DB Clone Script | `infra/scripts/odoo-db/clone_from_template.sh` | Template cloning |

### 3.2 Container Names (Current)

| Service | Container Name | Notes |
|---------|---------------|-------|
| Odoo 18 Web | `seisei-project-web` | Production Odoo |
| PostgreSQL | `seisei-project-db` | Database |
| Redis | `seisei-project-redis` | Session cache |

### 3.3 Addons Path Configuration

```ini
# From infra/stacks/odoo18-prod/config/odoo.conf:11
addons_path = /mnt/extra-addons/seisei,/mnt/extra-addons/community,/usr/lib/python3/dist-packages/odoo/addons
```

### 3.4 dbfilter Configuration

```ini
# From infra/stacks/odoo18-prod/config/odoo.conf:61
dbfilter = ^(?!postgres|template).*$
```

**Traefik Middleware for domain-specific DB:**
```yaml
# From infra/stacks/edge-traefik/dynamic/middlewares.yml:101-104
nagashiro-dbfilter:
  headers:
    customRequestHeaders:
      X-Odoo-dbfilter: "ten_testodoo"
```

---

## 4. Addons Inventory

### 4.1 Mount Method

**Current:** Immutable image (addons baked into Docker image)
**Alternative:** Bind mount via `docker-compose.bind.yml`

### 4.2 Self-Developed Modules (seisei/)

| Module | Category | Description |
|--------|----------|-------------|
| `seisei_entitlements` | Billing | Entitlement management |
| `vendor_ops_core` | Operations | Tenant & billing operations |
| `seisei_admin_gate` | Security | Admin access control |
| `seisei_ar_ap_netting` | Finance | AR/AP netting |
| `seisei_pos_printer` | POS | Printer integration |
| `seisei_print_manager` | POS | Print management |
| `qr_ordering` | POS | QR code ordering |
| `odoo_ocr_final` | OCR | Financial OCR |
| `custom_ocr_finance` | OCR | Custom finance OCR |
| `invoice_ocr` | OCR | Invoice OCR |
| `nagashiro_theme` | Theme | Nagashiro branding |

### 4.3 Community Modules (community/)

| Module | Source |
|--------|--------|
| `account_financial_report` | OCA |
| `bi_hr_payroll` | BrowseInfo |
| `date_range` | OCA |
| `report_xlsx` | OCA |
| `web_responsive` | OCA |

---

## 5. QR vs OCR Conflict Analysis

### 5.1 Route Patterns

| Module | Routes | Scope |
|--------|--------|-------|
| `qr_ordering` | `/qr/order/<token>`, `/qr/s/<code>` | Public, no website |
| `odoo_ocr_final` | `/ocr/batch/progress/<id>`, `/ocr/batch/active` | JSON-RPC |
| `invoice_ocr` | Internal model methods | No HTTP routes |

### 5.2 Template Inheritance

**Nagashiro Theme (Global):**
```xml
<!-- From nagashiro_theme/views/webclient_templates.xml -->
<template id="nagashiro_theme.layout" inherit_id="web.layout">
<template id="nagashiro_theme.login_layout" inherit_id="web.login_layout">
```

**Risk Assessment:**
- QR ordering: Low risk (uses `website=False`, no template inheritance)
- OCR modules: Low risk (API-only, no frontend templates)
- Theme: Medium risk (global `web.layout` inheritance)

### 5.3 No Detected Conflicts

The current implementation uses proper isolation:
- QR routes prefixed with `/qr/`
- OCR routes prefixed with `/ocr/`
- No overlapping QWeb templates
- No website_id conflicts detected

---

## 6. Cleanup Candidates

### 6.1 Potentially Obsolete Documentation (in qr_ordering/)

| File | Size | Last Modified |
|------|------|---------------|
| `BOTTOM_BAR_QUICK_REF.md` | 7 KB | Jan 27 |
| `BOTTOM_BAR_REFACTOR_REPORT.md` | 13 KB | Jan 27 |
| `BOTTOM_BAR_SUMMARY.md` | 20 KB | Jan 27 |
| `CART_PRICE_BUG_ANALYSIS.md` | 4 KB | Jan 27 |
| `DEPLOYMENT_RECORD.md` | 5 KB | Jan 27 |
| `DEPLOYMENT_STATUS.md` | 4 KB | Jan 27 |
| `FIX_REPORT.md` | 13 KB | Jan 27 |
| `TEST_BOTTOM_BAR.md` | 13 KB | Jan 27 |
| `V1_V2_FIX_SUMMARY.md` | 4 KB | Jan 27 |
| `V2_CHECKLIST.md` | 7 KB | Jan 27 |

**Recommendation:** Archive to `.archive/qr_ordering_docs/`

### 6.2 Existing Scripts (Keep)

| Script | Path | Status |
|--------|------|--------|
| `clone_from_template.sh` | `infra/scripts/odoo-db/` | Active |
| `create_template_full.sh` | `infra/scripts/odoo-db/` | Active |
| `create_template_qr.sh` | `infra/scripts/odoo-db/` | Active |
| `deploy_odoo18.sh` | `infra/scripts/` | Active |
| `verify-routing.sh` | `infra/scripts/` | Active |
| `smoke-test.sh` | `infra/scripts/` | Active |

---

## 7. Summary

### 7.1 Verified Working Implementation

1. **Tenant Naming:** `TEN-XXXXXXXX` → `{subdomain}.erp.seisei.tokyo` → `cust_ten_{subdomain}`
2. **OCR Management:** Central billing in Odoo 19, usage tracking in Odoo 18
3. **Deployment:** Immutable image with baked addons (preferred) or bind mount
4. **dbfilter:** `^(?!postgres|template).*$` with Traefik middleware for domain mapping

### 7.2 Action Items

1. Standardize container names to `odoo18-prod-*` prefix
2. Create tenant provisioning script using existing clone_from_template.sh
3. Archive obsolete documentation
4. Document isolation strategy for QR/OCR modules
