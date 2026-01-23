# Authorization Model (RBAC + Entitlements)

## Overview

Seisei BizNexus implements a tenant-level subscription model with role-based access control (RBAC) and entitlements. This document describes the authorization architecture.

## Key Concepts

### Tenant (付费主体)
- The billing and subscription entity
- Each tenant has its own Odoo instance
- Identified by `tenantCode` (TEN-xxxxxx format)

### User (登录主体)
- Individual login account
- Linked to an Odoo user account
- Belongs to exactly one tenant

### Membership (User <-> Tenant)
- Links a user to a tenant with a specific role
- Defines store scope (which stores the user can access)
- Status: ACTIVE, INACTIVE, SUSPENDED

### Role (角色)
- Defines permission level within a tenant
- Hierarchical: BILLING_ADMIN > ORG_ADMIN > MANAGER > OPERATOR

### Entitlements (权益)
- Defines what modules/features are available to the tenant
- Includes usage limits (max users, stores, terminals)
- Synced from Stripe subscription

## Entity Relationship

```
┌─────────────────────────────────────────────────────────────────┐
│                         TENANT                                   │
│  - tenantCode (TEN-xxxxxx)                                       │
│  - stripeCustomerId                                              │
│  - planCode                                                      │
└────────────────┬────────────────────────────────────────────────┘
                 │
        ┌────────┴────────┬─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌────────────────┐
│     USER      │ │ ENTITLEMENTS  │ │   AUDIT_LOG    │
│  - odooUserId │ │ - modules[]   │ │  - action      │
│  - displayName│ │ - maxUsers    │ │  - resource    │
│  - email      │ │ - status      │ │  - changes     │
└───────┬───────┘ │ - source      │ │  - createdAt   │
        │         └───────────────┘ └────────────────┘
        │
        ▼
┌───────────────┐
│  MEMBERSHIP   │
│  - role       │
│  - storeScope │
│  - status     │
└───────────────┘
```

## Role Hierarchy

| Role | Level | Description | Permissions |
|------|-------|-------------|-------------|
| BILLING_ADMIN | 4 | 计费管理员 | Full access including billing |
| ORG_ADMIN | 3 | 组织管理员 | User management, all stores |
| MANAGER | 2 | 门店经理 | Manage assigned stores |
| OPERATOR | 1 | 操作员 | Basic operations only |

### Permission Matrix

| Action | BILLING_ADMIN | ORG_ADMIN | MANAGER | OPERATOR |
|--------|---------------|-----------|---------|----------|
| View Dashboard | ✅ | ✅ | ✅ | ✅ |
| POS Operations | ✅ | ✅ | ✅ | ✅ |
| View All Stores | ✅ | ✅ | ❌ | ❌ |
| Manage Users | ✅ | ✅ | ❌ | ❌ |
| Invite Users | ✅ | ✅ | ❌ | ❌ |
| Change Roles | ✅ | ✅* | ❌ | ❌ |
| Manage Billing | ✅ | ❌ | ❌ | ❌ |
| View Audit Logs | ✅ | ✅ | ❌ | ❌ |

*ORG_ADMIN cannot assign BILLING_ADMIN role

## Store Scope

- `storeScope: []` (empty) = Access to ALL stores
- `storeScope: ['1', '2']` = Access only to stores 1 and 2

Store scope is enforced at the API level via `storeScopeGuard`.

## API Guards

### TenantGuard
Validates:
- Valid JWT session
- Tenant exists and is active
- Returns user context with role and entitlements

### RoleGuard
Validates:
- User has required role level or higher
- Uses role hierarchy comparison

### EntitlementGuard
Validates:
- Tenant has the module enabled
- Subscription status is ACTIVE or TRIAL

### Usage Example

```typescript
import { withGuard, guardErrorResponse } from '@/lib/guards';

export async function GET() {
  const guard = await withGuard({
    requiredRole: 'ORG_ADMIN',
    requiredModule: 'INVENTORY'
  });

  if (!guard.success) {
    return guardErrorResponse(guard);
  }

  const { context } = guard;
  // context.tenantId, context.userId, context.role, context.entitlements
}
```

## API Endpoints

### User Context
- `GET /api/me` - Get current user with membership and entitlements
- `GET /api/me/entitlements` - Get tenant entitlements only

### User Management (ORG_ADMIN+)
- `GET /api/admin/users` - List all users in tenant
- `POST /api/admin/users` - Invite new user (body: invite schema)
- `GET /api/admin/users/:id` - Get specific user
- `PATCH /api/admin/users/:id` - Update role/storeScope/status
- `DELETE /api/admin/users/:id` - Remove user from tenant

### Audit Logs (ORG_ADMIN+)
- `GET /api/admin/audit-logs` - Query audit logs with filters

## State Machine

### Membership Status

```
      ┌──────────────┐
      │   INACTIVE   │ (Invited but not activated)
      └──────┬───────┘
             │ activate()
             ▼
      ┌──────────────┐
      │    ACTIVE    │ (Normal state)
      └──────┬───────┘
             │ suspend()
             ▼
      ┌──────────────┐
      │  SUSPENDED   │ (Temporarily disabled)
      └──────┬───────┘
             │ activate()
             └──────────► ACTIVE
```

### Entitlement Status

```
      ┌──────────────┐
      │    TRIAL     │ (Trial period)
      └──────┬───────┘
             │ subscription.activated
             ▼
      ┌──────────────┐
      │    ACTIVE    │ (Paid subscription)
      └──────┬───────┘
             │ payment.failed
             ▼
      ┌──────────────┐
      │   PAST_DUE   │ (Payment overdue)
      └──────┬───────┘
             │ subscription.cancelled
             ▼
      ┌──────────────┐
      │   EXPIRED    │ (Subscription ended)
      └──────────────┘
```

## Security Considerations

1. **Server-Side Enforcement**: All permission checks happen on the server. Frontend UI hiding is for UX only.

2. **JWT Claims**: JWT contains `userId`, `tenantId`, `isAdmin` but NOT detailed permissions. Permissions are fetched fresh on each request.

3. **Audit Trail**: All user management actions are logged to `audit_logs` table.

4. **Last Admin Protection**: System prevents removing or demoting the last admin.

5. **Store Isolation**: Users with store scope can only access data for their assigned stores.
