# Tenant Database Provisioning

## Overview

This document describes the database provisioning strategy for the multi-tenant architecture with three isolated chains:

1. **TENANT** - Normal business operations (per-tenant DB)
2. **TRY_OCR** - Public OCR demo (fixed public DB)
3. **QR_ORDERING** - Per-tenant QR ordering (per-tenant DB)

## Template Databases

We maintain two template databases:

### TPL-FULL (Full Feature Template)

Used for:
- TEN-OCR-DEMO (public OCR demo)
- Full-featured tenant deployments

Addons included:
- Core: base, web, mail
- Accounting: account, account_accountant
- Sales/Purchase: purchase, sale, sale_management
- OCR: odoo_ocr_final, custom_ocr_finance, ocr_file, invoice_ocr
- Entitlements: seisei_entitlements
- Admin Gate: seisei_admin_gate
- Storage: seisei_s3_attachment
- POS: point_of_sale
- Google: seisei_gdoc_import
- Extras: base_accounting_kit, accounting_report_xlsx

### TPL-QR (QR Ordering Template)

Used for:
- Regular tenant databases with QR ordering focus

Addons included:
- Core: base, web, mail
- POS: point_of_sale
- QR: qr_ordering
- Theme: nagashiro_theme, nagashiro_pos_receipt_branding
- Entitlements: seisei_entitlements
- Storage: seisei_s3_attachment

## Creating Template Databases

### Prerequisites

1. PostgreSQL access credentials
2. Odoo container running with all addons available

### Create TPL-FULL

```bash
# Set environment variables
export PG_HOST=localhost
export PG_PORT=5432
export PG_USER=odoo
export PG_PASSWORD=your_password

# Run the script
./infra/scripts/odoo-db/create_template_full.sh

# Install addons via Odoo CLI
docker exec seisei-project-web odoo -d TPL-FULL -i base,web,mail,account,odoo_ocr_final,seisei_entitlements,seisei_admin_gate --stop-after-init
```

### Create TPL-QR

```bash
# Set environment variables
export PG_HOST=localhost
export PG_PORT=5432
export PG_USER=odoo
export PG_PASSWORD=your_password

# Run the script
./infra/scripts/odoo-db/create_template_qr.sh

# Install addons via Odoo CLI
docker exec seisei-project-web odoo -d TPL-QR -i base,web,mail,point_of_sale,qr_ordering,seisei_entitlements --stop-after-init
```

## Creating Tenant Databases

### TEN-OCR-DEMO (Public OCR)

```bash
./infra/scripts/odoo-db/clone_from_template.sh TPL-FULL TEN-OCR-DEMO
```

### Regular Tenant (TEN-xxxxx)

```bash
# For QR-focused tenant
./infra/scripts/odoo-db/clone_from_template.sh TPL-QR TEN-ABCD1234

# For full-featured tenant
./infra/scripts/odoo-db/clone_from_template.sh TPL-FULL TEN-ABCD1234
```

## Database Routing

Database resolution is handled by the DbResolver module (`src/lib/db/dbResolver.ts`):

| Route Type | Path Pattern | DB Resolution |
|------------|--------------|---------------|
| TRY_OCR | /try-ocr/*, /api/public/* | Fixed: TEN-OCR-DEMO |
| TENANT | /api/*, /login, etc. | From user session → tenant mapping |
| QR_ORDERING | /qr/*, /api/qr/* | From QR token → tenant mapping |
| ADMIN | *.erp.seisei.tokyo | From host → dbfilter |

## Critical Rules

1. **TRY_OCR never accepts db override** - Any request to public OCR endpoints with db/dbname parameter is rejected (400)

2. **TENANT never routes to TEN-OCR-DEMO** - DbResolver explicitly blocks tenant operations from routing to the public OCR database

3. **QR_ORDERING never routes to TEN-OCR-DEMO** - QR ordering is always per-tenant, never shared with public OCR

4. **ADMIN requires admin@seisei.tokyo** - Two gates:
   - Gate 1: Traefik middleware (IP allowlist or basic auth)
   - Gate 2: seisei_admin_gate Odoo addon

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| OCR_PUBLIC_DB | TEN-OCR-DEMO | Fixed DB for public OCR |
| TEMPLATE_DB_FULL | TPL-FULL | Full feature template |
| TEMPLATE_DB_QR | TPL-QR | QR ordering template |
| ADMIN_EMAIL | admin@seisei.tokyo | Admin user email |
| ADMIN_DOMAINS | *.erp.seisei.tokyo | Admin domain patterns |
| DEBUG_DB_RESOLUTION | false | Enable debug logging |

## Verification

Run the verification script:

```bash
# Local
./infra/scripts/verify-routing.sh local

# Staging
./infra/scripts/verify-routing.sh staging

# Production
./infra/scripts/verify-routing.sh prod
```

Run smoke tests:

```bash
./infra/scripts/smoke-test.sh three-chain
```
