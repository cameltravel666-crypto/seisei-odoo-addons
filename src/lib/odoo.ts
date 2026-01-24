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
  // Reports
  'ir.actions.report': ['_render_qweb_pdf'],
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
  'purchase.order': ['search_read', 'read', 'write', 'create', 'button_approve', 'button_confirm', 'button_cancel', 'action_rfq_send', 'action_create_invoice', 'search_count', 'read_group', 'action_ocr_scan', 'action_ocr_reset', 'action_ocr_apply_lines'],
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
  'account.move': ['search_read', 'read', 'search_count', 'action_post', 'read_group', 'create', 'write', 'action_send_to_ocr', 'action_batch_send_to_ocr', 'action_reset_ocr', 'action_ocr_apply_lines'],
  'account.move.line': ['search_read', 'read', 'read_group', 'search_count'],
  'account.journal': ['search_read', 'read', 'search_count'],
  'account.account': ['search_read', 'read', 'search_count', 'read_group'],
  'account.payment': ['search_read', 'read', 'search_count', 'create', 'write', 'action_post', 'action_draft', 'action_cancel'],
  'account.payment.register': ['create', 'action_create_payments'],
  'account.bank.statement': ['search_read', 'read', 'search_count'],
  'account.bank.statement.line': ['search_read', 'read', 'search_count', 'write', 'action_undo_reconciliation'],
  'account.asset.asset': ['search_read', 'read', 'search_count', 'create', 'write', 'validate', 'set_to_close'],
  'account.asset.depreciation.line': ['search_read', 'read', 'search_count', 'create_move'],
  'account.financial.report': ['search_read', 'read', 'search_count'],
  // CRM
  'crm.lead': ['search_read', 'read', 'write', 'create', 'search_count', 'read_group'],
  'crm.stage': ['search_read', 'read', 'search_count'],
  'crm.tag': ['search_read', 'read', 'create'],
  'mail.activity': ['search_read', 'read', 'search_count'],
  'mail.activity.type': ['search_read', 'read'],
  // Quote Integration
  'quote.request': ['search_read', 'read', 'write', 'create', 'search_count', 'action_mark_downloaded', 'action_mark_shared', 'action_mark_viewed'],
  'utm.source': ['search_read', 'create'],
  'utm.medium': ['search_read', 'create'],
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
  'res.partner': ['search_read', 'read', 'search_count', 'write', 'create'],
  'res.users': ['search_read', 'read'],
  'res.company': ['search_read', 'read'],
  // Sheet Forge (OCR File)
  'ocr.file.task': ['search_read', 'read', 'create', 'write', 'unlink', 'search_count', 'action_start_ocr', 'action_fill_template', 'action_reset'],
  'ocr.file.source': ['search_read', 'read', 'create', 'write', 'unlink', 'search_count'],
  'ocr.file.usage': ['search_read', 'read', 'search_count'],
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

  // Get PDF report from Odoo with language context
  // Uses /report/download endpoint which properly handles context parameter
  async getReportPdf(reportName: string, ids: number[], lang?: string): Promise<Buffer> {
    if (!this.sessionId) {
      throw new Error('No session available');
    }

    // First, verify session is still valid by making a simple API call
    try {
      await this.callKw('res.users', 'search_read', [[['id', '=', 1]]], { fields: ['id'], limit: 1 });
    } catch (error) {
      console.error('[OdooRPC] Session validation failed:', error);
      throw new Error('会话已过期，请重新登录 / Session expired, please login again');
    }

    console.log('[OdooRPC] Generating PDF report:', reportName, 'ids:', ids, 'lang:', lang);

    const idsStr = ids.join(',');

    // Method 1: Try /report/download endpoint with context parameter
    // This is the endpoint Odoo web client uses and properly handles context
    try {
      const reportPdfUrl = `/report/pdf/${reportName}/${idsStr}`;
      const downloadData = JSON.stringify([reportPdfUrl, 'qweb-pdf']);
      const contextParam = lang ? JSON.stringify({ lang }) : '';

      const params = new URLSearchParams();
      params.set('data', downloadData);
      if (contextParam) {
        params.set('context', contextParam);
      }

      const downloadUrl = `${this.config.baseUrl}/report/download?${params.toString()}`;
      console.log('[OdooRPC] Trying /report/download:', downloadUrl);

      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Cookie': `session_id=${this.sessionId}`,
          'Accept': 'application/pdf,*/*',
        },
        redirect: 'manual',
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/pdf') || contentType?.includes('application/octet-stream')) {
          const arrayBuffer = await response.arrayBuffer();
          const pdfBuffer = Buffer.from(arrayBuffer);
          console.log('[OdooRPC] PDF generated via /report/download, size:', pdfBuffer.length, 'bytes');
          return pdfBuffer;
        }
      }
      console.warn('[OdooRPC] /report/download method did not return PDF, trying direct URL');
    } catch (err1) {
      console.warn('[OdooRPC] /report/download failed:', err1);
    }

    // Method 2: Try custom API endpoint first (if vendor_ops_core module is installed)
    // Then fall back to standard Odoo endpoint
    const params = new URLSearchParams();
    params.set('db', this.config.db);
    if (lang) {
      params.set('lang', lang);
    }
    const queryString = params.toString();

    // Try custom API endpoint first (supports language context)
    const customApiUrl = `${this.config.baseUrl}/api/report/pdf/${reportName}/${idsStr}?${queryString}`;
    console.log('[OdooRPC] Trying custom API:', customApiUrl);

    let response = await fetch(customApiUrl, {
      method: 'GET',
      headers: {
        'Cookie': `session_id=${this.sessionId}`,
        'Accept': 'application/pdf',
      },
      redirect: 'follow',
    });

    // If custom API fails (404), fall back to standard Odoo endpoint
    if (response.status === 404) {
      console.log('[OdooRPC] Custom API not available, using standard Odoo endpoint');
      const standardUrl = `${this.config.baseUrl}/report/pdf/${reportName}/${idsStr}?${queryString}`;
      console.log('[OdooRPC] Fetching PDF from:', standardUrl);

      response = await fetch(standardUrl, {
        method: 'GET',
        headers: {
          'Cookie': `session_id=${this.sessionId}`,
          'Accept': 'application/pdf',
        },
        redirect: 'follow',
      });
    }

    if (!response.ok) {
      console.error('[OdooRPC] PDF request failed:', response.status, response.statusText);
      throw new Error(`PDF generation failed: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');

    if (!contentType?.includes('application/pdf')) {
      const text = await response.text();
      console.error('[OdooRPC] Non-PDF response (first 500 chars):', text.substring(0, 500));

      if (text.includes('login') || text.includes('web/login') || text.includes('oe_login')) {
        throw new Error('会话已过期，请重新登录 / Session expired, please login again');
      }

      throw new Error('PDF generation failed - unexpected response type: ' + contentType);
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    console.log('[OdooRPC] PDF generated successfully, size:', pdfBuffer.length, 'bytes');
    return pdfBuffer;
  }

  // Get base URL for building URLs
  getBaseUrl(): string {
    return this.config.baseUrl;
  }
}

// Create Odoo client instance
export function createOdooClient(config: OdooConfig): OdooRPC {
  return new OdooRPC(config);
}

// Import prisma dynamically to avoid circular dependency
import { prisma } from './db';
import type { JWTPayload } from './auth';

// Custom error for tenant provisioning state
export class TenantProvisioningError extends Error {
  code = 'TENANT_PROVISIONING';

  constructor(message: string = 'Tenant is still being provisioned') {
    super(message);
    this.name = 'TenantProvisioningError';
  }
}

// Get Odoo client for authenticated session
export async function getOdooClientForSession(session: JWTPayload): Promise<OdooRPC> {
  // Get tenant info
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  // Check if tenant is still being provisioned
  if (tenant.provisionStatus === 'provisioning' || tenant.provisionStatus === 'pending') {
    throw new TenantProvisioningError('Your account is being set up. This usually takes 1-2 minutes.');
  }

  // Check if provisioning failed
  if (tenant.provisionStatus === 'failed') {
    throw new TenantProvisioningError('Account setup encountered an issue. Please contact support.');
  }

  // Get session from database
  const dbSession = await prisma.session.findUnique({
    where: { id: session.sessionId },
  });

  if (!dbSession) {
    throw new Error('Session not found');
  }

  // Check for placeholder session ID (fallback check)
  if (dbSession.odooSessionId === 'pending_provisioning') {
    throw new TenantProvisioningError('Your account is being set up. Please wait a moment and refresh.');
  }

  // Create Odoo client and set session
  const odoo = createOdooClient({
    baseUrl: tenant.odooBaseUrl,
    db: tenant.odooDb,
  });

  odoo.setSession(dbSession.odooSessionId);

  return odoo;
}
