# Operations Guide

## Overview

This guide covers operational procedures for the RBAC + Entitlements system, including troubleshooting, reconciliation, and common tasks.

## Audit Log Queries

### View Recent Activity

```sql
-- All activity for a tenant in last 24 hours
SELECT
  al.created_at,
  al.action,
  al.resource,
  u.display_name as actor,
  tu.display_name as target,
  al.changes
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
LEFT JOIN users tu ON al.target_user_id = tu.id
WHERE al.tenant_id = 'your-tenant-id'
  AND al.created_at > NOW() - INTERVAL '24 hours'
ORDER BY al.created_at DESC;
```

### Track User Permission Changes

```sql
-- Who changed user permissions?
SELECT
  al.created_at,
  al.action,
  u.display_name as changed_by,
  tu.display_name as user_changed,
  al.changes
FROM audit_logs al
JOIN users u ON al.user_id = u.id
JOIN users tu ON al.target_user_id = tu.id
WHERE al.tenant_id = 'your-tenant-id'
  AND al.action IN ('USER_ROLE_CHANGED', 'USER_STORE_SCOPE_CHANGED', 'USER_SUSPENDED', 'USER_ACTIVATED')
ORDER BY al.created_at DESC;
```

### Track Subscription Changes

```sql
-- Subscription history
SELECT
  created_at,
  action,
  changes,
  metadata
FROM audit_logs
WHERE tenant_id = 'your-tenant-id'
  AND resource = 'subscription'
ORDER BY created_at DESC;
```

## Reconciliation

### Stripe <-> Entitlements Sync Check

```sql
-- Find mismatched entitlements
SELECT
  t.tenant_code,
  s.stripe_subscription_id,
  s.status as subscription_status,
  e.status as entitlement_status,
  e.modules,
  e.last_sync_at,
  e.sync_error
FROM tenants t
LEFT JOIN subscriptions s ON s.tenant_id = t.id
LEFT JOIN entitlements e ON e.tenant_id = t.id
WHERE s.status != CASE
  WHEN e.status = 'ACTIVE' THEN 'ACTIVE'
  WHEN e.status = 'TRIAL' THEN 'TRIAL'
  WHEN e.status = 'PAST_DUE' THEN 'PAST_DUE'
  WHEN e.status = 'EXPIRED' THEN 'CANCELLED'
  ELSE NULL
END;
```

### Manual Resync

```typescript
// Force resync from Stripe
import { stripe } from '@/lib/stripe';
import { entitlementsService } from '@/lib/entitlements-service';

async function resyncTenant(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId }
  });

  if (!subscription?.stripeSubscriptionId) {
    console.log('No Stripe subscription found');
    return;
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
    { expand: ['items.data.price.product'] }
  );

  await entitlementsService.syncFromStripe({
    tenantId,
    stripeSubId: stripeSubscription.id,
    status: stripeSubscription.status,
    currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    items: stripeSubscription.items.data.map(item => ({
      productCode: (item.price.product as any).metadata?.productCode || '',
      quantity: item.quantity || 1
    }))
  });

  console.log('Resync complete');
}
```

## Troubleshooting

### User Cannot Access Module

**Symptoms**: User gets 403 error when accessing a feature

**Investigation Steps**:

1. Check entitlements:
```sql
SELECT modules, status FROM entitlements WHERE tenant_id = 'xxx';
```

2. Check membership:
```sql
SELECT role, status FROM memberships WHERE user_id = 'xxx' AND tenant_id = 'xxx';
```

3. Check subscription:
```sql
SELECT status, stripe_subscription_id FROM subscriptions WHERE tenant_id = 'xxx';
```

**Common Causes**:
- Module not in entitlements.modules
- Entitlements status is not ACTIVE/TRIAL
- Membership status is SUSPENDED
- Role insufficient for the action

### User Cannot Login

**Symptoms**: Login fails even with correct credentials

**Investigation Steps**:

1. Check tenant status:
```sql
SELECT is_active, provision_status FROM tenants WHERE tenant_code = 'TEN-xxx';
```

2. Check Odoo connection:
```bash
curl -X POST https://odoo-url/web/session/authenticate \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"call","params":{"db":"xxx","login":"user","password":"pass"}}'
```

3. Check audit log for login failures:
```sql
SELECT created_at, metadata FROM audit_logs
WHERE action = 'LOGIN_FAILED'
ORDER BY created_at DESC LIMIT 10;
```

### Stripe Webhook Not Syncing

**Symptoms**: Subscription changes in Stripe not reflected in system

**Investigation Steps**:

1. Check webhook endpoint in Stripe Dashboard
2. Verify webhook secret matches `STRIPE_WEBHOOK_SECRET`
3. Check server logs for webhook errors
4. Manual resync using script above

### Membership Migration Issues

**Symptoms**: Legacy users missing memberships

**Fix**:
```sql
-- Create memberships for users without one
INSERT INTO memberships (id, user_id, tenant_id, role, status, activated_at, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  u.id,
  u.tenant_id,
  CASE WHEN u.is_admin THEN 'ORG_ADMIN' ELSE 'OPERATOR' END,
  'ACTIVE',
  NOW(),
  NOW(),
  NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.tenant_id = u.tenant_id
);
```

## Common Operations

### Invite User via API

```bash
curl -X POST https://api.biznexus.seisei.tokyo/api/admin/users \
  -H "Cookie: auth-token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "new@example.com",
    "displayName": "New User",
    "role": "OPERATOR",
    "storeScope": [],
    "odooUserId": 123,
    "odooLogin": "newuser"
  }'
```

### Change User Role

```bash
curl -X PATCH https://api.biznexus.seisei.tokyo/api/admin/users/USER_ID \
  -H "Cookie: auth-token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "MANAGER"}'
```

### Suspend User

```bash
curl -X PATCH https://api.biznexus.seisei.tokyo/api/admin/users/USER_ID \
  -H "Cookie: auth-token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "SUSPENDED"}'
```

### View Audit Logs

```bash
curl "https://api.biznexus.seisei.tokyo/api/admin/audit-logs?actions=USER_ROLE_CHANGED,USER_SUSPENDED&limit=50" \
  -H "Cookie: auth-token=YOUR_TOKEN"
```

## Monitoring

### Key Metrics to Track

1. **Failed Logins**: High count may indicate credential stuffing
2. **Permission Denied Errors**: May indicate misconfigured roles
3. **Webhook Failures**: Stripe sync issues
4. **Entitlement Sync Errors**: Check `entitlements.sync_error`

### Health Check Queries

```sql
-- Tenants with entitlement sync errors
SELECT t.tenant_code, e.sync_error, e.last_sync_at
FROM entitlements e
JOIN tenants t ON t.id = e.tenant_id
WHERE e.sync_error IS NOT NULL;

-- Users without memberships
SELECT u.id, u.display_name, t.tenant_code
FROM users u
JOIN tenants t ON t.id = u.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM memberships m WHERE m.user_id = u.id
);

-- Tenants without entitlements
SELECT t.tenant_code, t.plan_code
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM entitlements e WHERE e.tenant_id = t.id
);
```

## Database Maintenance

### Archive Old Audit Logs

```sql
-- Archive logs older than 1 year
CREATE TABLE audit_logs_archive AS
SELECT * FROM audit_logs
WHERE created_at < NOW() - INTERVAL '1 year';

DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '1 year';
```

### Cleanup Expired Sessions

```sql
DELETE FROM sessions
WHERE expires_at < NOW();
```

## Rollback Procedures

### Revert Role Change

1. Find the audit log entry
2. Get the old role from `changes.old.role`
3. Update membership:

```sql
UPDATE memberships
SET role = 'OLD_ROLE', updated_at = NOW()
WHERE user_id = 'xxx' AND tenant_id = 'xxx';
```

### Restore Suspended User

```sql
UPDATE memberships
SET status = 'ACTIVE', updated_at = NOW()
WHERE user_id = 'xxx' AND tenant_id = 'xxx';
```

### Emergency: Disable All Access

```sql
-- Suspend all memberships for a tenant
UPDATE memberships
SET status = 'SUSPENDED'
WHERE tenant_id = 'xxx';

-- Or disable the tenant entirely
UPDATE tenants
SET is_active = false
WHERE id = 'xxx';
```
