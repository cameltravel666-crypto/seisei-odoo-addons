# Registration & Provisioning Audit Report

## 1. Current Flow Analysis (src/app/api/auth/register/route.ts)

### 1.1 Registration Flow (Lines 27-225)

| Step | Description | Status |
|------|-------------|--------|
| 1 | Validate email (OAuth token or email verification) | OK |
| 2 | Check if email already registered | OK |
| 3 | Generate tenant code (TEN-XXXXXXXX) | ISSUE: No concurrency protection |
| 4 | Create Tenant (status: pending) | OK |
| 5 | Initialize tenant features | OK |
| 6 | Create User (odooUserId: 0 placeholder) | OK |
| 7 | Create Session | OK |
| 8 | Trigger async provisioning (fire-and-forget) | CRITICAL ISSUE |
| 9 | Send welcome email | OK (async, non-blocking) |
| 10 | Return success | OK |

### 1.2 Provisioning Flow (Lines 443-587)

Current implementation uses **fire-and-forget** pattern with no persistence:

```typescript
function triggerProvisioningAsync(...): void {
  // Fire and forget - don't await
  (async () => {
    // ... all provisioning steps
  })();
}
```

| Step | Current Implementation | Issue |
|------|----------------------|-------|
| Step 1 | Copy DB via db-copy-service | No retry on failure |
| Step 2 | Update Odoo admin user | Uses hardcoded 'admin123' password |
| Step 3 | Create tenant in Odoo 19 | No idempotency check |
| Step 4 | Bridge API metadata | Optional, warns on failure |
| Step 5 | Update BizNexus tenant | Final step |
| Step 6 | Update Odoo 19 sync status | Optional |

## 2. Discrepancies: Specification vs Implementation

| Requirement | Specification | Current Implementation | Gap |
|-------------|---------------|----------------------|-----|
| Database naming | `ten-00000001` | Code says `tenantCode.toLowerCase()` but logs show `cust_ten_XXXXXXXX` | Build/Deploy mismatch |
| Job persistence | Required | None (fire-and-forget) | Critical |
| Idempotency | Required | Not implemented | Critical |
| Retry mechanism | Required | None | Critical |
| Concurrency control | Required | None | Critical |
| Status tracking | Per-step status | Only `pending/provisioning/completed/failed` | Missing granularity |
| Odoo 19 user sync | Create user entity | Only creates tenant record | Missing |

## 3. Step Numbering Contradictions

### Current Code Steps:
1. COPY_DB (db-copy-service)
2. UPDATE_ODOO_ADMIN (JSON-RPC to Odoo 18)
3. CREATE_ODOO19_TENANT (XML-RPC to Odoo 19)
4. BRIDGE_METADATA (Bridge API)
5. UPDATE_BIZNEXUS_TENANT
6. UPDATE_ODOO19_SYNC_STATUS

### Required Steps (per specification):
1. STEP_1_COPY_DB
2. STEP_2_ODOO18_AUTH
3. STEP_3_ODOO18_UPDATE_ADMIN_USER
4. STEP_4_ODOO19_UPSERT_TENANT
5. STEP_5_ODOO19_UPSERT_TENANT_USER (MISSING)
6. STEP_6_BRIDGE_METADATA_UPSERT
7. STEP_7_FINALIZE_TENANT

**Missing Step: STEP_5_ODOO19_UPSERT_TENANT_USER** - Currently only creates tenant, not user mapping.

## 4. Critical Risks

### 4.1 Concurrency
- **tenant_code generation**: Uses `findFirst` + `orderBy: createdAt desc` which is NOT concurrent-safe
- **Risk**: Two simultaneous registrations could get the same tenant code
- **Fix**: Use database sequence or atomic counter

### 4.2 Idempotency
- **Database copy**: Will fail if DB already exists (no skip logic)
- **Odoo 19 tenant**: Creates duplicate records on retry
- **Fix**: Check existence before create, use upsert patterns

### 4.3 Timeout
- **No timeout on external calls**: fetch calls have no AbortController
- **Risk**: Provisioning can hang indefinitely
- **Fix**: Add timeout to all fetch/RPC calls

### 4.4 Partial Failure / Rollback
- **Current behavior**: On any step failure, sets `provisionStatus: 'failed'`
- **No cleanup**: Created DB is orphaned on later step failure
- **No resume**: Cannot continue from failed step
- **Fix**: Track `current_step`, implement resume logic

### 4.5 Observability
- **Logging**: Uses `console.log/error` with `[Provisioning]` prefix
- **Missing**: job_id, step, elapsed_ms, structured format
- **Missing**: Status query API

### 4.6 Security
- **Hardcoded credentials**: `admin123` password in code (line 340)
- **Missing**: Internal API token validation for db-copy-service
- **Fix**: Use environment variables for all credentials

## 5. Field Mapping: BizNexus to Odoo 19

### BizNexus User Model
| Field | Type | Description |
|-------|------|-------------|
| id | String | CUID |
| email | String | User email |
| displayName | String | User display name |
| tenantId | String | FK to Tenant |
| odooUserId | Int | Odoo 18 user ID |
| odooLogin | String | Odoo login name |
| isAdmin | Boolean | Admin flag |

### BizNexus Tenant Model
| Field | Type | Description |
|-------|------|-------------|
| id | String | CUID |
| tenantCode | String | TEN-XXXXXXXX |
| name | String | Company name |
| odooBaseUrl | String | Odoo 18 URL |
| odooDb | String | Odoo 18 database name |
| provisionStatus | String | pending/provisioning/completed/failed |
| bridgeTenantId | String | Odoo 19 tenant ID |

### Odoo 19 Model: vendor.ops.tenant
| Field | Type | Maps From |
|-------|------|-----------|
| name | Char | tenant.name |
| code | Char | tenant.tenantCode |
| subdomain | Char | Extracted from tenantCode |
| plan | Selection | 'starter' |
| bridge_sync_status | Selection | 'pending'/'ok' |
| business_base_url | Char | tenant.odooBaseUrl |
| notes | Text | Owner email + industry |

### Odoo 19 Model: vendor.ops.tenant.user (TO BE CREATED)
| Field | Type | Maps From |
|-------|------|-----------|
| tenant_id | Many2one | vendor.ops.tenant.id |
| email | Char | user.email |
| name | Char | user.displayName |
| role | Selection | 'admin' if isAdmin |
| odoo18_user_id | Integer | user.odooUserId |
| odoo18_login | Char | user.odooLogin |

## 6. Recommendations

### Priority 1: Critical Fixes
1. Implement ProvisioningJob table for persistence
2. Add concurrency-safe tenant_code generation
3. Add idempotency checks for all external calls
4. Add timeout to all fetch/RPC calls

### Priority 2: Required Features
5. Implement step-based resume logic
6. Add status query API
7. Implement STEP_5_ODOO19_UPSERT_TENANT_USER

### Priority 3: Observability
8. Structured logging with job_id, step, elapsed_ms
9. Error capture with stack traces (sanitized)

---

*Generated: 2026-01-17*
*Auditor: Claude Code*
