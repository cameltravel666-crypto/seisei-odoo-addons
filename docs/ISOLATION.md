# QR Ordering vs OCR Module Isolation Strategy

## Overview

This document analyzes potential conflicts between QR Ordering and OCR modules and provides minimal-change isolation recommendations.

---

## 1. Module Analysis

### 1.1 QR Ordering Module (`qr_ordering`)

**Purpose:** Customer-facing QR code ordering for restaurants/cafes

**Routes:**
```python
# qr_ordering/controllers/qr_ordering_controller.py
@http.route('/qr/order/<string:table_token>', type='http', auth='public', website=False)
@http.route('/qr/s/<string:short_code>', type='http', auth='public', website=False)
```

**Characteristics:**
- Public routes (no authentication)
- `website=False` - Does NOT use website module
- Route prefix: `/qr/`
- No QWeb template inheritance
- Self-contained static assets

### 1.2 OCR Modules

**Modules:**
- `odoo_ocr_final` - Financial document OCR
- `custom_ocr_finance` - Custom finance OCR
- `invoice_ocr` - Invoice processing

**Routes:**
```python
# odoo_ocr_final/controllers/ocr_batch_api.py
@http.route('/ocr/batch/progress/<int:batch_id>', type='json', auth='user')
@http.route('/ocr/batch/active', type='json', auth='user')
```

**Characteristics:**
- JSON-RPC routes (not HTTP/HTML)
- Authenticated (`auth='user'`)
- Route prefix: `/ocr/`
- Backend-only (no frontend templates)
- Internal API for Odoo backend

---

## 2. Conflict Risk Assessment

### 2.1 Route Conflicts

| Aspect | QR Ordering | OCR Modules | Risk |
|--------|-------------|-------------|------|
| Prefix | `/qr/` | `/ocr/` | **None** |
| Auth | `public` | `user` | **None** |
| Type | `http` | `json` | **None** |
| Website | `False` | N/A | **None** |

**Verdict:** No route conflicts detected.

### 2.2 Template Inheritance

**QR Ordering:**
- No `inherit_id` templates
- Uses inline templates or standalone pages

**OCR Modules:**
- No frontend templates
- Backend views only (form/tree/action)

**Nagashiro Theme (potential risk):**
```xml
<!-- nagashiro_theme/views/webclient_templates.xml -->
<template id="nagashiro_theme.layout" inherit_id="web.layout">
<template id="nagashiro_theme.login_layout" inherit_id="web.login_layout">
```

**Analysis:**
- Theme inherits `web.layout` (global backend layout)
- Does NOT affect `/qr/` routes (they don't use website templates)
- Safe for OCR (backend only)

**Verdict:** No template conflicts.

### 2.3 Asset Bundles

**QR Ordering:**
- Self-contained in `static/src/`
- Does not inject into `web.assets_backend` or `web.assets_frontend`

**OCR Modules:**
- No custom JavaScript bundles
- Backend views only

**Verdict:** No asset conflicts.

### 2.4 Database Models

| Model | Module | Potential Conflict |
|-------|--------|-------------------|
| `pos.order` | QR Ordering | None - extends existing |
| `pos.config` | QR Ordering | None - extends existing |
| `ocr.usage` | OCR modules | None - isolated model |
| `hr.expense` | OCR modules | Extends with OCR fields |
| `purchase.order` | OCR modules | Extends with OCR fields |

**Verdict:** No model conflicts - each extends different base models.

---

## 3. Identified Isolation Practices (Already Implemented)

The current codebase already implements good isolation:

### 3.1 Route Isolation

```
/qr/*        → QR Ordering (public, no website)
/ocr/*       → OCR API (authenticated, JSON-RPC)
/web/*       → Odoo backend (standard)
/longpolling → WebSocket (standard)
```

### 3.2 Module Dependencies

```
qr_ordering
├── depends: ['base', 'point_of_sale', 'pos_restaurant']
└── NO dependency on: ocr_*, website

odoo_ocr_final
├── depends: ['base', 'hr_expense', 'purchase']
└── NO dependency on: qr_ordering, website

invoice_ocr
├── depends: ['base', 'account']
└── NO dependency on: qr_ordering, website
```

### 3.3 Website ID Separation

Both modules avoid `website_id` dependencies:
- QR Ordering: Uses `website=False` on routes
- OCR: Backend-only, no website integration

---

## 4. Recommendations (Minimal Changes)

### 4.1 Current State: **No Changes Required**

The existing implementation already follows best practices:

1. **Route prefixes are distinct** (`/qr/` vs `/ocr/`)
2. **Authentication models are different** (public vs user)
3. **No shared template inheritance**
4. **No asset bundle conflicts**
5. **Independent model extensions**

### 4.2 Future-Proofing Guidelines

If adding new features, follow these rules:

**For QR Ordering:**
```python
# Always use /qr/ prefix
@http.route('/qr/new-feature', ...)

# Never inherit website templates
# Use standalone templates or inline HTML

# Keep website=False for public routes
@http.route('/qr/...', website=False)
```

**For OCR Modules:**
```python
# Always use /ocr/ prefix for API routes
@http.route('/ocr/new-endpoint', type='json', ...)

# Keep authentication required
@http.route('/ocr/...', auth='user')

# No frontend templates needed
```

### 4.3 If Conflicts Arise in Future

**Scenario A: Route conflict**
```python
# Fix: Add explicit prefix
@http.route('/qr/v2/order', ...)  # QR
@http.route('/ocr/v2/process', ...)  # OCR
```

**Scenario B: Template conflict**
```xml
<!-- Fix: Use website_id condition -->
<template id="..." inherit_id="...">
    <xpath expr="..." position="...">
        <t t-if="website.id == 1">
            <!-- QR specific content -->
        </t>
    </xpath>
</template>
```

**Scenario C: Asset conflict**
```xml
<!-- Fix: Use separate bundles -->
<template id="qr_assets" inherit_id="web.assets_frontend">
    <!-- QR specific -->
</template>

<template id="ocr_assets" inherit_id="web.assets_backend">
    <!-- OCR specific -->
</template>
```

---

## 5. Verification Commands

Run these to verify no conflicts exist:

```bash
# Check route overlaps
grep -rn "@http.route" odoo_modules/seisei/qr_ordering/
grep -rn "@http.route" odoo_modules/seisei/odoo_ocr_final/
grep -rn "@http.route" odoo_modules/seisei/custom_ocr_finance/
grep -rn "@http.route" odoo_modules/seisei/invoice_ocr/

# Check template inheritance
grep -rn "inherit_id" odoo_modules/seisei/qr_ordering/views/
grep -rn "inherit_id" odoo_modules/seisei/odoo_ocr_final/views/

# Check asset bundles
grep -rn "assets_frontend\|assets_backend" odoo_modules/seisei/qr_ordering/
grep -rn "assets_frontend\|assets_backend" odoo_modules/seisei/odoo_ocr_final/
```

---

## 6. Summary

| Aspect | Status | Action Required |
|--------|--------|-----------------|
| Route Isolation | Implemented | None |
| Template Separation | Implemented | None |
| Asset Isolation | Implemented | None |
| Model Independence | Implemented | None |
| Website ID Separation | Implemented | None |

**Conclusion:** The current implementation is well-isolated. No changes required for production deployment.
