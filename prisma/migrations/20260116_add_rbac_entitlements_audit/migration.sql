-- RBAC + Entitlements + Audit Log Migration
-- Version: 2.0.0
-- Date: 2026-01-16
-- Description: Add Membership, Entitlements, and AuditLog models for tenant-level authorization

-- ============================================
-- Create Enums
-- ============================================

-- Role enum for RBAC
CREATE TYPE "Role" AS ENUM ('BILLING_ADMIN', 'ORG_ADMIN', 'MANAGER', 'OPERATOR');

-- Membership status
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- Entitlement status
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'EXPIRED');

-- Audit action types
CREATE TYPE "AuditAction" AS ENUM (
  'USER_INVITED',
  'USER_ROLE_CHANGED',
  'USER_STORE_SCOPE_CHANGED',
  'USER_SUSPENDED',
  'USER_ACTIVATED',
  'USER_REMOVED',
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_UPDATED',
  'SUBSCRIPTION_CANCELLED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_PAYMENT_FAILED',
  'ENTITLEMENTS_UPDATED',
  'MODULE_ENABLED',
  'MODULE_DISABLED',
  'LIMITS_CHANGED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'TENANT_CREATED',
  'TENANT_UPDATED',
  'SETTINGS_CHANGED'
);

-- ============================================
-- Create Memberships Table
-- ============================================

CREATE TABLE "memberships" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'OPERATOR',
  "store_scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "invited_by" TEXT,
  "invited_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one membership per user per tenant
CREATE UNIQUE INDEX "memberships_user_id_tenant_id_key" ON "memberships"("user_id", "tenant_id");

-- Index for querying by tenant and role
CREATE INDEX "memberships_tenant_id_role_idx" ON "memberships"("tenant_id", "role");

-- Foreign keys
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- Create Entitlements Table
-- ============================================

CREATE TABLE "entitlements" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "max_users" INTEGER NOT NULL DEFAULT 5,
  "max_stores" INTEGER NOT NULL DEFAULT 1,
  "max_terminals" INTEGER NOT NULL DEFAULT 2,
  "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "period_start" TIMESTAMP(3),
  "period_end" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'manual',
  "stripe_sub_id" TEXT,
  "odoo19_order_id" INTEGER,
  "last_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one entitlement record per tenant
CREATE UNIQUE INDEX "entitlements_tenant_id_key" ON "entitlements"("tenant_id");

-- Foreign key
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- Create Audit Logs Table
-- ============================================

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT,
  "target_user_id" TEXT,
  "action" "AuditAction" NOT NULL,
  "resource" TEXT NOT NULL,
  "resource_id" TEXT,
  "changes" JSONB,
  "metadata" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes for efficient querying
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");
CREATE INDEX "audit_logs_tenant_id_action_idx" ON "audit_logs"("tenant_id", "action");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_target_user_id_idx" ON "audit_logs"("target_user_id");

-- Foreign keys
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- Data Migration: Create Membership records for existing users
-- ============================================

-- For each existing user, create a membership record based on their isAdmin flag
INSERT INTO "memberships" ("id", "user_id", "tenant_id", "role", "status", "activated_at", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  u."id",
  u."tenant_id",
  CASE WHEN u."is_admin" = true THEN 'ORG_ADMIN'::"Role" ELSE 'OPERATOR'::"Role" END,
  'ACTIVE'::"MembershipStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
ON CONFLICT ("user_id", "tenant_id") DO NOTHING;

-- ============================================
-- Data Migration: Create Entitlements records for existing tenants
-- ============================================

-- Create entitlements for each tenant based on their current subscription
INSERT INTO "entitlements" ("id", "tenant_id", "modules", "max_users", "status", "source", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  t."id",
  COALESCE(
    (SELECT ARRAY_AGG(DISTINCT tf."module_code"::text)
     FROM "tenant_features" tf
     WHERE tf."tenant_id" = t."id" AND tf."is_allowed" = true),
    ARRAY[]::TEXT[]
  ),
  COALESCE(
    (SELECT sp."max_users"
     FROM "subscription_plans" sp
     WHERE sp."plan_code" = t."plan_code"),
    5
  ),
  CASE
    WHEN s."status" = 'TRIAL' THEN 'TRIAL'::"EntitlementStatus"
    WHEN s."status" = 'ACTIVE' THEN 'ACTIVE'::"EntitlementStatus"
    WHEN s."status" = 'PAST_DUE' THEN 'PAST_DUE'::"EntitlementStatus"
    WHEN s."status" = 'CANCELLED' THEN 'EXPIRED'::"EntitlementStatus"
    WHEN s."status" = 'EXPIRED' THEN 'EXPIRED'::"EntitlementStatus"
    ELSE 'ACTIVE'::"EntitlementStatus"
  END,
  CASE
    WHEN s."stripe_subscription_id" IS NOT NULL THEN 'stripe'
    WHEN s."odoo19_order_id" IS NOT NULL THEN 'odoo19'
    ELSE 'manual'
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
LEFT JOIN "subscriptions" s ON s."tenant_id" = t."id"
ON CONFLICT ("tenant_id") DO NOTHING;

-- ============================================
-- Update entitlements with stripe_sub_id from subscriptions
-- ============================================

UPDATE "entitlements" e
SET "stripe_sub_id" = s."stripe_subscription_id",
    "odoo19_order_id" = s."odoo19_order_id",
    "period_start" = s."start_date",
    "period_end" = s."stripe_current_period_end"
FROM "subscriptions" s
WHERE e."tenant_id" = s."tenant_id";
