# Registration & Provisioning Implementation

## Overview

This document describes the refactored registration and provisioning system that implements a job-based approach for reliable tenant setup.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Registration Flow                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  POST /api/auth/register                                             │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────┐                    │
│  │ 1. Validate Email (OAuth/Email Token)        │                    │
│  │ 2. Check if email already registered         │                    │
│  │ 3. Generate unique tenant_code               │                    │
│  │ 4. Transaction: Create Tenant+User+Session   │                    │
│  │ 5. Create ProvisioningJob                    │                    │
│  │ 6. Set auth cookie                           │                    │
│  │ 7. triggerProvisioningAsync()                │                    │
│  └─────────────────────────────────────────────┘                    │
│       │                                                              │
│       ▼                                                              │
│  Return immediately: { status: 'provisioning' }                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     Provisioning Pipeline                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ProvisioningOrchestrator                                            │
│       │                                                              │
│       ├─→ Step 1: Copy Database (Odoo 18)                           │
│       │      └─ POST /docker-api/copy_db                            │
│       │                                                              │
│       ├─→ Step 2: Authenticate (Odoo 18)                            │
│       │      └─ POST /web/session/authenticate                       │
│       │                                                              │
│       ├─→ Step 3: Update Admin (Odoo 18)                            │
│       │      └─ POST /web/dataset/call_kw (res.users.write)         │
│       │                                                              │
│       ├─→ Step 4: Upsert Tenant (Odoo 19)                           │
│       │      └─ XML-RPC execute_kw (seisei.tenant.upsert)           │
│       │                                                              │
│       ├─→ Step 5: Upsert User (Odoo 19)                             │
│       │      └─ XML-RPC execute_kw (seisei.user.upsert)             │
│       │                                                              │
│       ├─→ Step 6: Store Bridge Metadata                              │
│       │      └─ Update local DB (odooDb, odooBaseUrl)               │
│       │                                                              │
│       └─→ Step 7: Finalize                                           │
│              └─ Update tenant.provisionStatus = 'ready'              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### POST /api/auth/register

Creates a new tenant and starts provisioning.

**Request:**
```json
{
  "email": "owner@example.com",
  "companyName": "My Company",
  "contactName": "John Doe",
  "phone": "090-1234-5678",
  "industry": "restaurant",
  "emailToken": "jwt_token_from_email_verification",
  "locale": "ja"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "displayName": "John Doe",
      "email": "owner@example.com",
      "isAdmin": true
    },
    "tenant": {
      "id": "tenant_id",
      "tenantCode": "TEN-00000001",
      "name": "My Company",
      "status": "provisioning"
    }
  }
}
```

### GET /api/provisioning/status

Query provisioning status for a tenant.

**Query Parameters:**
- `tenant_code` (optional): Tenant code. If not provided, uses authenticated user's tenant.
- `locale` (optional): Language for step descriptions (`ja` or `en`). Default: `ja`

**Response:**
```json
{
  "success": true,
  "data": {
    "tenant_code": "TEN-00000001",
    "tenant_name": "My Company",
    "status": "provisioning",
    "current_step": "STEP_2_ODOO18_AUTH",
    "step_description": "システム認証中...",
    "progress": 25,
    "last_error": null,
    "odoo_ready": false,
    "can_retry": false,
    "job": {
      "attempts": 1,
      "max_attempts": 5,
      "started_at": "2024-01-17T10:00:00.000Z",
      "completed_at": null
    }
  }
}
```

### POST /api/provisioning/retry

Retry a failed provisioning job.

**Request:**
```json
{
  "tenant_code": "TEN-00000001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "job_id",
    "tenant_code": "TEN-00000001",
    "attempt": 2,
    "max_attempts": 5,
    "message": "Provisioning retry initiated"
  }
}
```

## Database Schema

### ProvisioningJob Table

```prisma
model ProvisioningJob {
  id              String             @id @default(cuid())
  tenantId        String             @map("tenant_id")
  tenantCode      String             @unique @map("tenant_code")
  userId          String?            @map("user_id")
  status          ProvisioningStatus @default(PENDING)
  currentStep     ProvisioningStep   @default(STEP_0_INIT)
  attempts        Int                @default(0)
  maxAttempts     Int                @default(5)
  nextRunAt       DateTime?          @map("next_run_at")
  lastError       String?            @db.Text
  failedStep      ProvisioningStep?
  progressData    Json?              // Stores step results
  lockedAt        DateTime?          // For concurrency control
  lockedBy        String?            // Worker ID
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  tenant          Tenant             @relation(...)
}
```

### Tenant Table Additions

```prisma
model Tenant {
  // ... existing fields ...
  provisionStatus  String?   // 'provisioning', 'ready', 'failed'
  failureStep      String?   // Step where failure occurred
  failureReason    String?   // Sanitized error message
  odoo19UserId     Int?      // User ID in Odoo 19
}
```

## Provisioning Steps

### Step 1: Copy Database (STEP_1_COPY_DB)

Copies a template database in Odoo 18 to create the tenant's database.

- **Endpoint:** `POST /docker-api/copy_db`
- **Idempotency:** Checks if database already exists before copying
- **Database naming:** `{tenant_code}` (e.g., `ten-00000001`)

### Step 2: Odoo 18 Authentication (STEP_2_ODOO18_AUTH)

Authenticates with the newly created Odoo 18 database.

- **Endpoint:** `POST /web/session/authenticate`
- **Idempotency:** Always succeeds if database exists
- **Stores:** `odoo18SessionId` in progressData

### Step 3: Update Admin (STEP_3_ODOO18_UPDATE_ADMIN)

Updates the admin user's email, name, and password.

- **Endpoint:** `POST /web/dataset/call_kw` (res.users.write)
- **Idempotency:** Idempotent (overwrite with same values)
- **Generates:** Random 16-character password

### Step 4: Upsert Tenant in Odoo 19 (STEP_4_ODOO19_UPSERT_TENANT)

Creates or updates the tenant record in Odoo 19 central registry.

- **Method:** XML-RPC `execute_kw` with `seisei.tenant.upsert`
- **Idempotency:** Uses upsert pattern (create or update)
- **Stores:** `odoo19TenantId` in progressData

### Step 5: Upsert User in Odoo 19 (STEP_5_ODOO19_UPSERT_USER)

Creates or updates the user record in Odoo 19 central registry.

- **Method:** XML-RPC `execute_kw` with `seisei.user.upsert`
- **Idempotency:** Uses upsert pattern
- **Stores:** `odoo19UserId` in progressData

### Step 6: Store Bridge Metadata (STEP_6_BRIDGE_METADATA)

Updates the BizNexus tenant record with Odoo connection details.

- **Updates:** `odooDb`, `odooBaseUrl` in Tenant table
- **Idempotency:** Idempotent update

### Step 7: Finalize (STEP_7_FINALIZE)

Marks provisioning as complete.

- **Updates:** `provisionStatus = 'ready'` in Tenant table
- **Updates:** User's `odooUserId` with the Odoo 18 admin ID

## Error Handling

### Retry Logic

- **Max Attempts:** 5 (configurable)
- **Backoff:** Exponential (1s, 5s, 15s, 60s, 300s)
- **Resume:** Resumes from failed step, not from beginning

### Failure States

1. **Step Failure:** Job marked as FAILED, scheduled for retry
2. **Max Retries Exceeded:** No more automatic retries, requires manual intervention
3. **Lock Timeout:** Stale locks released after 5 minutes

### Error Sanitization

User-facing error messages are sanitized to remove:
- Passwords and tokens
- IP addresses
- Port numbers
- Other sensitive information

## Concurrency Control

### Database Locking

Uses optimistic locking via `lockedAt` and `lockedBy` fields:

```typescript
// Acquire lock
const locked = await prisma.provisioningJob.updateMany({
  where: {
    id: jobId,
    OR: [
      { lockedAt: null },
      { lockedAt: { lt: lockExpiry } },
    ],
  },
  data: {
    lockedAt: new Date(),
    lockedBy: workerId,
  },
});
```

### Tenant Code Generation

Uses retry loop with uniqueness check:

```typescript
async function generateTenantCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const lastTenant = await prisma.tenant.findFirst({
      where: { tenantCode: { startsWith: 'TEN-' } },
      orderBy: { tenantCode: 'desc' },
    });

    const nextNumber = extractNumber(lastTenant?.tenantCode) + 1;
    const tenantCode = `TEN-${nextNumber.toString().padStart(8, '0')}`;

    const exists = await prisma.tenant.findUnique({
      where: { tenantCode },
    });

    if (!exists) return tenantCode;
  }

  // Fallback to timestamp-based code
  return `TEN-${Date.now().toString(36).toUpperCase()}`;
}
```

## Logging

Structured JSON logging for observability:

```json
{
  "timestamp": "2024-01-17T10:00:00.000Z",
  "level": "info",
  "service": "provisioning",
  "job_id": "abc123",
  "tenant_code": "TEN-00000001",
  "step": "STEP_2_ODOO18_AUTH",
  "status": "success",
  "elapsed_ms": 1234
}
```

## Configuration

Environment variables:

```env
# Odoo 18 (Customer databases)
ODOO_BASE_URL=https://seisei.tokyo
ODOO_DOCKER_API_URL=https://seisei.tokyo/docker-api

# Odoo 19 (Central registry)
ODOO19_ADMIN_URL=https://odoo19.seisei.tokyo
ODOO19_ADMIN_DB=seisei_admin
ODOO19_ADMIN_USER=admin
ODOO19_ADMIN_PASSWORD=xxx

# Provisioning
PROVISIONING_MAX_ATTEMPTS=5
PROVISIONING_LOCK_TIMEOUT_MS=300000
```

## Frontend Integration

The frontend should poll the status endpoint:

```typescript
async function pollProvisioningStatus(tenantCode: string): Promise<void> {
  const maxPolls = 60; // 5 minutes with 5s interval
  let polls = 0;

  while (polls < maxPolls) {
    const res = await fetch(`/api/provisioning/status?tenant_code=${tenantCode}`);
    const data = await res.json();

    if (data.data.status === 'ready') {
      // Redirect to dashboard
      window.location.href = '/';
      return;
    }

    if (data.data.status === 'failed') {
      // Show error and retry button
      showError(data.data.last_error, data.data.can_retry);
      return;
    }

    // Update progress UI
    updateProgress(data.data.progress, data.data.step_description);

    await sleep(5000);
    polls++;
  }

  // Timeout - show message
  showTimeout();
}
```

## File Structure

```
src/
├── app/api/
│   ├── auth/
│   │   └── register/
│   │       └── route.ts         # Registration endpoint
│   └── provisioning/
│       ├── status/
│       │   └── route.ts         # Status query endpoint
│       └── retry/
│           └── route.ts         # Retry endpoint
├── lib/
│   └── provisioning/
│       ├── index.ts             # Module exports
│       ├── types.ts             # Types and constants
│       ├── logger.ts            # Structured logging
│       ├── job-repository.ts    # Database operations
│       ├── orchestrator.ts      # Job execution engine
│       └── steps.ts             # Step implementations
docs/
├── REGISTER_PROVISIONING_AUDIT.md
└── REGISTER_PROVISIONING_IMPLEMENTATION.md
```

## Migration Steps

1. Run Prisma migration to create ProvisioningJob table
2. Deploy updated code
3. Existing tenants with `provisionStatus != 'ready'` may need manual intervention
4. Monitor logs for any provisioning failures

## Testing

### Unit Tests

- Tenant code generation (uniqueness, concurrency)
- Step idempotency
- Error sanitization
- Lock acquisition/release

### Integration Tests

- Full registration flow with mocked Odoo
- Retry logic
- Status polling

### Manual Testing

1. Register new tenant
2. Poll status endpoint
3. Verify in Odoo 18 and 19
4. Test retry on simulated failure
