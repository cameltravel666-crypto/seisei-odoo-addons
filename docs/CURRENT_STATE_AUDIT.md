# BizNexus Current State Audit
**Date:** January 17, 2026
**Scope:** Registration, Provisioning, RBAC/Membership, Subscription, Authentication, File Storage, Audit Logging, Mobile Apps

---

## Executive Summary

The BizNexus codebase has a **moderately advanced** implementation with several critical gaps that must be addressed for production readiness and App Store compliance.

**Key Status:**
- ✅ **Implemented:** Registration flow, provisioning jobs table, RBAC models, audit logging, subscription management (Stripe)
- ⚠️ **Partial:** Provisioning uses `setImmediate()` (not a persistent worker), invitations not yet implemented, file storage absent
- ❌ **Missing:** Internal ops console, employee password reset/set-password links, S3 file storage, app compliance cleanup, store management

---

## 1. Registration Flow

### Current Implementation: ⚠️ PARTIAL (70% complete)

**Files:**
- `/src/app/api/auth/register/route.ts` - Main registration endpoint
- `/src/lib/auth.ts` - Auth utilities (JWT, cookies, tenant code generation)
- `/src/app/api/auth/login/route.ts` - Login endpoint
- `/src/app/api/auth/send-code/route.ts`, `/verify-code/route.ts` - Email verification
- `/src/app/api/auth/google/route.ts`, `/callback/google/route.ts` - OAuth flow
- `prisma/schema.prisma` - User, Tenant, Session, PendingRegistration models

### What Works:
1. **OAuth & Email verification flow** - Supports Google OAuth and email verification codes
2. **Concurrent-safe tenant code generation** - `TEN-00000001` format with uniqueness checks
3. **Immediate session creation** - JWT token issued, user created as OWNER (isAdmin=true)
4. **Provisioning job triggered** - Async call to `triggerProvisioningAsync(jobId)`
5. **Feature initialization** - All modules enabled for new tenants (trial/starter plan)
6. **Welcome email sent** - Non-blocking email on successful registration

### Critical Gaps:
1. **No password management for Owner** - Registration creates user but no explicit password set
   - Owner login depends on `odooSession.sessionId` from Odoo (which may not exist until provisioning completes)
   - No "set password" link or magic link after registration
2. **No employee invitation workflow** - Missing:
   - Invitation tokens (one-time, short-lived, single-use)
   - "Set password" link for invited staff/managers
   - Invitation status tracking (pending, accepted, revoked)
3. **No store management** - `stores` table doesn't exist; hardcoded to single store
4. **Owner can't invite others** - No API endpoint for Owner to invite Manager/Staff
5. **No password reset capability** - Once set, can't be reset (depends entirely on Odoo)

**Requirement Compliance:**
- ❌ "Owner sets password via one-time link" - Missing
- ❌ "Owner invites Manager/Staff via set-password link" - Missing
- ❌ "Support reissue/revoke/disable employee" - Partially in membership service, but no invitation links
- ⚠️ "No plain-text password in emails" - Compliant (none sent), but no alternative established

---

## 2. Provisioning System

### Current Implementation: ✅ WORKING, ⚠️ NEEDS WORKER

**Files:**
- `/src/lib/provisioning/index.ts` - Exports
- `/src/lib/provisioning/types.ts` - Enums, constants, interfaces
- `/src/lib/provisioning/orchestrator.ts` - Main job runner logic
- `/src/lib/provisioning/job-repository.ts` - DB access (lock, update, mark complete)
- `/src/lib/provisioning/steps.ts` - Step implementations
- `/src/lib/provisioning/logger.ts` - Logging utilities
- `/src/app/api/provisioning/status/route.ts` - Status API
- `/src/app/api/provisioning/retry/route.ts` - Manual retry
- `prisma/schema.prisma` - `ProvisioningJob` model

### What Works:
1. **Persistent job storage** - `ProvisioningJob` table with status tracking
2. **Multi-step orchestration** - 8 steps: INIT → COPY_DB → ODOO18_AUTH → ODOO18_UPDATE_ADMIN → ODOO19_UPSERT_TENANT → ODOO19_UPSERT_USER → BRIDGE_METADATA → FINALIZE
3. **Locking mechanism** - `lockedAt`, `lockedBy` fields prevent concurrent execution on same tenant
4. **Idempotency** - `progressData` JSON tracks what's done; steps check before re-running
5. **Failure tracking** - `failedStep`, `lastError`, `attempts` counters
6. **Error sanitization** - Secrets/passwords scrubbed from error messages
7. **Status API** - `GET /api/provisioning/status?tenant_code=...` returns progress (0-100%)
8. **Retry support** - Marks failed job with next retry time; attempts counter

### Critical Gaps:
1. **Async via `setImmediate()` only**
   ```typescript
   export function triggerProvisioningAsync(jobId: string): void {
     setImmediate(async () => { /* run job */ });
   }
   ```
   - If process crashes, job stuck in RUNNING/PENDING forever
   - No persistent queue consumer
   - No way to recover hung jobs from container restart

2. **No worker process/queue** - No dedicated worker consuming `ProvisioningJob` with status=PENDING/FAILED
   - No cron/scheduled task to retry expired jobs
   - No health check to detect stalled jobs

3. **Step 3 (Update Admin) may have hardcoded IDs**
   - Requirement says "must search for template admin, not hardcode user_id=2"
   - Needs verification in `steps.ts`

4. **No ops_admin separation**
   - Requirement: "Create ops_admin (internal) with random 24+ char password (key-managed)"
   - Current: Updates a user in Odoo18, likely doesn't separate ops from customer owner
   - No credential rotation or secure storage

5. **Odoo18 vs Odoo19 split unclear**
   - Steps 1-3 interact with Odoo18; steps 4-5 with Odoo19
   - No clear docs on template databases or how databases are mapped

**Requirement Compliance:**
- ✅ Persistent job storage + status API
- ✅ Locking to prevent concurrent runs
- ✅ Idempotent retries
- ❌ No persistent worker (uses setImmediate)
- ❌ No ops_admin separation
- ⚠️ Step 3 hardcoding unverified

---

## 3. User / RBAC Model

### Current Implementation: ✅ WELL-DESIGNED

**Files:**
- `prisma/schema.prisma` - Role enum, Membership model, Entitlements
- `/src/lib/membership-service.ts` - Full CRUD + role enforcement
- `/src/lib/guards.ts` - Authorization guards (tenantGuard, roleGuard, storeScopeGuard)
- `/src/app/api/admin/users/route.ts` - List/invite users
- `/src/app/api/admin/users/[id]/route.ts` - Update/suspend user

### What Works:
1. **Roles enum** - `BILLING_ADMIN | ORG_ADMIN | MANAGER | OPERATOR`
2. **Membership model** - Links user ↔ tenant with role + store_scope (string array)
3. **Role hierarchy** - Guards enforce: BILLING_ADMIN > ORG_ADMIN > MANAGER > OPERATOR
4. **Store scope** - Empty array = all stores; non-empty = limited access
5. **Membership status** - ACTIVE | INACTIVE | SUSPENDED (prevents login)
6. **Last-admin protection** - Can't demote/remove/suspend the last admin
7. **Audit logging** - logRoleChanged, logStoreScopeChanged, logUserSuspended, logUserActivated, logUserInvited
8. **Guard functions** - tenantGuard, roleGuard, entitlementGuard, storeScopeGuard, combinedGuard
9. **Membership ensured at login** - Creates membership if missing (backward compat)

### Gaps:
1. **No stores table** - store_scope is just string IDs with no backing table
   - Can't enumerate available stores or validate store IDs
   - No store metadata (name, location, etc.)

2. **No invitation tokens** - Membership service has `inviteUser()` but:
   - Creates user + membership immediately
   - No "pending" state or token for staff to set own password
   - No email sent (caller must do it)

3. **No password reset flow** - Once account created:
   - No "forgot password" link
   - No "set password" link for invited staff
   - Depends entirely on Odoo for password management

4. **RBAC not enforced in all APIs** - Most app routes in `(app)` layout don't call guards
   - `/settings`, `/pos`, `/sales`, etc. don't validate role/entitlement
   - Frontend trusts session without server validation

5. **Entitlements not enforced at API layer** - Guards check modules but:
   - Most business logic APIs don't call `entitlementGuard()`
   - User limits not checked before operations

**Requirement Compliance:**
- ✅ Role hierarchy (OWNER/MANAGER/STAFF mapping: BILLING_ADMIN/MANAGER/OPERATOR)
- ✅ Store scope model
- ✅ Membership status tracking
- ❌ Stores table missing
- ❌ Invitation tokens missing
- ⚠️ API-level RBAC enforcement incomplete

---

## 4. Subscription / Billing

### Current Implementation: ✅ MOSTLY COMPLETE

**Files:**
- `/src/lib/subscription-service.ts` - Core subscription logic
- `/src/lib/stripe.ts`, `/src/lib/stripe-client.ts` - Stripe integration
- `/src/lib/entitlements-service.ts` - Entitlements (modules, limits, status)
- `/src/app/api/subscription/route.ts` - Create/read subscription
- `/src/app/api/subscription/sync/route.ts` - Sync with Odoo19 or Stripe
- `/src/app/api/stripe/webhook/route.ts` - Webhook handler
- `/src/app/api/stripe/checkout/route.ts` - Create checkout session
- `/src/app/api/stripe/portal/route.ts` - Customer portal
- `/src/app/(app)/settings/subscription/page.tsx` - UI (has purchase CTA)
- `prisma/schema.prisma` - Subscription, SubscriptionItem, SubscriptionProduct, Invoice, Payment, Entitlements models

### What Works:
1. **Subscription model** - One per tenant, tracks status (TRIAL/ACTIVE/PAST_DUE/CANCELLED/EXPIRED)
2. **Subscription items** - Can have multiple products (base plan + modules + addons)
3. **Trial period** - Automatic conversion to ACTIVE after trial OR manual payment
4. **Stripe integration** - Full checkout, portal, webhook, subscription sync
5. **Entitlements system** - Maps subscription → enabled modules + limits (maxUsers, maxStores, maxTerminals)
6. **Status sync** - Auto-expires subscriptions, detects trial end, handles past-due
7. **Multiple product types** - BASE_PLAN, MODULE, SERVICE, HARDWARE, ADDON
8. **Multi-language** - Product names in EN/ZH/JA
9. **Invoices + Payments** - Full accounting records with Odoo integration

### Critical Gaps (App Store Compliance):
1. **No Owner-only enforcement**
   - Subscription page `/settings/subscription/page.tsx` has no role check
   - Manager/Staff shouldn't see pricing or purchase UI

2. **App Store Compliance Issue**
   - Subscription page displays:
     - ✅ Product prices (info only, OK)
     - ✅ Current subscription status (OK)
     - ❌ "立即支付订阅" (Pay Now) button with Stripe CTA → **VIOLATES 3.1.1**
     - ❌ Shopping cart with purchase flow → **VIOLATES 3.1.1**
   - App should NEVER show purchase UI

3. **Owner-only API not enforced** - `/api/subscription` routes don't check `role === BILLING_ADMIN`

**Requirement Compliance:**
- ✅ Subscription model (trial → active → expired)
- ✅ Entitlements output (modules, limits, status)
- ❌ Web page has purchase CTA (App store issue if rendered in app)
- ❌ No Owner-only RBAC enforcement in API
- ❌ Manager/Staff can see pricing (should be hidden)

---

## 5. Authentication

### Current Implementation: ✅ SOLID

**Files:**
- `/src/lib/auth.ts` - JWT, encryption, session management
- `/src/app/api/auth/login/route.ts` - Email+password login
- `/src/app/api/auth/logout/route.ts` - Logout
- `/src/app/api/auth/me/route.ts` - Current user info
- `prisma/schema.prisma` - User, Session, VerificationCode models

### What Works:
1. **JWT tokens** - HS256, 24h expiry, includes userId, tenantId, tenantCode, odooUserId, isAdmin, sessionId
2. **Encryption** - AES-256-CBC for sensitive data (Odoo session IDs)
3. **HttpOnly cookies** - Secure transport of JWT
4. **Session table** - Stores encrypted odooSessionId + expiry
5. **Logout endpoint** - Clears cookie
6. **Current user endpoint** - `/api/auth/me` returns user + tenant + membership + modules
7. **Email verification codes** - 6-digit codes with expiry
8. **Google OAuth** - Supported via PendingRegistration (stores user info during registration flow)

### Gaps:
1. **No password reset endpoint** - Can't change password after registration
2. **No middleware auth guard** - No automatic redirect to login for protected routes
3. **JWT secret may use defaults**
   ```typescript
   const JWT_SECRET = new TextEncoder().encode(
     process.env.JWT_SECRET || 'default-secret-key-change-in-production'
   );
   ```
4. **Encryption key derivation uses hardcoded 'salt'**
5. **No rate limiting** - No protection against brute-force login attempts

**Requirement Compliance:**
- ✅ JWT-based sessions
- ✅ Encrypted sensitive data
- ❌ No password reset flow
- ❌ No middleware-level auth guards
- ⚠️ Weak defaults for secrets

---

## 6. File Storage

### Current Implementation: ❌ MISSING

**Status:** No S3, presigned URLs, or file table found.

**What's needed (from requirements):**
- `files` table: id, tenant_id, uploader_user_id, store_id, bucket, key, size, mime, checksum, original_filename, category, visibility_scope, created_at, deleted_at
- APIs: POST /api/files/presign-upload, POST /api/files/complete, GET /api/files, POST /api/files/presign-download
- Presigned PUT/POST for client-direct upload
- Presigned GET for download
- RBAC + store_scope enforcement
- Audit logging (FILE_UPLOAD, FILE_DOWNLOAD, FILE_DELETE)
- Future: thumbnails, OCR, lifecycle, CDN

**Requirement Compliance:**
- ❌ Entirely missing

---

## 7. Audit Logging

### Current Implementation: ✅ COMPLETE (Basic)

**Files:**
- `/src/lib/audit-service.ts` - Full audit service
- `prisma/schema.prisma` - AuditLog model, AuditAction enum
- `/src/app/api/admin/audit-logs/route.ts` - List audit logs

### What Works:
1. **AuditLog table** - tenantId, userId, targetUserId, action, resource, resourceId, changes (JSON), metadata, ipAddress, userAgent, createdAt
2. **AuditAction enum** - 20+ actions: USER_INVITED, USER_ROLE_CHANGED, USER_STORE_SCOPE_CHANGED, etc.
3. **Convenience methods** - logUserInvited, logRoleChanged, logStoreScopeChanged, etc.
4. **Query API** - Filter by user, action, resource, date range; paginated results
5. **Non-blocking** - Audit failures don't break main flow
6. **Request context** - Captures IP and user-agent
7. **Change tracking** - old/new values recorded as JSON

### Gaps:
1. **Incomplete coverage**
   - ❌ File operations (FILES_UPLOAD, FILE_DOWNLOAD, FILE_DELETE) - no files yet
   - ❌ Ops console actions (OPS_OPEN_ODOO_ADMIN, OPS_RETRY_PROVISIONING) - no ops console yet
2. **No UI to view audit logs** - API only
3. **No audit log retention policy** - Logs never deleted
4. **Secrets not checked** - Middleware doesn't prevent password/token leaks to logs

**Requirement Compliance:**
- ✅ Basic audit logging implemented
- ✅ Multiple action types covered
- ❌ File operations not logged (files missing)
- ❌ Ops console not logged (ops console missing)
- ⚠️ No retention/deletion policy

---

## 8. App Components (iOS/Android)

### Current Implementation: ⚠️ PARTIALLY EXISTS

**Files:**
- `/ios/App/` - Xcode project structure
- `/android/app/` - Gradle Android project
- `/capacitor.config.ts` - Capacitor config
- `/src/components/layout/splash-screen-handler.tsx` - Native splash screen

### Status:
1. **Capacitor setup** - Projects exist for both iOS and Android
2. **Entry point** - Next.js web wrapped in native shell (Capacitor)
3. **Splash screen** - Custom handler for native splash

### Gaps (App Store Compliance):
1. **Subscription UI present in web** - If app loads subscription page, it **violates 3.1.1**
2. **No differentiation between web and app** - Code doesn't detect Capacitor runtime to hide payment UI
3. **No demo account in app** - App Store requires demo credentials in Review Notes
4. **No privacy/terms screens** - Likely missing in-app legal docs

**Requirement Compliance:**
- ⚠️ App exists but lacks compliance safeguards
- ❌ No purchase CTA removal for app
- ❌ No demo account notes

---

## 9. Internal Ops Console

### Current Implementation: ❌ MISSING

**Requirement:**
- Only internal access (strong auth + optional IP allowlist/MFA)
- Tenant health check
- View/retry provisioning
- Reset ops_admin password
- Safe Odoo18 access (no plaintext password in browser)
- Audit logging of all ops actions

**Current state:**
- No ops routes found
- No ops role or permissions model
- Ops access likely via Odoo admin panel directly (security risk)

**Requirement Compliance:**
- ❌ Entirely missing

---

## Gap Summary Table

| Component | Implementation | Critical Gaps |
|-----------|-----------------|----------------|
| **Registration** | 70% | No password set/reset; no invitations; no stores |
| **Provisioning** | 80% | setImmediate only (not persistent); no ops_admin separation |
| **RBAC/Membership** | 85% | No stores table; no invitation tokens; incomplete API enforcement |
| **Subscription** | 90% | App store CTA violation; no Owner-only enforcement |
| **Authentication** | 85% | No password reset; no middleware guards; weak defaults |
| **File Storage** | 0% | Completely missing (S3, presigned, audit) |
| **Audit Logging** | 75% | Incomplete coverage; no file ops; no ops audit |
| **App Compliance** | 40% | Subscription CTA visible; no demo account docs |
| **Ops Console** | 0% | Completely missing |
| **Stores Management** | 0% | No table, no API, hardcoded |

---

## Next Steps (Priority Order)

Per `next.txt` Section 4:

1. **DB Migrations & Models** (RBAC/store_scope/invitations/audit/files/stores)
2. **Invitations + Password Flow** (set-password links + employee management)
3. **Provisioning Worker** (persistent queue, ops_admin, idempotency)
4. **Ops Console** (provisioning view, Odoo access, audit)
5. **Subscription Web Finalization** (Owner-only RBAC, no app CTA)
6. **App Compliance** (remove CTA, hide pricing, demo account docs)
7. **S3 File System** (presign, complete, list, download + RBAC)
8. **Testing & Runbook**

---

## Appendix: Key File Inventory

### Auth & Registration
- `/src/app/api/auth/register/route.ts`
- `/src/app/api/auth/login/route.ts`
- `/src/app/api/auth/google/route.ts`
- `/src/app/api/auth/callback/google/route.ts`
- `/src/app/api/auth/logout/route.ts`
- `/src/app/api/auth/me/route.ts`
- `/src/app/api/auth/send-code/route.ts`
- `/src/app/api/auth/verify-code/route.ts`
- `/src/lib/auth.ts`

### Membership & RBAC
- `/src/lib/membership-service.ts`
- `/src/lib/guards.ts`
- `/src/app/api/admin/users/route.ts`
- `/src/app/api/admin/users/[id]/route.ts`

### Provisioning
- `/src/lib/provisioning/index.ts`
- `/src/lib/provisioning/types.ts`
- `/src/lib/provisioning/orchestrator.ts`
- `/src/lib/provisioning/job-repository.ts`
- `/src/lib/provisioning/steps.ts`
- `/src/lib/provisioning/logger.ts`
- `/src/app/api/provisioning/status/route.ts`
- `/src/app/api/provisioning/retry/route.ts`

### Subscription & Billing
- `/src/lib/subscription-service.ts`
- `/src/lib/entitlements-service.ts`
- `/src/lib/stripe.ts`
- `/src/lib/stripe-client.ts`
- `/src/app/api/subscription/route.ts`
- `/src/app/api/stripe/checkout/route.ts`
- `/src/app/api/stripe/portal/route.ts`
- `/src/app/api/stripe/webhook/route.ts`
- `/src/app/(app)/settings/subscription/page.tsx`

### Audit & Logging
- `/src/lib/audit-service.ts`
- `/src/app/api/admin/audit-logs/route.ts`

### Data Models
- `/prisma/schema.prisma`

### Mobile
- `/capacitor.config.ts`
- `/ios/App/`
- `/android/app/`
- `/src/components/layout/splash-screen-handler.tsx`

---

**End of Audit**
