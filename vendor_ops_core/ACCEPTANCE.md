# Vendor Ops Core - Acceptance Test Checklist

**Version**: 19.0.2.0.0
**Baseline Anchor**: `baseline-tenant-code-ok-20260104-052905` (commit `8092d47`)
**Merge**: vendor_ops_intake_notion functionality merged into vendor_ops_core

---

## Pre-Deployment Verification

### Code Syntax Check
```bash
# Check Python syntax
python3 -m py_compile models/vendor_ops_tenant.py
python3 -m py_compile models/vendor_ops_intake_batch.py
python3 -m py_compile services/bridge_client.py
python3 -m py_compile wizard/vendor_ops_start_intake_wizard.py

# Check XML syntax
xmllint --noout views/*.xml
```

---

## Acceptance Test Cases

### 1. Tenant Auto-Generation (CRITICAL)

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1.1 | Create new Tenant with name "Test Tenant" | Record created | [ ] |
| 1.2 | Check `code` field | Auto-generated as `TEN-XXXXXX` (not empty, not restart from 1) | [ ] |
| 1.3 | Check `subdomain` field | Auto-filled as `XXXXXX` (numeric part of code) | [ ] |
| 1.4 | Check `domain_primary` field | Auto-filled as `XXXXXX.erp.seisei.tokyo` | [ ] |
| 1.5 | Check `customer_db_name` field | Auto-filled as `cust_ten_xxxxxx` | [ ] |

**CRITICAL**: Code must NOT restart from TEN-000001 if tenants already exist!

### 2. Start Intake Button

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 2.1 | Open Tenant form | "Start Intake (Notion)" button visible in header | [ ] |
| 2.2 | Click "Start Intake (Notion)" | Wizard dialog opens | [ ] |
| 2.3 | Verify tenant_code in wizard | Auto-filled, readonly | [ ] |
| 2.4 | Enter store_code: `S001` | Field accepts input | [ ] |
| 2.5 | Enter effective_month: `2026-01` | Field accepts input | [ ] |
| 2.6 | Click "Start Intake" | Batch created, redirects to batch form | [ ] |

### 3. Intake Batch Creation via Bridge

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 3.1 | Check batch record | `bridge_batch_id` has UUID value | [ ] |
| 3.2 | Check `client_record_url` | Notion URL present | [ ] |
| 3.3 | Check `status` | Set to "collecting" | [ ] |
| 3.4 | Click "Open Client URL" button | Opens Notion page in new tab | [ ] |

### 4. Intake Batch List in Tenant Form

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 4.1 | Open Tenant form | "Intake Batches" tab visible | [ ] |
| 4.2 | Check batch list | Created batch appears in list | [ ] |
| 4.3 | Verify action buttons | URL/Pack/Pull buttons visible | [ ] |
| 4.4 | Check status badge | Shows correct status with color | [ ] |

### 5. Generate Pack

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 5.1 | Click "Generate Pack" button (magic wand icon) | Pack generation starts | [ ] |
| 5.2 | Check `notion_pack_url` | Filled with Notion URL | [ ] |
| 5.3 | Click "Open Pack URL" button | Opens Notion page in new tab | [ ] |

### 6. Pull from Notion

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 6.1 | Click "Pull from Notion" button | Pull process starts | [ ] |
| 6.2 | Check `last_pull_at` | Updated to current time | [ ] |
| 6.3 | Check `last_pull_summary` | JSON with counts | [ ] |
| 6.4 | Check `status` | Changed to "pulled" | [ ] |
| 6.5 | Check chatter | Pull summary message posted | [ ] |

### 7. Error Handling

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 7.1 | Trigger Bridge API error | `last_error` field populated | [ ] |
| 7.2 | Check error display | Error banner visible in form | [ ] |
| 7.3 | Check `bridge_trace_id` | Trace ID captured | [ ] |
| 7.4 | Check chatter | Error message posted | [ ] |

### 8. Bridge Sync (Tenant)

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 8.1 | Click "Sync to Bridge" button | Sync process runs | [ ] |
| 8.2 | Check `bridge_sync_status` | Shows "ok" with green badge | [ ] |
| 8.3 | Check `bridge_synced_at` | Updated timestamp | [ ] |

### 9. Search and Filters

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 9.1 | Open Intake Batches list | Default view loads | [ ] |
| 9.2 | Filter by "Pulled" | Only pulled batches shown | [ ] |
| 9.3 | Filter by "Has Error" | Only batches with errors shown | [ ] |
| 9.4 | Group by Tenant | Batches grouped correctly | [ ] |

### 10. Sequence Alignment After Upgrade

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 10.1 | Note max tenant code before upgrade | e.g., TEN-000123 | [ ] |
| 10.2 | Run module upgrade | No errors | [ ] |
| 10.3 | Create new tenant | Code is TEN-000124 (next number) | [ ] |

### 11. Tenant Chatter Functionality (mail.thread)

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 11.1 | Create new tenant | Saves without `_get_thread_with_access` error | [ ] |
| 11.2 | Check tenant form | Chatter visible at bottom of form | [ ] |
| 11.3 | Post internal note | Note appears in Chatter history | [ ] |
| 11.4 | Change tenant name | Change tracked in Chatter history | [ ] |
| 11.5 | Change plan | Change tracked in Chatter history | [ ] |
| 11.6 | Check bridge_sync_status change | Status change tracked in Chatter | [ ] |

**Note**: Tenant auto-generation code must still work after mail.thread fix.

### 12. Start Intake - Batch Name Generation

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 12.1 | Open Tenant form | "Start Intake (Notion)" button visible | [ ] |
| 12.2 | Click "Start Intake (Notion)" | Wizard opens | [ ] |
| 12.3 | Enter store_code: `S001`, effective_month: `2026-01` | Fields accept input | [ ] |
| 12.4 | Click "Start Intake" | Batch created successfully | [ ] |
| 12.5 | Check batch `name` field | Format: `TEN-XXXXXX/S001/2026-01` | [ ] |
| 12.6 | Click "Start Intake" again with same params | Reuses existing batch (no duplicate) | [ ] |
| 12.7 | Check tenant/batch Chatter | Tracking visible for field changes | [ ] |

**Note**: Batch name format: `{tenant_code}/{store_code}/{effective_month}`

---

## Rollback Procedure

If any critical test fails:

```bash
# 1. Rollback to baseline
git checkout baseline-tenant-code-ok-20260104-052905

# 2. Sync to server
rsync -avz vendor_ops_core/ ubuntu@13.159.193.191:/opt/odoo/custom-addons/vendor_ops_core/

# 3. Restart Odoo
ssh ubuntu@13.159.193.191 'sudo systemctl restart odoo'
```

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Product Owner | | | |

---

## Notes

- Version 19.0.2.0.0 merges vendor_ops_intake_notion functionality
- All Bridge API calls use soft consistency (errors logged, don't block UI)
- Sequence alignment runs on module install/upgrade via post_init_hook
