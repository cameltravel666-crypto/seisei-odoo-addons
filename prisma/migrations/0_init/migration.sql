-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BILLING_ADMIN', 'ORG_ADMIN', 'MANAGER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_INVITED', 'USER_ROLE_CHANGED', 'USER_STORE_SCOPE_CHANGED', 'USER_SUSPENDED', 'USER_ACTIVATED', 'USER_REMOVED', 'USER_PASSWORD_SET', 'USER_PASSWORD_RESET', 'INVITATION_SENT', 'INVITATION_ACCEPTED', 'INVITATION_REVOKED', 'INVITATION_EXPIRED', 'INVITATION_RESENT', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_PAYMENT_FAILED', 'ENTITLEMENTS_UPDATED', 'MODULE_ENABLED', 'MODULE_DISABLED', 'LIMITS_CHANGED', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'FILE_UPLOAD_STARTED', 'FILE_UPLOAD_COMPLETED', 'FILE_DOWNLOAD', 'FILE_DELETED', 'STORE_CREATED', 'STORE_UPDATED', 'STORE_DELETED', 'STORE_DEACTIVATED', 'OPS_OPEN_ODOO_ADMIN', 'OPS_RETRY_PROVISIONING', 'OPS_RESET_OPS_PASSWORD', 'OPS_TENANT_HEALTH_CHECK', 'TENANT_CREATED', 'TENANT_UPDATED', 'SETTINGS_CHANGED', 'PROVISIONING_STARTED', 'PROVISIONING_COMPLETED', 'PROVISIONING_FAILED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvitationType" AS ENUM ('NEW_USER', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('TENANT', 'STORE', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('RECEIPT', 'INVOICE', 'PRODUCT_IMAGE', 'DOCUMENT', 'ATTACHMENT', 'AVATAR', 'EXPORT');

-- CreateEnum
CREATE TYPE "ModuleCode" AS ENUM ('POS', 'INVENTORY', 'PURCHASE', 'SALES', 'CRM', 'EXPENSES', 'ACCOUNTING', 'FINANCE', 'APPROVALS', 'HR', 'MAINTENANCE', 'DOCUMENTS', 'DASHBOARD', 'PRODUCTS', 'CONTACTS', 'ANALYTICS', 'QR_ORDERING');

-- CreateEnum
CREATE TYPE "UsageEventStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('BASE_PLAN', 'MODULE', 'SERVICE', 'HARDWARE', 'ADDON');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('PLAN', 'MODULE', 'TERMINAL', 'MAINTENANCE', 'ONBOARDING', 'RENTAL', 'PURCHASE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "ProvisioningStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProvisioningStep" AS ENUM ('STEP_0_INIT', 'STEP_1_COPY_DB', 'STEP_2_ODOO18_AUTH', 'STEP_3_ODOO18_UPDATE_ADMIN', 'STEP_3B_ODOO18_SETUP_APIKEY', 'STEP_4_ODOO19_UPSERT_TENANT', 'STEP_4B_SEISEI_BILLING_TENANT', 'STEP_5_ODOO19_UPSERT_USER', 'STEP_6_BRIDGE_METADATA', 'STEP_7_FINALIZE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT_CARD', 'BANK_TRANSFER', 'KONBINI', 'PAYPAY', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OcrDocumentType" AS ENUM ('PURCHASE', 'SALE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "OcrDocumentStatus" AS ENUM ('UPLOADED', 'RECOGNIZING', 'RECOGNIZED', 'EDITING', 'READY', 'EXPORTED', 'WRITTEN_BACK', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportTarget" AS ENUM ('FREEE', 'MONEYFORWARD', 'YAYOI');

-- CreateEnum
CREATE TYPE "ExportEncoding" AS ENUM ('UTF8_BOM', 'SHIFT_JIS');

-- CreateEnum
CREATE TYPE "WritebackStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "tenant_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "odoo_base_url" TEXT NOT NULL,
    "odoo_db" TEXT NOT NULL,
    "company_id" INTEGER,
    "warehouse_id" INTEGER,
    "plan_code" TEXT NOT NULL DEFAULT 'basic',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "owner_email" TEXT,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "oauth_provider" TEXT,
    "oauth_id" TEXT,
    "odoo19_partner_id" INTEGER,
    "bridge_tenant_id" TEXT,
    "provision_status" TEXT DEFAULT 'pending',
    "failure_step" TEXT,
    "failure_reason" TEXT,
    "odoo19_user_id" INTEGER,
    "stripe_customer_id" TEXT,
    "billing_email" TEXT,
    "ops_secret_ref" TEXT,
    "ops_password_encrypted" TEXT,
    "ops_password_updated_at" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "odoo_user_id" INTEGER NOT NULL,
    "odoo_login" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_password_set_at" TIMESTAMP(3),
    "password_set_method" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "odoo_session_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "odoo_store_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ja" TEXT,
    "name_zh" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'JP',
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "phone" TEXT,
    "email" TEXT,
    "business_hours" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "type" "InvitationType" NOT NULL DEFAULT 'NEW_USER',
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "store_scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "invited_by" TEXT NOT NULL,
    "result_user_id" TEXT,
    "resent_count" INTEGER NOT NULL DEFAULT 0,
    "last_resent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "store_id" TEXT,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'ap-northeast-1',
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "checksum" TEXT,
    "category" "FileCategory" NOT NULL DEFAULT 'ATTACHMENT',
    "visibility" "FileVisibility" NOT NULL DEFAULT 'TENANT',
    "resource_type" TEXT,
    "resource_id" TEXT,
    "is_processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "processing_error" TEXT,
    "thumbnail_key" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_users" INTEGER NOT NULL DEFAULT 5,
    "max_stores" INTEGER NOT NULL DEFAULT 1,
    "max_terminals" INTEGER NOT NULL DEFAULT 2,
    "trial_start_at" TIMESTAMP(3),
    "trial_end_at" TIMESTAMP(3),
    "status" "EntitlementStatus" NOT NULL DEFAULT 'TRIAL',
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

-- CreateTable
CREATE TABLE "tenant_module_entitlements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabled_until" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT 'trial',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_module_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_usage_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entitlements_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "UsageEventStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_usage_periods" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entitlements_id" TEXT NOT NULL,
    "period_start_at" TIMESTAMP(3) NOT NULL,
    "period_end_at" TIMESTAMP(3) NOT NULL,
    "ocr_used" INTEGER NOT NULL DEFAULT 0,
    "table_used" INTEGER NOT NULL DEFAULT 0,
    "ocr_billable" INTEGER NOT NULL DEFAULT 0,
    "table_billable" INTEGER NOT NULL DEFAULT 0,
    "invoiced_at" TIMESTAMP(3),
    "stripe_usage_record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_usage_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "tenant_features" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "module_code" "ModuleCode" NOT NULL,
    "is_allowed" BOOLEAN NOT NULL DEFAULT true,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_module_prefs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "module_code" "ModuleCode" NOT NULL,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_module_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_cache" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_rate_limits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "last_request" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocr_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_monthly_usage" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "month_key" TEXT NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "free_quota" INTEGER NOT NULL DEFAULT 30,
    "unit_price_jpy" INTEGER NOT NULL DEFAULT 10,
    "first_overage_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocr_monthly_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_ledger_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cash_journal_id" INTEGER NOT NULL,
    "cash_account_id" INTEGER NOT NULL,
    "bank_journal_id_toza" INTEGER,
    "bank_account_id_toza" INTEGER,
    "bank_journal_id_futsu" INTEGER,
    "bank_account_id_futsu" INTEGER,
    "account_mappings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_ledger_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_zh" TEXT NOT NULL,
    "name_ja" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_products" (
    "id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_zh" TEXT,
    "name_ja" TEXT,
    "description" TEXT,
    "description_zh" TEXT,
    "description_ja" TEXT,
    "product_type" "ProductType" NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "price_monthly" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "price_yearly" DECIMAL(65,30),
    "included_modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_users" INTEGER,
    "max_terminals" INTEGER,
    "enables_module" TEXT,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "odoo19_product_id" INTEGER,
    "stripe_product_id" TEXT,
    "stripe_price_monthly" TEXT,
    "stripe_price_yearly" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "plan_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allowed_modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_users" INTEGER NOT NULL DEFAULT 5,
    "price_monthly" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "price_yearly" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "trial_days" INTEGER NOT NULL DEFAULT 14,
    "odoo19_product_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "odoo19_order_id" INTEGER,
    "odoo19_partner_id" INTEGER,
    "stripe_subscription_id" TEXT,
    "stripe_current_period_end" TIMESTAMP(3),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" TIMESTAMP(3) NOT NULL,
    "next_billing_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "total_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "trial_end_date" TIMESTAMP(3),
    "is_in_trial" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_items" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(65,30) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "odoo19_line_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_registrations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "provider" "OAuthProvider" NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tenant_code" TEXT NOT NULL,
    "user_id" TEXT,
    "status" "ProvisioningStatus" NOT NULL DEFAULT 'PENDING',
    "current_step" "ProvisioningStep" NOT NULL DEFAULT 'STEP_0_INIT',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_run_at" TIMESTAMP(3),
    "last_error" TEXT,
    "failed_step" "ProvisioningStep",
    "progress_data" JSONB,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provisioning_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "odoo19_invoice_id" INTEGER,
    "invoice_number" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_date" TIMESTAMP(3),
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "last_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "odoo19_payment_id" INTEGER,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "payment_method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gateway_provider" TEXT,
    "gateway_transaction_id" TEXT,
    "payment_date" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "type" "OcrDocumentType" NOT NULL,
    "status" "OcrDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "source_file_s3_key" TEXT NOT NULL,
    "source_file_mime" TEXT NOT NULL,
    "source_file_name" TEXT,
    "source_file_size" BIGINT,
    "anonymous_session_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocr_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_results" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "raw_json" JSONB NOT NULL,
    "extracted_fields_json" JSONB NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gemini',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_journals" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "journal_json" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writeback_logs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "odoo_model" TEXT NOT NULL,
    "odoo_record_id" INTEGER NOT NULL,
    "odoo_url" TEXT,
    "status" "WritebackStatus" NOT NULL,
    "error_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writeback_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_files" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target" "ExportTarget" NOT NULL,
    "encoding" "ExportEncoding" NOT NULL DEFAULT 'UTF8_BOM',
    "s3_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_audit_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "event_name" TEXT NOT NULL,
    "payload_json" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_tenant_code_key" ON "tenants"("tenant_code");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_stripe_customer_id_key" ON "tenants"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_odoo_user_id_key" ON "users"("tenant_id", "odoo_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_tenant_id_key" ON "memberships"("user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stores_tenant_id_code_key" ON "stores"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_tenant_id_key" ON "entitlements"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_module_entitlements_tenant_id_module_key_key" ON "tenant_module_entitlements"("tenant_id", "module_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_usage_events_idempotency_key_key" ON "tenant_usage_events"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_usage_periods_tenant_id_period_start_at_key" ON "tenant_usage_periods"("tenant_id", "period_start_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_features_tenant_id_module_code_key" ON "tenant_features"("tenant_id", "module_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_module_prefs_user_id_module_code_key" ON "user_module_prefs"("user_id", "module_code");

-- CreateIndex
CREATE UNIQUE INDEX "ocr_cache_hash_key" ON "ocr_cache"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "ocr_rate_limits_tenant_id_user_id_date_key" ON "ocr_rate_limits"("tenant_id", "user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ocr_monthly_usage_tenant_id_month_key_key" ON "ocr_monthly_usage"("tenant_id", "month_key");

-- CreateIndex
CREATE UNIQUE INDEX "cash_ledger_settings_tenant_id_key" ON "cash_ledger_settings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_types_code_key" ON "expense_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_products_product_code_key" ON "subscription_products"("product_code");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_products_odoo19_product_id_key" ON "subscription_products"("odoo19_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_products_stripe_product_id_key" ON "subscription_products"("stripe_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_plan_code_key" ON "subscription_plans"("plan_code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_items_subscription_id_product_id_key" ON "subscription_items"("subscription_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_registrations_email_key" ON "pending_registrations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "provisioning_jobs_tenant_code_key" ON "provisioning_jobs"("tenant_code");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_journals_document_id_key" ON "canonical_journals"("document_id");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_role_idx" ON "memberships"("tenant_id", "role");

-- CreateIndex
CREATE INDEX "stores_tenant_id_is_active_idx" ON "stores"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_status_idx" ON "invitations"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "invitations_email_status_idx" ON "invitations"("email", "status");

-- CreateIndex
CREATE INDEX "invitations_expires_at_idx" ON "invitations"("expires_at");

-- CreateIndex
CREATE INDEX "files_tenant_id_category_idx" ON "files"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "files_tenant_id_store_id_idx" ON "files"("tenant_id", "store_id");

-- CreateIndex
CREATE INDEX "files_tenant_id_uploader_id_idx" ON "files"("tenant_id", "uploader_id");

-- CreateIndex
CREATE INDEX "files_bucket_key_idx" ON "files"("bucket", "key");

-- CreateIndex
CREATE INDEX "files_resource_type_resource_id_idx" ON "files"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "tenant_module_entitlements_tenant_id_idx" ON "tenant_module_entitlements"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_usage_events_tenant_id_feature_key_created_at_idx" ON "tenant_usage_events"("tenant_id", "feature_key", "created_at");

-- CreateIndex
CREATE INDEX "tenant_usage_events_entitlements_id_idx" ON "tenant_usage_events"("entitlements_id");

-- CreateIndex
CREATE INDEX "tenant_usage_periods_tenant_id_idx" ON "tenant_usage_periods"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_usage_periods_entitlements_id_idx" ON "tenant_usage_periods"("entitlements_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_action_idx" ON "audit_logs"("tenant_id", "action");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_user_id_idx" ON "audit_logs"("target_user_id");

-- CreateIndex
CREATE INDEX "verification_codes_email_code_idx" ON "verification_codes"("email", "code");

-- CreateIndex
CREATE INDEX "provisioning_jobs_status_next_run_at_idx" ON "provisioning_jobs"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "provisioning_jobs_tenant_id_idx" ON "provisioning_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "ocr_documents_tenant_id_type_idx" ON "ocr_documents"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "ocr_documents_tenant_id_status_idx" ON "ocr_documents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ocr_documents_anonymous_session_id_idx" ON "ocr_documents"("anonymous_session_id");

-- CreateIndex
CREATE INDEX "ocr_results_document_id_idx" ON "ocr_results"("document_id");

-- CreateIndex
CREATE INDEX "canonical_journals_tenant_id_idx" ON "canonical_journals"("tenant_id");

-- CreateIndex
CREATE INDEX "writeback_logs_document_id_idx" ON "writeback_logs"("document_id");

-- CreateIndex
CREATE INDEX "writeback_logs_tenant_id_user_id_idx" ON "writeback_logs"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "export_files_document_id_idx" ON "export_files"("document_id");

-- CreateIndex
CREATE INDEX "export_files_tenant_id_user_id_idx" ON "export_files"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "ocr_audit_events_tenant_id_idx" ON "ocr_audit_events"("tenant_id");

-- CreateIndex
CREATE INDEX "ocr_audit_events_event_name_idx" ON "ocr_audit_events"("event_name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_module_entitlements" ADD CONSTRAINT "tenant_module_entitlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_usage_events" ADD CONSTRAINT "tenant_usage_events_entitlements_id_fkey" FOREIGN KEY ("entitlements_id") REFERENCES "entitlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_usage_periods" ADD CONSTRAINT "tenant_usage_periods_entitlements_id_fkey" FOREIGN KEY ("entitlements_id") REFERENCES "entitlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_module_prefs" ADD CONSTRAINT "user_module_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "subscription_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_documents" ADD CONSTRAINT "ocr_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_results" ADD CONSTRAINT "ocr_results_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_journals" ADD CONSTRAINT "canonical_journals_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writeback_logs" ADD CONSTRAINT "writeback_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_files" ADD CONSTRAINT "export_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
