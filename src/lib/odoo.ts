/**
 * Odoo 18 JSON-RPC Client
 * Server-side only - all Odoo calls must go through this client
 */

import { encrypt, decrypt } from './auth';

export interface OdooConfig {
  baseUrl: string;
  db: string;
}

export interface OdooSession {
  sessionId: string;
  uid: number;
  username: string;
  name: string;
  companyId: number;
}

export interface OdooError {
  code: string;
  message: string;
  details?: unknown;
}

// Allowlist of permitted model/method combinations
const ODOO_ALLOWLIST: Record<string, string[]> = {
  // POS
  'product.template': ['search_read', 'read', 'write', 'search_count', 'create'],
  'product.product': ['search_read', 'read', 'write', 'search_count'],
  'pos.category': ['search_read', 'read', 'search_count', 'create', 'write', 'unlink'],
  'pos.order': ['search_read', 'read', 'write', 'create', 'unlink', 'search_count', 'read_group'],
  'pos.order.line': ['search_read', 'read'],
  'pos.payment': ['search_read', 'read'],
  'pos.session': ['search_read', 'read'],
  // POS Restaurant (Tables)
  'restaurant.floor': ['search_read', 'read', 'search_count'],
  'restaurant.table': ['search_read', 'read', 'write', 'search_count'],
  // Purchase
  'purchase.order': ['search_read', 'read', 'write', 'create', 'button_approve', 'button_confirm', 'button_cancel', 'action_rfq_send', 'action_create_invoice', 'search_count', 'read_group'],
  // Mail
  'mail.compose.message': ['create', 'action_send_mail'],
  'mail.template': ['search_read', 'read'],
  'purchase.order.line': ['search_read', 'read', 'write', 'create', 'search_count'],
  // Sales
  'sale.order': ['search_read', 'read', 'write', 'create', 'search_count', 'read_group', '_create_invoices', 'action_confirm'],
  'sale.order.line': ['search_read', 'read', 'search_count'],
  // Expenses
  'hr.expense': ['search_read', 'read', 'write', 'action_submit_expenses', 'approve_expense_sheets', 'refuse_expense', 'search_count', 'read_group'],
  'hr.expense.sheet': ['search_read', 'read', 'write', 'action_submit_sheet', 'approve_expense_sheets', 'refuse_sheet', 'search_count'],
  // Accounting
  'account.move': ['search_read', 'read', 'search_count', 'action_post', 'read_group', 'create'],
  'account.move.line': ['search_read', 'read', 'read_group'],
  'account.journal': ['search_read', 'read', 'search_count'],
  'account.account': ['search_read', 'read', 'search_count'],
  // CRM
  'crm.lead': ['search_read', 'read', 'write', 'create', 'search_count', 'read_group'],
  'crm.stage': ['search_read', 'read', 'search_count'],
  'mail.activity': ['search_read', 'read', 'search_count'],
  'mail.activity.type': ['search_read', 'read'],
  // Inventory
  'stock.picking': ['search_read', 'read', 'write', 'button_validate', 'search_count', 'read_group'],
  'stock.picking.type': ['search_read', 'read', 'search_count'],
  'stock.move': ['search_read', 'read', 'write', 'search_count'],
  'stock.move.line': ['search_read', 'read', 'search_count'],
  'stock.quant': ['search_read', 'read', 'search_count', 'read_group'],
  'stock.location': ['search_read', 'read', 'search_count'],
  'stock.immediate.transfer': ['create', 'process'],
  'stock.backorder.confirmation': ['create', 'process'],
  // HR & Payroll (standard + bi_hr_payroll module)
  'hr.employee': ['search_read', 'read', 'search_count'],
  'hr.attendance': ['search_read', 'read', 'search_count'],
  'hr.contract': ['search_read', 'read', 'search_count'],
  'hr.payslip': ['search_read', 'read', 'search_count', 'read_group'],
  'hr.payslip.line': ['search_read', 'read', 'search_count'],
  'hr.payslip.run': ['search_read', 'read', 'search_count'],
  // bi_hr_payroll specific models (if different from standard)
  'bi.hr.payslip': ['search_read', 'read', 'search_count', 'read_group'],
  'bi.payslip': ['search_read', 'read', 'search_count', 'read_group'],
  // Maintenance
  'maintenance.request': ['search_read', 'read', 'write', 'search_count'],
  'maintenance.equipment': ['search_read', 'read', 'search_count'],
  // Documents
  'ir.attachment': ['search_read', 'read', 'create', 'unlink', 'search_count'],
  // Manufacturing (MRP)
  'mrp.bom': ['search_read', 'read', 'create', 'write', 'unlink', 'search_count'],
  'mrp.bom.line': ['search_read', 'read', 'create', 'write', 'unlink', 'search_count'],
  'uom.uom': ['search_read', 'read', 'search_count'],
  // Product Management (PLM)
  'product.category': ['search_read', 'read', 'create', 'write', 'unlink', 'search_count'],
  // Common
  'res.partner': ['search_read', 'read'],
  'res.users': ['search_read', 'read'],
  'res.company': ['search_read', 'read'],
};

// Check if model/method is allowed
export function isAllowed(model: string, method: string): boolean {
  const allowedMethods = ODOO_ALLOWLIST[model];
  if (!allowedMethods) return false;
  return allowedMethods.includes(method);
}

// JSON-RPC call helper
async function jsonRpc(
  baseUrl: string,
  endpoint: string,
  params: Record<string, unknown>,
  sessionId?: string
): Promise<{ result: unknown; sessionId?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionId) {
    headers['Cookie'] = `session_id=${sessionId}`;
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params,
      id: Date.now(),
    }),
  });

  const data = await response.json();

  if (data.error) {
    const error = data.error.data || data.error;
    throw new Error(error.message || 'Odoo RPC error');
  }

  // Extract session_id from Set-Cookie header
  let extractedSessionId: string | undefined;
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/session_id=([^;]+)/);
    if (match) {
      extractedSessionId = match[1];
    }
  }

  return { result: data.result, sessionId: extractedSessionId };
}

export class OdooRPC {
  private config: OdooConfig;
  private sessionId: string | null = null;

  constructor(config: OdooConfig) {
    this.config = config;
  }

  // Authenticate with Odoo
  async authenticate(username: string, password: string): Promise<OdooSession> {
    try {
      const { result, sessionId: cookieSessionId } = await jsonRpc(this.config.baseUrl, '/web/session/authenticate', {
        db: this.config.db,
        login: username,
        password,
      });

      const data = result as Record<string, unknown>;

      if (!data.uid || data.uid === false) {
        throw new Error('Invalid credentials');
      }

      // Use session_id from cookie header, fallback to response body
      this.sessionId = cookieSessionId || (data.session_id as string) || '';

      if (!this.sessionId) {
        console.warn('[OdooRPC] No session_id received, using uid-based session');
        this.sessionId = `${data.uid}_${Date.now()}`;
      }

      return {
        sessionId: encrypt(this.sessionId),
        uid: data.uid as number,
        username: data.username as string || username,
        name: data.name as string || username,
        companyId: data.company_id as number || 1,
      };
    } catch (error) {
      console.error('[OdooRPC] Authentication failed:', error);
      throw new Error('Authentication failed');
    }
  }

  // Set session for subsequent calls
  setSession(encryptedSessionId: string) {
    this.sessionId = decrypt(encryptedSessionId);
  }

  // Call Odoo method (call_kw)
  async callKw<T = unknown>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    // Validate against allowlist
    if (!isAllowed(model, method)) {
      throw new Error(`Method ${method} on model ${model} is not allowed`);
    }

    if (!this.sessionId) {
      throw new Error('No session available');
    }

    try {
      const { result } = await jsonRpc(
        this.config.baseUrl,
        '/web/dataset/call_kw',
        {
          model,
          method,
          args,
          kwargs,
        },
        this.sessionId
      );

      return result as T;
    } catch (error) {
      console.error(`[OdooRPC] Error calling ${model}.${method}:`, error);
      throw error;
    }
  }

  // Convenience methods
  async searchRead<T = unknown>(
    model: string,
    domain: unknown[] = [],
    options: { fields?: string[]; limit?: number; offset?: number; order?: string } = {}
  ): Promise<T[]> {
    return this.callKw<T[]>(model, 'search_read', [domain], {
      fields: options.fields || [],
      limit: options.limit || 100,
      offset: options.offset || 0,
      order: options.order,
    });
  }

  async read<T = unknown>(model: string, ids: number[], fields: string[] = []): Promise<T[]> {
    return this.callKw<T[]>(model, 'read', [ids, fields]);
  }

  async write(model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
    return this.callKw<boolean>(model, 'write', [ids, values]);
  }

  async searchCount(model: string, domain: unknown[] = []): Promise<number> {
    return this.callKw<number>(model, 'search_count', [domain]);
  }

  async create(model: string, values: Record<string, unknown>): Promise<number> {
    return this.callKw<number>(model, 'create', [values]);
  }

  async unlink(model: string, ids: number[]): Promise<boolean> {
    return this.callKw<boolean>(model, 'unlink', [ids]);
  }

  async readGroup<T = unknown>(
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    groupBy: string[] = [],
    options: { limit?: number; offset?: number; orderby?: string; lazy?: boolean } = {}
  ): Promise<T[]> {
    return this.callKw<T[]>(model, 'read_group', [domain, fields, groupBy], {
      limit: options.limit,
      offset: options.offset || 0,
      orderby: options.orderby,
      lazy: options.lazy ?? true,
    });
  }
}

// Create Odoo client instance
export function createOdooClient(config: OdooConfig): OdooRPC {
  return new OdooRPC(config);
}

// Import prisma dynamically to avoid circular dependency
import { prisma } from './db';
import type { JWTPayload } from './auth';

// Get Odoo client for authenticated session
export async function getOdooClientForSession(session: JWTPayload): Promise<OdooRPC> {
  // Get tenant info
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  // Get session from database
  const dbSession = await prisma.session.findUnique({
    where: { id: session.sessionId },
  });

  if (!dbSession) {
    throw new Error('Session not found');
  }

  // Create Odoo client and set session
  const odoo = createOdooClient({
    baseUrl: tenant.odooBaseUrl,
    db: tenant.odooDb,
  });

  odoo.setSession(dbSession.odooSessionId);

  return odoo;
}
