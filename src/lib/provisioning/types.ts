/**
 * Provisioning Types and Constants
 */

export enum ProvisioningStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export enum ProvisioningStep {
  STEP_0_INIT = 'STEP_0_INIT',
  STEP_1_COPY_DB = 'STEP_1_COPY_DB',
  STEP_2_ODOO18_AUTH = 'STEP_2_ODOO18_AUTH',
  STEP_3_ODOO18_UPDATE_ADMIN = 'STEP_3_ODOO18_UPDATE_ADMIN',
  STEP_3B_ODOO18_SETUP_APIKEY = 'STEP_3B_ODOO18_SETUP_APIKEY', // New: Setup API key in Odoo 18
  STEP_4_ODOO19_UPSERT_TENANT = 'STEP_4_ODOO19_UPSERT_TENANT',
  STEP_4B_SEISEI_BILLING_TENANT = 'STEP_4B_SEISEI_BILLING_TENANT', // New: Create tenant in Seisei Billing
  STEP_5_ODOO19_UPSERT_USER = 'STEP_5_ODOO19_UPSERT_USER',
  STEP_6_BRIDGE_METADATA = 'STEP_6_BRIDGE_METADATA',
  STEP_7_FINALIZE = 'STEP_7_FINALIZE',
}

export const STEP_ORDER: ProvisioningStep[] = [
  ProvisioningStep.STEP_0_INIT,
  ProvisioningStep.STEP_1_COPY_DB,
  ProvisioningStep.STEP_2_ODOO18_AUTH,
  ProvisioningStep.STEP_3_ODOO18_UPDATE_ADMIN,
  ProvisioningStep.STEP_3B_ODOO18_SETUP_APIKEY,
  ProvisioningStep.STEP_4_ODOO19_UPSERT_TENANT,
  ProvisioningStep.STEP_4B_SEISEI_BILLING_TENANT,
  ProvisioningStep.STEP_5_ODOO19_UPSERT_USER,
  ProvisioningStep.STEP_6_BRIDGE_METADATA,
  ProvisioningStep.STEP_7_FINALIZE,
];

export interface ProgressData {
  // Step 1 results
  odoo18DbName?: string;
  odoo18DbCreated?: boolean;

  // Step 2 results
  odoo18SessionId?: string;

  // Step 3 results
  odoo18AdminUpdated?: boolean;
  generatedPassword?: string; // Stored encrypted

  // Step 3B results (API Key setup)
  odoo18ApiKeyConfigured?: boolean;
  odoo18ApiKey?: string; // The generated API key (stored for billing integration)

  // Step 4 results
  odoo19TenantId?: number;

  // Step 4B results (Seisei Billing)
  seiseiBillingTenantId?: number;
  seiseiBillingApiKey?: string;

  // Step 5 results
  odoo19UserId?: number;

  // Step 6 results
  bridgeMetadataStored?: boolean;

  // Metadata
  industry?: string;
  ownerEmail?: string;
  ownerName?: string;
  templateDb?: string;
  locale?: string; // User's preferred language (ja, zh, en)
}

export interface ProvisioningContext {
  jobId: string;
  tenantId: string;
  tenantCode: string;
  userId?: string;
  progressData: ProgressData;
}

export interface StepResult {
  success: boolean;
  error?: string;
  data?: Partial<ProgressData>;
}

export interface ProvisioningLogEntry {
  timestamp: string;
  jobId: string;
  tenantCode: string;
  step: ProvisioningStep;
  status: 'start' | 'success' | 'error';
  elapsedMs?: number;
  message?: string;
  error?: string;
}

// Configuration
export const PROVISIONING_CONFIG = {
  maxAttempts: 5,
  lockTimeoutMs: 5 * 60 * 1000, // 5 minutes
  retryDelays: [1000, 5000, 15000, 60000, 300000], // Exponential backoff
  fetchTimeoutMs: 30000, // 30 seconds for external calls
};

// Template mapping - all industries now use the production template
export const PRODUCTION_TEMPLATE_DB = 'tpl_production';

export function getTemplateForIndustry(_industry?: string): string {
  // All new tenants use the unified production template
  return PRODUCTION_TEMPLATE_DB;
}
