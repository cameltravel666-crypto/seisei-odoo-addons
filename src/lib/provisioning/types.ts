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
  STEP_4_ODOO19_UPSERT_TENANT = 'STEP_4_ODOO19_UPSERT_TENANT',
  STEP_5_ODOO19_UPSERT_USER = 'STEP_5_ODOO19_UPSERT_USER',
  STEP_6_BRIDGE_METADATA = 'STEP_6_BRIDGE_METADATA',
  STEP_7_FINALIZE = 'STEP_7_FINALIZE',
}

export const STEP_ORDER: ProvisioningStep[] = [
  ProvisioningStep.STEP_0_INIT,
  ProvisioningStep.STEP_1_COPY_DB,
  ProvisioningStep.STEP_2_ODOO18_AUTH,
  ProvisioningStep.STEP_3_ODOO18_UPDATE_ADMIN,
  ProvisioningStep.STEP_4_ODOO19_UPSERT_TENANT,
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

  // Step 4 results
  odoo19TenantId?: number;

  // Step 5 results
  odoo19UserId?: number;

  // Step 6 results
  bridgeMetadataStored?: boolean;

  // Metadata
  industry?: string;
  ownerEmail?: string;
  ownerName?: string;
  templateDb?: string;
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

// Template mapping
export const INDUSTRY_TEMPLATE_MAP: Record<string, string> = {
  restaurant: 'tpl_restaurant',
  retail: 'tpl_retail',
  service: 'tpl_service',
  consulting: 'tpl_consulting',
  realestate: 'tpl_realestate',
};

export function getTemplateForIndustry(industry?: string): string {
  return INDUSTRY_TEMPLATE_MAP[industry || ''] || 'tpl_service';
}
