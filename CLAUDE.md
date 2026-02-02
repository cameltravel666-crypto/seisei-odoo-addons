# 🚨 Claude Code Entry Point

**REPO IDENTITY**: Odoo Custom Addons (Source of Truth for ALL Odoo modules)

**CRITICAL - Read these 3 files BEFORE any work**:
1. `START_HERE.md` - 30s project overview
2. `AI_RULES.md` - Strict constraints (PRODUCTION ERP CODE)
3. `SNAPSHOT/PROJECT_STATUS.md` - Current state

**THIS REPO IS**:
- Source of Truth for 26+ Odoo custom addons
- Location: `odoo_modules/seisei/`
- Production multi-tenant ERP backend

**THIS REPO IS NOT**:
- ❌ Next.js frontend (ignore `package.json`, `src/`, `prisma/` - duplicates)
- ❌ Infrastructure hub (duplicated `infra/` - use `server-apps/infra/`)

**TOP PROHIBITIONS**:
1. DO NOT edit Odoo addons without testing in staging FIRST
2. DO NOT skip `__manifest__.py` version updates
3. DO NOT edit Next.js files here (use `Seisei ERP` repo)
4. DO NOT modify production without approval

**After reading above files, confirm**: "This is the Odoo addons repository with 26+ custom modules."
