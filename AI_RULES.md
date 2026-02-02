# AI Rules - Seisei Odoo Addons

**Repo**: seisei-odoo-addons
**Last Updated**: 2026-02-02
**Strictness Level**: VERY HIGH (Production ERP)

---

## Critical Context

**THIS REPO CONTAINS THE ACTUAL ERP BUSINESS LOGIC**

Unlike "Seisei ERP" (which is just frontend), this repo contains:
- All Odoo custom addons (26+ modules)
- Multi-tenant infrastructure
- Production business logic

**Impact**: Changes here affect all tenants in production.

---

## Absolute Prohibitions

### 1. Never Modify Production Addons Without Testing

```
FORBIDDEN:
- Direct edits to odoo_modules/seisei/* in production
- Installing untested addons on production tenants
- Modifying database schema without migrations
```

**Required workflow**:
1. Develop addon locally
2. Test in staging environment
3. Get approval
4. Deploy to production

### 2. Never Touch These Files (Duplicates)

```
FORBIDDEN FILES (Next.js duplicates):
- package.json
- src/
- app/
- prisma/
- node_modules/
- .next/
```

**Reason**: These are duplicates from `Seisei ERP`. Editing them causes confusion.

**If you need to modify them**: Work in `Seisei ERP` repo instead.

### 3. Never Modify Community Addons

```
FORBIDDEN:
- odoo_modules/community/*
```

**Reason**: Community addons should not be modified. Use Odoo inheritance to extend.

### 4. Never Commit Secrets

```
FORBIDDEN:
- .env files
- Odoo master passwords
- Database credentials
- API keys
```

**Use**: AWS SSM Parameter Store for secrets

### 5. Never Skip Addon Manifest

Every addon MUST have:
```python
# __manifest__.py
{
    'name': 'Addon Name',
    'version': '18.0.1.0.0',  # MUST match Odoo version
    'depends': ['base'],       # MUST list dependencies
    'data': [],                # XML files in order
    'installable': True,
}
```

---

## Required Actions

### Before Creating/Modifying Addon

**Checklist**:
```bash
# 1. Check current addons
ls odoo_modules/seisei/

# 2. Read existing code for patterns
cat odoo_modules/seisei/seisei_billing/__manifest__.py
cat odoo_modules/seisei/seisei_billing/models/__init__.py

# 3. Understand dependencies
grep "depends" odoo_modules/seisei/*/manifest__.py

# 4. Read Odoo documentation
# https://www.odoo.com/documentation/18.0/
```

### Odoo Development Best Practices

**Model naming**:
```python
# CORRECT
class SeiseiTenant(models.Model):
    _name = 'seisei.tenant'
    _description = 'Seisei Tenant'

# WRONG
class Tenant(models.Model):
    _name = 'tenant'  # Too generic
```

**File structure**:
```
my_addon/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   └── my_model.py
├── views/
│   └── my_model_views.xml
├── security/
│   └── ir.model.access.csv
└── data/
    └── default_data.xml
```

**Dependencies order**:
- `__manifest__.py`: List in installation order
- XML files in `data`: Must be in correct sequence

### After Modifying Addon

**Update checklist**:
```bash
# 1. Test in local Odoo
docker restart odoo-local
# Upgrade addon in Odoo UI

# 2. Check logs for errors
docker logs odoo-local | grep ERROR

# 3. Update version in __manifest__.py
# Increment last digit: 18.0.1.0.0 -> 18.0.1.0.1

# 4. Document changes
vim SNAPSHOT/PROJECT_STATUS.md

# 5. Commit
git commit -m "Update addon_name: description

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Output Format Requirements

### File Path References

```
CORRECT: odoo_modules/seisei/seisei_billing/models/seisei_tenant.py:42
CORRECT: odoo_modules/seisei/seisei_db_router/__manifest__.py:15

WRONG: seisei_tenant.py (ambiguous)
```

### Code Blocks

Always include file path:
````python
```python
# odoo_modules/seisei/seisei_billing/models/seisei_tenant.py
from odoo import models, fields

class SeiseiTenant(models.Model):
    _name = 'seisei.tenant'
```
````

---

## Repository-Specific Rules

### 1. Multi-Tenant Isolation

**CRITICAL**: Every model must respect tenant isolation:

```python
# CORRECT - uses dbfilter
class MyModel(models.Model):
    _name = 'my.model'

    @api.model
    def search(self, args, **kwargs):
        # Tenant isolation enforced by seisei_db_router
        return super().search(args, **kwargs)

# WRONG - bypasses tenant isolation
class MyModel(models.Model):
    def get_all_data_across_tenants(self):
        # This would violate tenant isolation
        self.env.cr.execute("SELECT * FROM my_model")
```

### 2. Database Schema Changes

**Always use Odoo migrations**:

```python
# migrations/18.0.1.0.1/pre-migrate.py
def migrate(cr, version):
    cr.execute("""
        ALTER TABLE my_table
        ADD COLUMN new_field VARCHAR(255)
    """)
```

**Update manifest version**: `18.0.1.0.0` -> `18.0.1.0.1`

### 3. External API Integration

**Use proper error handling**:

```python
# CORRECT
import requests
import logging
_logger = logging.getLogger(__name__)

def call_external_api(self):
    try:
        response = requests.post(url, json=data, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        _logger.error("API call failed: %s", e)
        raise UserError("Failed to connect to external service")
```

### 4. Security Rules

**Always define access rights**:

```csv
# security/ir.model.access.csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_my_model_user,my.model.user,model_my_model,base.group_user,1,1,1,0
access_my_model_manager,my.model.manager,model_my_model,base.group_system,1,1,1,1
```

---

## Common Mistakes to Avoid

### Mistake 1: Editing Next.js Files

**WRONG LOCATION**:
```
seisei-odoo-addons/src/app/page.tsx
seisei-odoo-addons/package.json
```

**CORRECT**: These belong in `Seisei ERP` repo

### Mistake 2: Not Updating __manifest__.py

After adding XML files:
```python
# WRONG
'data': []  # Empty, but you added views.xml

# CORRECT
'data': [
    'security/ir.model.access.csv',
    'views/my_views.xml',
    'data/default_data.xml',
]
```

### Mistake 3: Hardcoding Tenant-Specific Data

```python
# WRONG
def get_tenant_url(self):
    return "https://acme.erp.seisei.tokyo"  # Hardcoded

# CORRECT
def get_tenant_url(self):
    return "https://%s.erp.seisei.tokyo" % self.database_name
```

---

## Workflow Examples

### Creating New Addon

```bash
# 1. Create structure
cd odoo_modules/seisei/
mkdir -p my_addon/{models,views,security}
cd my_addon

# 2. Create files
cat > __manifest__.py <<EOF
{
    'name': 'My Addon',
    'version': '18.0.1.0.0',
    'category': 'Custom',
    'depends': ['base'],
    'data': [
        'security/ir.model.access.csv',
        'views/my_views.xml',
    ],
    'installable': True,
}
EOF

# 3. Create model
cat > models/__init__.py <<EOF
from . import my_model
EOF

# 4. Implement model
# models/my_model.py

# 5. Create views
# views/my_views.xml

# 6. Create security
# security/ir.model.access.csv

# 7. Test locally
docker restart odoo-local
```

---

## Dependencies & Versions

**Odoo Version**: 18.0 (Community Edition base)

**Python Requirements**:
- Python 3.11
- Standard Odoo dependencies
- Custom: See requirements.txt if exists

**DO NOT**:
- Upgrade Odoo version without full testing
- Install conflicting modules
- Use deprecated APIs

---

## Related Documentation

- **Global Rules**: `~/Projects/CLAUDE_GLOBAL.md`
- **Workspace Map**: `~/Projects/WORKSPACE_MAP.md`
- **Odoo Docs**: https://www.odoo.com/documentation/18.0/
- **Current Status**: `SNAPSHOT/PROJECT_STATUS.md`

---

**Remember**: This is PRODUCTION ERP CODE. Test thoroughly before deploying.
