# Apple App Store Review Changes

## Date: 2026-01-13

## Changes Made for Apple Review

### 1. Settings Menu Hidden
- **Status**: Done
- **Files Modified**: `src/components/layout/nav.tsx`
- **Details**:
  - Commented out Settings link in desktop sidebar (lines 179-185)
  - Commented out Settings link in mobile menu (lines 293-300)
- **Reason**: Pending Apple App Store review approval before enabling subscription management features

### 2. Core Modules Enabled
- **Status**: Done
- **Database**: Production (54.65.127.141)
- **Tenant**: TEN-DEMO01
- **Modules Enabled**:
  | Module | Status |
  |--------|--------|
  | DASHBOARD | Enabled |
  | POS | Enabled |
  | INVENTORY | Enabled |
  | PURCHASE | Enabled |
  | SALES | Enabled |
  | CONTACTS | Enabled |
  | ACCOUNTING | Enabled |

### 3. Premium Modules Hidden
- **Status**: Already configured in code
- **File**: `src/lib/modules.ts`
- **Details**: All premium modules have `isHidden: true`:
  - QR_ORDERING (桌台服务)
  - ANALYTICS (BI)
  - CRM
  - FINANCE
  - HR

### 4. QR Ordering / Table Service Module
- **Status**: Done
- **Module Code**: `QR_ORDERING`
- **Product Code**: `SW-MOD-QR`
- **Price**: ¥2,980/月
- **Files Modified**:
  - `prisma/schema.prisma` - Added `QR_ORDERING` to `ModuleCode` enum
  - `src/lib/modules.ts` - Added QR_ORDERING module definition
  - `prisma/seed/seed.ts` - Updated SW-MOD-QR product with `enablesModule: 'QR_ORDERING'`
  - `src/components/layout/nav.tsx` - Added POS sub-menu with Tables item
  - `src/app/(app)/pos/tables/page.tsx` - Added `ModuleGate` permission check
  - `messages/*.json` - Added translations for "tables" and "qr_ordering"

- **Navigation Structure**:
  ```
  POS (免费)
  └── 桌台服务 /pos/tables (付费: QR_ORDERING)
  ```

- **Features**:
  - POS menu now has expandable sub-menu
  - Tables/QR ordering shows lock icon if not subscribed
  - Clicking locked item redirects to subscription page
  - Tables page shows upgrade prompt if not subscribed

### 5. POS Sub-menu Hidden
- **Status**: Done
- **File**: `src/components/layout/nav.tsx`
- **Details**:
  - Commented out `posSubItems` array definition
  - Replaced with empty array to hide sub-menu items
  - Lines affected: ~60-65
- **Reason**: Hide paid QR ordering option until Apple review approval

```typescript
// NOTE: Hidden for Apple App Store review - uncomment after approval
// const posSubItems = [
//   { path: '/pos/tables', icon: QrCode, labelKey: 'tables', moduleCode: 'QR_ORDERING' },
// ];
const posSubItems: Array<{ path: string; icon: typeof QrCode; labelKey: string; moduleCode: string }> = [];
```

## Deployment

- **Server**: 54.65.127.141
- **Method**: Docker Compose
- **Deployed At**: 2026-01-13 ~14:30 JST

## After Apple Review Approval

To re-enable features after Apple approval:

### 1. Unhide Settings Menu
Edit `src/components/layout/nav.tsx`:
- Uncomment Settings link in desktop sidebar (lines 179-185)
- Uncomment Settings link in mobile menu (lines 293-300)

### 2. Unhide Premium Modules
Edit `src/lib/modules.ts`:
- Remove `isHidden: true` from ANALYTICS, CRM, FINANCE, HR modules

### 3. Unhide POS Sub-menu (QR Ordering)
Edit `src/components/layout/nav.tsx`:
- Uncomment the original `posSubItems` array definition (~lines 60-65)
- Remove the empty array replacement
```typescript
// Change from:
const posSubItems: Array<...> = [];

// To:
const posSubItems = [
  { path: '/pos/tables', icon: QrCode, labelKey: 'tables', moduleCode: 'QR_ORDERING' },
];
```

### 4. Redeploy
```bash
ssh -i ~/Projects/Pem/odoo-2025.pem ubuntu@54.65.127.141
cd /home/ubuntu/seisei-erp
docker compose up -d --build app
```

## Internationalization Updates (Same Session)

### Product Descriptions Multilingual Support
- **Status**: Done (local), Pending deployment
- **Files Modified**:
  - `prisma/schema.prisma` - Added `descriptionZh`, `descriptionJa` fields
  - `prisma/seed/seed.ts` - Added multilingual descriptions for 25 products
  - `src/app/api/subscription/products/route.ts` - Added description fields to API response
  - `src/app/(app)/settings/subscription/page.tsx` - Added `getProductDescription()` function with locale support

### Database Updated
- All 25 subscription products now have descriptions in:
  - English (`description`)
  - Chinese (`description_zh`)
  - Japanese (`description_ja`)
