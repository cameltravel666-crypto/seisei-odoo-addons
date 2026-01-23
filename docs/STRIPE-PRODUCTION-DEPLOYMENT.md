# Stripe Production Deployment Guide

## Prerequisites

- Stripe account with Japan region configured
- Production server with Docker
- Database with subscription products seeded

## Step 1: Get Stripe Production Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Switch to **Live mode** (top-right toggle)
3. Copy the following keys:
   - **Secret Key**: `sk_live_xxxx` (never expose publicly)
   - **Publishable Key**: `pk_live_xxxx` (safe for client)

## Step 2: Configure Production Environment

Copy `.env.production.example` to `.env` on your server and fill in:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx  # Get in Step 4
NEXT_PUBLIC_APP_URL=https://erp.seisei.tokyo

# Cron Job Secret (generate with: openssl rand -base64 32)
CRON_SECRET=your_random_cron_secret
```

## Step 3: Create Stripe Products and Prices

Run the setup script to create products in Stripe and sync IDs to database:

```bash
# From project root on server
cd /path/to/seisei-erp

# Run with production Stripe key
STRIPE_SECRET_KEY=sk_live_xxx DATABASE_URL=postgresql://... npx tsx scripts/setup-stripe-products.ts
```

### Products Created

| Product Code | Name | Monthly Price (JPY) |
|-------------|------|---------------------|
| **Base Plans** | | |
| SW-PLAN-START | Starter | ¥0 |
| SW-PLAN-OPS-B | Ops Basic | ¥9,800 |
| SW-PLAN-OPS-A | Ops Auto | ¥19,800 |
| **Modules** | | |
| SW-MOD-CRM | Customer Management | ¥3,000 |
| SW-MOD-CASH | Cash Book | ¥3,000 |
| SW-MOD-ACC-P | Accounting Pro | ¥9,800 |
| SW-MOD-ACC-E | Accounting Enterprise | ¥19,800 |
| SW-MOD-PAYROLL | Payroll | ¥9,800 |
| SW-MOD-QR | QR Ordering | ¥14,800 |
| SW-MOD-RECPT | Receipt Issuance | ¥3,000 |
| SW-MOD-BI | Advanced BI Analytics | ¥12,800 |
| **Terminals** | | |
| SW-TERM-POS-ADD | Additional POS Terminal | ¥1,500 |
| SW-TERM-KDS | KDS License | ¥2,500 |
| SW-TERM-PRINT | Print License | ¥1,500 |
| SW-TERM-PRINT-ADD | Additional Print | ¥500 |
| SW-TERM-EMP-ADD | Additional Employee | ¥800 |

## Step 4: Configure Webhook Endpoint

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter endpoint URL:
   ```
   https://erp.seisei.tokyo/api/stripe/webhook
   ```
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.paid`
   - `invoice.payment_failed`

5. Copy the **Signing secret** (`whsec_xxx`) and add to `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
   ```

## Step 5: Deploy to Server

```bash
# SSH to server
ssh user@erp.seisei.tokyo

# Pull latest code
cd /opt/seisei-erp
git pull origin main

# Update .env with all Stripe keys

# Rebuild and restart containers
docker-compose down
docker-compose up -d --build

# Run database migrations
docker-compose exec app npx prisma migrate deploy

# Verify deployment
docker-compose logs -f app
```

## Step 6: Configure Cron Job for Subscription Sync

Add a cron job to sync subscription statuses:

```bash
# Edit crontab
crontab -e

# Add this line (runs every hour)
0 * * * * curl -X POST https://erp.seisei.tokyo/api/subscription/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"sync_all"}'

# Or add this for trial expiration checks (runs daily at 9 AM)
0 9 * * * curl -X POST https://erp.seisei.tokyo/api/subscription/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"check_expiring_trials","daysAhead":3}'
```

## Step 7: Verify Integration

### Test Checkout Flow
1. Login to the app
2. Go to Settings > Subscription
3. Click "支付方式" or try to upgrade
4. Complete payment with test card: `4242 4242 4242 4242`

### Verify Webhook Events
Check Stripe Dashboard > Webhooks > Recent Events

### Check Subscription Status
```bash
# Check subscription sync endpoint
curl https://erp.seisei.tokyo/api/subscription/sync \
  -H "Cookie: session=YOUR_SESSION"
```

## Troubleshooting

### Webhook signature verification failed
- Ensure `STRIPE_WEBHOOK_SECRET` matches the webhook endpoint's signing secret
- Check that the raw request body is being passed to verification

### Products not found in checkout
- Verify Stripe product IDs are in database: `SELECT stripe_product_id FROM subscription_products`
- Re-run `setup-stripe-products.ts` if needed

### Subscription status not updating
- Check webhook logs in Stripe Dashboard
- Verify webhook endpoint is accessible (no firewall blocking)
- Check app logs: `docker-compose logs app | grep stripe`

## Customer Portal Configuration

Configure the [Customer Portal](https://dashboard.stripe.com/settings/billing/portal):

1. **Features to enable**:
   - Cancel subscriptions
   - Switch plans
   - Update payment methods
   - View invoices

2. **Business information**:
   - Business name: Seisei BizNexus
   - Support email/phone

3. **Cancellation settings**:
   - Allow immediate cancellation
   - Or prorate at period end

## Tax Configuration (Japan)

1. Go to Stripe Dashboard > Tax
2. Enable automatic tax collection for Japan
3. Configure 消費税 (10% consumption tax)
4. Products will automatically calculate tax

## File Checklist

Ensure these files are properly configured:

- [x] `docker-compose.yml` - Stripe environment variables
- [x] `.env` - Production Stripe keys
- [x] `scripts/setup-stripe-products.ts` - Product sync script
- [x] `src/app/api/stripe/webhook/route.ts` - Webhook handler
- [x] `src/app/api/stripe/checkout/route.ts` - Checkout session
- [x] `src/app/api/stripe/portal/route.ts` - Customer portal
- [x] `src/lib/subscription-service.ts` - Status sync logic
- [x] `src/app/api/subscription/sync/route.ts` - Sync API
