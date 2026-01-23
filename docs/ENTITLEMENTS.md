# Entitlements System

## Overview

Entitlements define what features and limits are available to a tenant based on their subscription. The entitlements system is the single source of truth for feature access.

## Entitlements Schema

```prisma
model Entitlements {
  id            String            @id
  tenantId      String            @unique

  // Module access
  modules       String[]          // Enabled ModuleCode list

  // Limits
  maxUsers      Int               @default(5)
  maxStores     Int               @default(1)
  maxTerminals  Int               @default(2)

  // Status
  status        EntitlementStatus // ACTIVE | TRIAL | PAST_DUE | SUSPENDED | EXPIRED
  periodStart   DateTime?
  periodEnd     DateTime?

  // Source tracking
  source        String            // stripe | manual | odoo19
  stripeSubId   String?
  odoo19OrderId Int?

  // Sync tracking
  lastSyncAt    DateTime
  syncError     String?
}
```

## Module Codes

| Code | Name (EN) | Name (JA) | Description |
|------|-----------|-----------|-------------|
| `DASHBOARD` | Dashboard | ダッシュボード | Main dashboard |
| `POS` | Point of Sale | POS | Cash register operations |
| `INVENTORY` | Inventory | 在庫管理 | Stock management |
| `PURCHASE` | Purchase | 仕入 | Purchase orders |
| `SALES` | Sales | 売上 | Sales orders |
| `CRM` | CRM | 顧客管理 | Customer management |
| `EXPENSES` | Expenses | 経費 | Expense tracking |
| `ACCOUNTING` | Accounting | 会計 | Basic accounting |
| `FINANCE` | Finance Pro | 財務 | Advanced finance |
| `APPROVALS` | Approvals | 承認 | Approval workflows |
| `HR` | HR & Payroll | 人事・給与 | Human resources |
| `MAINTENANCE` | Maintenance | メンテナンス | Equipment maintenance |
| `DOCUMENTS` | Documents | 文書管理 | Document management |
| `PRODUCTS` | Products | 商品 | Product catalog |
| `CONTACTS` | Contacts | 連絡先 | Contact management |
| `ANALYTICS` | Analytics | 分析 | Business analytics |
| `QR_ORDERING` | QR Ordering | QRオーダー | Table ordering |

## Plan Defaults

### Basic Plan (Free)
```json
{
  "modules": ["DASHBOARD", "POS", "PRODUCTS", "CONTACTS"],
  "maxUsers": 3,
  "maxStores": 1,
  "maxTerminals": 2
}
```

### Standard Plan (¥9,800/month)
```json
{
  "modules": ["DASHBOARD", "POS", "PRODUCTS", "CONTACTS", "INVENTORY", "PURCHASE", "SALES"],
  "maxUsers": 10,
  "maxStores": 3,
  "maxTerminals": 5
}
```

### Premium Plan (¥19,800/month)
```json
{
  "modules": ["ALL_MODULES"],
  "maxUsers": 50,
  "maxStores": 10,
  "maxTerminals": 20
}
```

### Trial Plan
```json
{
  "modules": ["ALL_MODULES"],
  "maxUsers": 5,
  "maxStores": 1,
  "maxTerminals": 2,
  "status": "TRIAL"
}
```

## Entitlement Status

| Status | Description | Access Allowed |
|--------|-------------|----------------|
| `ACTIVE` | Paid subscription active | Full access |
| `TRIAL` | Trial period | Full access |
| `PAST_DUE` | Payment failed | Limited access (grace period) |
| `SUSPENDED` | Manually suspended | No access |
| `EXPIRED` | Subscription ended | No access |

## API Endpoints

### GET /api/me/entitlements

Returns current tenant entitlements for feature gating.

**Response:**
```json
{
  "modules": ["DASHBOARD", "POS", "INVENTORY"],
  "limits": {
    "maxUsers": 10,
    "maxStores": 3,
    "maxTerminals": 5
  },
  "status": "ACTIVE",
  "periodEnd": "2026-02-15T00:00:00.000Z",
  "source": "stripe"
}
```

## Stripe Sync

Entitlements are automatically synced when Stripe webhook events are received:

### Sync Events
- `checkout.session.completed` - Initial subscription
- `customer.subscription.updated` - Plan changes
- `customer.subscription.deleted` - Cancellation
- `invoice.paid` - Payment success (reactivate)
- `invoice.payment_failed` - Payment failure

### Sync Logic

```typescript
// From webhook handler
await entitlementsService.syncFromStripe({
  tenantId,
  stripeSubId: subscription.id,
  status: subscription.status,
  currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  items: subscription.items.data.map(item => ({
    productCode: item.price.product.metadata.productCode,
    quantity: item.quantity
  }))
});
```

## Frontend Usage

### React Hook

```typescript
import { useEntitlements } from '@/hooks/use-entitlements';

function MyComponent() {
  const { entitlements, isModuleEnabled, isLoading } = useEntitlements();

  if (!isModuleEnabled('INVENTORY')) {
    return <LockedModule message="在庫管理モジュールは有効になっていません" />;
  }

  return <InventoryPage />;
}
```

### Feature Gate Component

```typescript
<FeatureGate module="CRM" fallback={<UpgradePrompt />}>
  <CRMModule />
</FeatureGate>
```

## iOS/Android App

Apps must:
1. Fetch `/api/me/entitlements` on startup
2. Display "locked" state for disabled modules
3. Show "Contact administrator" message (NOT purchase CTA)
4. Refresh entitlements on app resume

**Important**: App Store/Play Store guidelines prohibit showing purchase CTAs that bypass their payment systems. All subscription management must go through the web admin panel.

## Manual Management

For cases where Stripe is not used:

```typescript
// Enable a module manually
await entitlementsService.enableModule(tenantId, 'INVENTORY', actorId);

// Disable a module
await entitlementsService.disableModule(tenantId, 'INVENTORY', actorId);

// Set status
await entitlementsService.setStatus(tenantId, 'SUSPENDED', 'Non-payment');
```

## Limits Enforcement

### User Limit
When inviting a new user:
```typescript
const limits = await entitlementsService.checkLimits(tenantId);
if (limits.users.exceeded) {
  throw new Error(`User limit reached (${limits.users.max})`);
}
```

### Module Access
In API guards:
```typescript
const guard = await entitlementGuard('INVENTORY');
if (!guard.success) {
  return guardErrorResponse(guard); // 403 Forbidden
}
```

## Audit Trail

All entitlement changes are logged:
- `MODULE_ENABLED` - Module activated
- `MODULE_DISABLED` - Module deactivated
- `ENTITLEMENTS_UPDATED` - Bulk update from Stripe
- `LIMITS_CHANGED` - Usage limits modified

Example audit log query:
```sql
SELECT * FROM audit_logs
WHERE tenant_id = 'xxx'
AND resource = 'entitlements'
ORDER BY created_at DESC;
```
