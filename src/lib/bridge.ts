/**
 * Bridge API Client
 * Handles tenant provisioning via Bridge API
 */

const BRIDGE_API_URL = process.env.BRIDGE_API_URL || 'http://13.159.193.191:23000';
const BRIDGE_API_TIMEOUT = 120000; // 2 minutes for DB creation

export interface BridgeTenantPayload {
  tenant_code: string;
  tenant_name: string;
  subdomain: string;
  domain_primary: string;
  customer_db_name: string;
  plan: string;
  active: boolean;
  note?: string;
}

export interface BridgeResponse {
  ok: boolean;
  error?: string;
  error_code?: string;
  data?: {
    tenant_code?: string;
    database_name?: string;
    database_url?: string;
    status?: string;
    [key: string]: unknown;
  };
}

/**
 * Upsert tenant in Bridge API
 * This triggers the actual Odoo 18 database creation
 */
export async function upsertTenantInBridge(
  tenantCode: string,
  payload: BridgeTenantPayload
): Promise<BridgeResponse> {
  const url = `${BRIDGE_API_URL}/admin/tenants/${tenantCode}`;

  console.log(`[Bridge] Calling PUT ${url}`);
  console.log(`[Bridge] Payload:`, JSON.stringify(payload, null, 2));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BRIDGE_API_TIMEOUT);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: Record<string, unknown> = {};
    try {
      const text = await response.text();
      if (text) {
        data = JSON.parse(text);
      }
    } catch {
      // Response might not be JSON
    }

    console.log(`[Bridge] Response status: ${response.status}`);
    console.log(`[Bridge] Response data:`, JSON.stringify(data, null, 2));

    if (!response.ok) {
      // Handle nested error message from Bridge API
      // Bridge returns: {"statusCode":400,"message":{"message":"...", "error":"...", "statusCode":400}}
      let errorMessage = `HTTP ${response.status}`;
      let errorCode = 'HTTP_ERROR';

      if (data.message) {
        if (typeof data.message === 'string') {
          errorMessage = data.message;
        } else if (typeof data.message === 'object' && data.message !== null) {
          // Nested message object
          const msgObj = data.message as Record<string, unknown>;
          errorMessage = (msgObj.message as string) || (msgObj.error as string) || JSON.stringify(msgObj);
        }
      } else if (data.error) {
        errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      }

      if (data.statusCode) {
        errorCode = `HTTP_${data.statusCode}`;
      }

      return {
        ok: false,
        error: errorMessage,
        error_code: errorCode,
      };
    }

    return {
      ok: true,
      data: data as BridgeResponse['data'],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Bridge] Error:`, errorMessage);

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        error: `Bridge API timeout after ${BRIDGE_API_TIMEOUT / 1000}s`,
        error_code: 'TIMEOUT',
      };
    }

    return {
      ok: false,
      error: errorMessage,
      error_code: 'REQUEST_ERROR',
    };
  }
}

/**
 * Get tenant info from Bridge API
 */
export async function getTenantFromBridge(tenantCode: string): Promise<BridgeResponse> {
  const url = `${BRIDGE_API_URL}/admin/tenants/${tenantCode}`;

  console.log(`[Bridge] Calling GET ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    let data: Record<string, unknown> = {};
    try {
      const text = await response.text();
      if (text) {
        data = JSON.parse(text);
      }
    } catch {
      // Response might not be JSON
    }

    if (!response.ok) {
      return {
        ok: false,
        error: (data.message as string) || (data.error as string) || `HTTP ${response.status}`,
        error_code: (data.code as string) || 'HTTP_ERROR',
      };
    }

    return {
      ok: true,
      data: data as BridgeResponse['data'],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Bridge] Error:`, errorMessage);

    return {
      ok: false,
      error: errorMessage,
      error_code: 'REQUEST_ERROR',
    };
  }
}
