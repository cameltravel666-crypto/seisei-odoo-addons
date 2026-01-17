/**
 * Structured Logger for Provisioning
 */

import { ProvisioningStep, ProvisioningLogEntry } from './types';

export function logProvisioning(entry: Omit<ProvisioningLogEntry, 'timestamp'>): void {
  const logEntry: ProvisioningLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  const prefix = `[Provisioning]`;
  const context = `[${entry.tenantCode}][${entry.jobId}][${entry.step}]`;

  if (entry.status === 'error') {
    console.error(
      `${prefix}${context} ERROR: ${entry.error || entry.message}`,
      entry.elapsedMs ? `(${entry.elapsedMs}ms)` : ''
    );
  } else if (entry.status === 'success') {
    console.log(
      `${prefix}${context} SUCCESS: ${entry.message || 'Step completed'}`,
      entry.elapsedMs ? `(${entry.elapsedMs}ms)` : ''
    );
  } else {
    console.log(`${prefix}${context} START: ${entry.message || 'Starting step'}`);
  }

  // In production, you might send this to a logging service
  // e.g., await sendToLogService(logEntry);
}

export function createStepLogger(jobId: string, tenantCode: string, step: ProvisioningStep) {
  const startTime = Date.now();

  return {
    start: (message?: string) => {
      logProvisioning({
        jobId,
        tenantCode,
        step,
        status: 'start',
        message,
      });
    },
    success: (message?: string) => {
      logProvisioning({
        jobId,
        tenantCode,
        step,
        status: 'success',
        message,
        elapsedMs: Date.now() - startTime,
      });
    },
    error: (error: string | Error) => {
      logProvisioning({
        jobId,
        tenantCode,
        step,
        status: 'error',
        error: error instanceof Error ? error.message : error,
        elapsedMs: Date.now() - startTime,
      });
    },
  };
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Remove sensitive info from stack traces
    const sanitized = error.message
      .replace(/password[=:]\s*['"]?[^'"\s]+['"]?/gi, 'password=***')
      .replace(/token[=:]\s*['"]?[^'"\s]+['"]?/gi, 'token=***')
      .replace(/key[=:]\s*['"]?[^'"\s]+['"]?/gi, 'key=***');
    return sanitized;
  }
  return String(error);
}
