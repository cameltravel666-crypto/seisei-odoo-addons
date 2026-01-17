-- Add Stripe fields to tenants table
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT UNIQUE;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "billing_email" TEXT;

-- Add Stripe fields to subscriptions table
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" TEXT UNIQUE;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_current_period_end" TIMESTAMP(3);

-- Add Stripe fields to subscription_products table
ALTER TABLE "subscription_products" ADD COLUMN IF NOT EXISTS "stripe_product_id" TEXT UNIQUE;
ALTER TABLE "subscription_products" ADD COLUMN IF NOT EXISTS "stripe_price_monthly" TEXT;
ALTER TABLE "subscription_products" ADD COLUMN IF NOT EXISTS "stripe_price_yearly" TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS "tenants_stripe_customer_id_idx" ON "tenants"("stripe_customer_id");
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_subscription_id_idx" ON "subscriptions"("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "subscription_products_stripe_product_id_idx" ON "subscription_products"("stripe_product_id");
