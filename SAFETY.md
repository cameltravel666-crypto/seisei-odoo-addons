# ⚠️ Safety Guidelines

**Repo**: seisei-odoo-addons (Odoo Custom Addons)
**Risk Level**: HIGH (production ERP backend)

---

## 🚫 High-Risk Directories

**DO NOT modify these** (duplicates - use correct Source of Truth):

```
❌ src/                 → Use Seisei ERP/src/
❌ app/                 → Use Seisei ERP/app/
❌ prisma/              → Use Seisei ERP/prisma/
❌ infra/               → Use server-apps/infra/
❌ package.json         → Use Seisei ERP/package.json (ignore this one)
```

**HIGH RISK - Modify with EXTREME care**:

```
⚠️ odoo_modules/seisei/seisei_billing/
⚠️ odoo_modules/seisei/seisei_entitlements/
⚠️ odoo_modules/seisei/seisei_database_routing/
```

---

## 🚨 Prohibited Commands

```bash
# NEVER skip manifest version updates
# After editing any Odoo addon:
vim odoo_modules/seisei/<module>/__manifest__.py  # Update 'version' field

# NEVER deploy to production without staging test
# Always test in staging first:
# 1. Deploy to staging
# 2. Test thoroughly
# 3. Get approval
# 4. Then deploy to production

# NEVER modify production database directly
# Use Odoo shell or migrations only
```

---

## ✅ Default Behavior

**Before ANY Odoo addon change**:
1. Read `@CLAUDE.md`
2. Read `START_HERE.md`
3. Read `AI_RULES.md`
4. Test in staging FIRST
5. Update `__manifest__.py` version

---

## 💚 Safe Operations

- Add new Odoo addons in `odoo_modules/seisei/`
- Update addon models/views (after staging test)
- Add Python dependencies to requirements.txt
- Update addon manifest metadata

---

## ⚡ If You Must Modify Production

Critical checklist:
- [ ] Tested in staging environment
- [ ] Updated `__manifest__.py` version
- [ ] Created database migration (if schema changed)
- [ ] Documented changes in addon README
- [ ] Got explicit approval from CTO/lead
- [ ] Backup plan ready (rollback strategy)
