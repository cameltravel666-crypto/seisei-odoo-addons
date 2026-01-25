/**
 * Odoo 19 Enterprise RPC Client for Subscription Management
 * Connects to Odoo 19 server for billing, subscriptions, and invoices
 */

export interface Odoo19Config {
  baseUrl: string;
  db: string;
  username: string;
  password: string;
}

// ============================================
// Metered Billing Types
// ============================================

export interface BillingRule {
  productId: number;
  productCode: string;
  name: string;
  freeQuota: number;
  overagePrice: number;
  billingCycle: 'monthly' | 'subscription';
  currency: string;
}

export interface UsageRecord {
  tenantId: string;
  tenantName: string;
  partnerId: number;
  featureKey: 'ocr' | 'table';
  periodStart: Date;
  periodEnd: Date;
  totalUsed: number;
  freeQuota: number;
  billableQty: number;
  unitPrice: number;
  totalAmount: number;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: {
      name: string;
      debug: string;
      message: string;
      arguments: string[];
    };
  };
}

// JSON-RPC call helper for Odoo 19
async function jsonRpc19(
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

  const data: JsonRpcResponse = await response.json();

  if (data.error) {
    const error = data.error.data || data.error;
    console.error('[Odoo19 RPC Error]', error);
    throw new Error(
      typeof error === 'object' && 'message' in error
        ? (error as { message: string }).message
        : 'Odoo 19 RPC error'
    );
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

export class Odoo19Client {
  private config: Odoo19Config;
  private sessionId: string | null = null;
  private uid: number | null = null;
  private authenticated = false;

  constructor(config?: Partial<Odoo19Config>) {
    this.config = {
      baseUrl: config?.baseUrl || process.env.ODOO19_URL || 'http://13.159.193.191:8069',
      db: config?.db || process.env.ODOO19_DB || 'ERP',
      username: config?.username || process.env.ODOO19_USERNAME || 'admin',
      password: config?.password || process.env.ODOO19_PASSWORD || '',
    };
  }

  /**
   * Authenticate with Odoo 19
   */
  async authenticate(): Promise<void> {
    if (this.authenticated && this.sessionId) {
      return;
    }

    try {
      const { result, sessionId: cookieSessionId } = await jsonRpc19(
        this.config.baseUrl,
        '/web/session/authenticate',
        {
          db: this.config.db,
          login: this.config.username,
          password: this.config.password,
        }
      );

      const data = result as Record<string, unknown>;

      if (!data.uid || data.uid === false) {
        throw new Error('Invalid Odoo 19 credentials');
      }

      this.sessionId = cookieSessionId || (data.session_id as string) || '';
      this.uid = data.uid as number;
      this.authenticated = true;

      console.log('[Odoo19] Authenticated successfully, uid:', this.uid);
    } catch (error) {
      console.error('[Odoo19] Authentication failed:', error);
      throw new Error('Odoo 19 authentication failed');
    }
  }

  /**
   * Ensure authenticated before making calls
   */
  async ensureAuth(): Promise<void> {
    if (!this.authenticated) {
      await this.authenticate();
    }
  }

  /**
   * Call Odoo 19 method
   */
  async callKw<T = unknown>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {}
  ): Promise<T> {
    await this.ensureAuth();

    if (!this.sessionId) {
      throw new Error('No Odoo 19 session available');
    }

    try {
      const { result } = await jsonRpc19(
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
      console.error(`[Odoo19] Error calling ${model}.${method}:`, error);
      throw error;
    }
  }

  /**
   * Search records
   */
  async search(model: string, domain: unknown[] = [], options: { limit?: number; offset?: number; order?: string } = {}): Promise<number[]> {
    return this.callKw<number[]>(model, 'search', [domain], {
      limit: options.limit || 100,
      offset: options.offset || 0,
      order: options.order,
    });
  }

  /**
   * Search and read records
   */
  async searchRead<T = unknown>(
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    options: { limit?: number; offset?: number; order?: string } = {}
  ): Promise<T[]> {
    return this.callKw<T[]>(model, 'search_read', [domain], {
      fields,
      limit: options.limit || 100,
      offset: options.offset || 0,
      order: options.order,
    });
  }

  /**
   * Create a record
   */
  async create(model: string, values: Record<string, unknown>): Promise<number> {
    return this.callKw<number>(model, 'create', [values]);
  }

  /**
   * Write to records
   */
  async write(model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
    return this.callKw<boolean>(model, 'write', [ids, values]);
  }

  // ============================================
  // Subscription Management Methods
  // ============================================

  /**
   * Create or get a customer partner
   */
  async createOrGetPartner(tenantData: {
    name: string;
    email?: string;
    phone?: string;
    vat?: string;
  }): Promise<number> {
    await this.ensureAuth();

    // Try to find existing partner by name
    const partnerIds = await this.search('res.partner', [
      ['name', '=', tenantData.name],
      ['is_company', '=', true],
    ]);

    if (partnerIds.length > 0) {
      return partnerIds[0];
    }

    // Create new partner
    return this.create('res.partner', {
      name: tenantData.name,
      email: tenantData.email,
      phone: tenantData.phone,
      vat: tenantData.vat,
      is_company: true,
      customer_rank: 1,
    });
  }

  /**
   * Get subscription products from Odoo 19
   */
  async getSubscriptionProducts(): Promise<
    Array<{
      id: number;
      name: string;
      list_price: number;
      description?: string;
    }>
  > {
    await this.ensureAuth();

    return this.searchRead(
      'product.template',
      [
        ['name', 'ilike', 'BizNexus'],
        ['type', '=', 'service'],
      ],
      ['id', 'name', 'list_price', 'description']
    );
  }

  /**
   * Create a subscription (sale order)
   */
  async createSubscription(params: {
    partnerId: number;
    productId: number;
    startDate: Date;
    quantity?: number;
  }): Promise<number> {
    await this.ensureAuth();

    // Create sale order
    const orderId = await this.create('sale.order', {
      partner_id: params.partnerId,
      date_order: params.startDate.toISOString().split('T')[0],
      state: 'draft',
      order_line: [
        [
          0,
          0,
          {
            product_id: params.productId,
            product_uom_qty: params.quantity || 1,
          },
        ],
      ],
    });

    // Confirm the order
    await this.callKw('sale.order', 'action_confirm', [[orderId]]);

    return orderId;
  }

  /**
   * Get subscriptions for a partner
   */
  async getSubscriptions(partnerId: number): Promise<
    Array<{
      id: number;
      name: string;
      date_order: string;
      amount_total: number;
      state: string;
      invoice_status: string;
    }>
  > {
    await this.ensureAuth();

    return this.searchRead(
      'sale.order',
      [
        ['partner_id', '=', partnerId],
        ['state', '!=', 'cancel'],
      ],
      ['name', 'date_order', 'amount_total', 'state', 'invoice_status'],
      { order: 'date_order desc' }
    );
  }

  /**
   * Create invoice for an order
   */
  async createInvoice(orderId: number): Promise<number | null> {
    await this.ensureAuth();

    try {
      // Odoo 19 uses _create_invoices method
      const result = await this.callKw<number[] | number>(
        'sale.order',
        '_create_invoices',
        [[orderId]]
      );

      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      console.error('[Odoo19] Error creating invoice:', error);
      return null;
    }
  }

  /**
   * Get invoice details
   */
  async getInvoice(invoiceId: number): Promise<{
    id: number;
    name: string;
    partner_id: [number, string];
    invoice_date: string;
    invoice_date_due: string;
    amount_total: number;
    amount_residual: number;
    state: string;
    payment_state: string;
  } | null> {
    await this.ensureAuth();

    const invoices = await this.searchRead<{
      id: number;
      name: string;
      partner_id: [number, string];
      invoice_date: string;
      invoice_date_due: string;
      amount_total: number;
      amount_residual: number;
      state: string;
      payment_state: string;
    }>(
      'account.move',
      [['id', '=', invoiceId]],
      [
        'name',
        'partner_id',
        'invoice_date',
        'invoice_date_due',
        'amount_total',
        'amount_residual',
        'state',
        'payment_state',
      ]
    );

    return invoices[0] || null;
  }

  /**
   * Get invoices for a partner
   */
  async getInvoices(partnerId: number): Promise<
    Array<{
      id: number;
      name: string;
      invoice_date: string;
      invoice_date_due: string;
      amount_total: number;
      amount_residual: number;
      state: string;
      payment_state: string;
    }>
  > {
    await this.ensureAuth();

    return this.searchRead(
      'account.move',
      [
        ['partner_id', '=', partnerId],
        ['move_type', '=', 'out_invoice'],
      ],
      [
        'name',
        'invoice_date',
        'invoice_date_due',
        'amount_total',
        'amount_residual',
        'state',
        'payment_state',
      ],
      { order: 'invoice_date desc' }
    );
  }

  /**
   * Post an invoice (confirm)
   */
  async postInvoice(invoiceId: number): Promise<void> {
    await this.ensureAuth();
    await this.callKw('account.move', 'action_post', [[invoiceId]]);
  }

  /**
   * Register a payment for an invoice
   */
  async registerPayment(params: {
    invoiceId: number;
    amount: number;
    paymentDate: Date;
    journalId: number;
    paymentMethodLineId?: number;
  }): Promise<number> {
    await this.ensureAuth();

    // Create payment
    const paymentId = await this.create('account.payment', {
      payment_type: 'inbound',
      partner_type: 'customer',
      amount: params.amount,
      date: params.paymentDate.toISOString().split('T')[0],
      journal_id: params.journalId,
      payment_method_line_id: params.paymentMethodLineId,
    });

    // Post the payment
    await this.callKw('account.payment', 'action_post', [[paymentId]]);

    return paymentId;
  }

  /**
   * Cancel a subscription (order)
   */
  async cancelSubscription(orderId: number): Promise<void> {
    await this.ensureAuth();
    await this.callKw('sale.order', 'action_cancel', [[orderId]]);
  }

  /**
   * Get available journals (for payment)
   */
  async getJournals(type: 'bank' | 'cash' = 'bank'): Promise<
    Array<{
      id: number;
      name: string;
      code: string;
    }>
  > {
    await this.ensureAuth();

    return this.searchRead(
      'account.journal',
      [['type', '=', type]],
      ['name', 'code']
    );
  }

  // ============================================
  // Metered Billing Methods (OCR / Table Engine)
  // ============================================

  /**
   * Get metered billing rules from Odoo 19
   * Fetches products with default_code METERED-OCR or METERED-TABLE
   * Free quota is stored in description_sale as "免费额度 XX 次"
   */
  async getBillingRules(): Promise<BillingRule[]> {
    await this.ensureAuth();

    // Search for metered billing products
    const products = await this.searchRead<{
      id: number;
      default_code: string;
      name: string;
      list_price: number;
      description_sale?: string;
    }>(
      'product.product',
      [
        ['default_code', 'in', ['METERED-OCR', 'METERED-TABLE']],
        ['active', '=', true],
      ],
      ['default_code', 'name', 'list_price', 'description_sale']
    );

    // Default free quotas
    const DEFAULT_FREE_QUOTA: Record<string, number> = {
      'METERED-OCR': 30,
      'METERED-TABLE': 5,
    };

    // If no products found, return defaults
    if (products.length === 0) {
      console.log('[Odoo19] No metered billing products found, using defaults');
      return [
        {
          productId: 0,
          productCode: 'METERED-OCR',
          name: 'OCR 文档识别',
          freeQuota: 30,
          overagePrice: 20,
          billingCycle: 'monthly',
          currency: 'JPY',
        },
        {
          productId: 0,
          productCode: 'METERED-TABLE',
          name: 'Table Engine 表格处理',
          freeQuota: 5,
          overagePrice: 50,
          billingCycle: 'monthly',
          currency: 'JPY',
        },
      ];
    }

    return products.map(p => {
      // Try to parse free quota from description (e.g., "免费额度 30 次")
      let freeQuota = DEFAULT_FREE_QUOTA[p.default_code] || 0;
      if (p.description_sale) {
        const match = p.description_sale.match(/免费额度\s*(\d+)\s*次/);
        if (match) {
          freeQuota = parseInt(match[1], 10);
        }
      }

      return {
        productId: p.id,
        productCode: p.default_code,
        name: p.name,
        freeQuota,
        overagePrice: p.list_price,
        billingCycle: 'monthly' as const,
        currency: 'JPY',
      };
    });
  }

  /**
   * Record usage to Odoo 19 (creates a draft sale order line)
   */
  async recordUsageToOdoo(record: UsageRecord): Promise<number | null> {
    await this.ensureAuth();

    if (record.billableQty <= 0) {
      console.log('[Odoo19] No billable usage, skipping');
      return null;
    }

    try {
      // Find the metered product
      const productCode = record.featureKey === 'ocr' ? 'METERED-OCR' : 'METERED-TABLE';
      const products = await this.searchRead<{ id: number }>(
        'product.product',
        [['default_code', '=', productCode]],
        ['id']
      );

      if (products.length === 0) {
        console.error(`[Odoo19] Product ${productCode} not found`);
        return null;
      }

      const productId = products[0].id;

      // Create or find draft sale order for this partner/period
      const periodKey = `${record.periodStart.toISOString().slice(0, 7)}`; // YYYY-MM
      const orderRef = `USAGE-${record.tenantId}-${periodKey}`;

      let orderId: number;
      const existingOrders = await this.searchRead<{ id: number }>(
        'sale.order',
        [
          ['partner_id', '=', record.partnerId],
          ['client_order_ref', '=', orderRef],
          ['state', '=', 'draft'],
        ],
        ['id']
      );

      if (existingOrders.length > 0) {
        orderId = existingOrders[0].id;

        // Update existing order line or add new one
        const existingLines = await this.searchRead<{ id: number; product_id: [number, string] }>(
          'sale.order.line',
          [
            ['order_id', '=', orderId],
            ['product_id', '=', productId],
          ],
          ['id', 'product_id']
        );

        if (existingLines.length > 0) {
          // Update quantity
          await this.write('sale.order.line', [existingLines[0].id], {
            product_uom_qty: record.billableQty,
            price_unit: record.unitPrice,
          });
        } else {
          // Add new line
          await this.create('sale.order.line', {
            order_id: orderId,
            product_id: productId,
            product_uom_qty: record.billableQty,
            price_unit: record.unitPrice,
            name: `${record.featureKey.toUpperCase()} 用量 (${record.periodStart.toISOString().slice(0, 10)} ~ ${record.periodEnd.toISOString().slice(0, 10)})`,
          });
        }
      } else {
        // Create new order
        orderId = await this.create('sale.order', {
          partner_id: record.partnerId,
          client_order_ref: orderRef,
          date_order: new Date().toISOString().split('T')[0],
          state: 'draft',
          note: `Usage billing for ${record.tenantName} - ${periodKey}`,
          order_line: [
            [0, 0, {
              product_id: productId,
              product_uom_qty: record.billableQty,
              price_unit: record.unitPrice,
              name: `${record.featureKey.toUpperCase()} 用量 (${record.periodStart.toISOString().slice(0, 10)} ~ ${record.periodEnd.toISOString().slice(0, 10)})`,
            }],
          ],
        });
      }

      console.log(`[Odoo19] Usage recorded to order ${orderId}`);
      return orderId;

    } catch (error) {
      console.error('[Odoo19] Error recording usage:', error);
      return null;
    }
  }

  /**
   * Create and confirm invoice for usage
   */
  async createUsageInvoice(
    partnerId: number,
    usageRecords: UsageRecord[]
  ): Promise<number | null> {
    await this.ensureAuth();

    const totalBillable = usageRecords.reduce((sum, r) => sum + r.billableQty, 0);
    if (totalBillable <= 0) {
      console.log('[Odoo19] No billable usage, skipping invoice');
      return null;
    }

    try {
      // Find draft orders for this partner
      const periodKey = usageRecords[0]?.periodStart.toISOString().slice(0, 7);
      const orders = await this.searchRead<{ id: number; state: string }>(
        'sale.order',
        [
          ['partner_id', '=', partnerId],
          ['client_order_ref', 'ilike', `USAGE-%-${periodKey}`],
          ['state', '=', 'draft'],
        ],
        ['id', 'state']
      );

      if (orders.length === 0) {
        console.log('[Odoo19] No draft usage orders found');
        return null;
      }

      // Confirm all orders
      for (const order of orders) {
        await this.callKw('sale.order', 'action_confirm', [[order.id]]);
      }

      // Create invoices
      const orderIds = orders.map(o => o.id);
      const invoiceIds = await this.callKw<number[]>(
        'sale.order',
        '_create_invoices',
        [orderIds]
      );

      if (invoiceIds && invoiceIds.length > 0) {
        // Post the invoice
        await this.callKw('account.move', 'action_post', [invoiceIds]);
        console.log(`[Odoo19] Usage invoice created and posted: ${invoiceIds[0]}`);
        return invoiceIds[0];
      }

      return null;
    } catch (error) {
      console.error('[Odoo19] Error creating usage invoice:', error);
      return null;
    }
  }

  // ============================================
  // OCR Billing Methods (vendor.ops.tenant)
  // ============================================

  /**
   * Get OCR quota for a tenant from Odoo 19
   * Returns current usage, remaining quota, and whether OCR is allowed
   */
  async getOcrQuota(tenantCode: string): Promise<{
    allowed: boolean;
    tenantId: number | null;
    imageCount: number;
    freeRemaining: number;
    billableCount: number;
    totalCost: number;
    yearMonth: string;
    reason?: string;
  }> {
    await this.ensureAuth();

    try {
      const tenants = await this.searchRead<{
        id: number;
        ocr_image_count: number;
        ocr_free_remaining: number;
        ocr_billable_count: number;
        ocr_total_cost: number;
        ocr_year_month: string;
      }>(
        'vendor.ops.tenant',
        [['code', '=', tenantCode]],
        ['ocr_image_count', 'ocr_free_remaining', 'ocr_billable_count', 'ocr_total_cost', 'ocr_year_month'],
        { limit: 1 }
      );

      if (tenants.length === 0) {
        console.log(`[Odoo19] Tenant ${tenantCode} not found`);
        return {
          allowed: false,
          tenantId: null,
          imageCount: 0,
          freeRemaining: 0,
          billableCount: 0,
          totalCost: 0,
          yearMonth: '',
          reason: 'TENANT_NOT_FOUND',
        };
      }

      const tenant = tenants[0];
      // Allow if free quota remaining, or if already billable (has payment method assumed)
      const allowed = tenant.ocr_free_remaining > 0 || tenant.ocr_billable_count > 0;

      return {
        allowed,
        tenantId: tenant.id,
        imageCount: tenant.ocr_image_count,
        freeRemaining: tenant.ocr_free_remaining,
        billableCount: tenant.ocr_billable_count,
        totalCost: tenant.ocr_total_cost,
        yearMonth: tenant.ocr_year_month,
        reason: allowed ? undefined : 'QUOTA_EXCEEDED',
      };
    } catch (error) {
      console.error('[Odoo19] Error getting OCR quota:', error);
      // Allow on error to not block users
      return {
        allowed: true,
        tenantId: null,
        imageCount: 0,
        freeRemaining: 30,
        billableCount: 0,
        totalCost: 0,
        yearMonth: '',
        reason: 'ERROR',
      };
    }
  }

  /**
   * Record OCR usage to Odoo 19 vendor.ops.tenant
   * Increments image count and updates billing fields
   */
  async recordOcrUsage(tenantCode: string, count: number = 1): Promise<{
    success: boolean;
    newImageCount: number;
    newBillableCount: number;
    newTotalCost: number;
    error?: string;
  }> {
    await this.ensureAuth();

    const FREE_QUOTA = 30;
    const PRICE_PER_IMAGE = 20; // JPY

    try {
      // Get current tenant data
      const tenants = await this.searchRead<{
        id: number;
        ocr_image_count: number;
        ocr_billable_count: number;
        ocr_total_cost: number;
        ocr_year_month: string;
      }>(
        'vendor.ops.tenant',
        [['code', '=', tenantCode]],
        ['ocr_image_count', 'ocr_billable_count', 'ocr_total_cost', 'ocr_year_month'],
        { limit: 1 }
      );

      if (tenants.length === 0) {
        return {
          success: false,
          newImageCount: 0,
          newBillableCount: 0,
          newTotalCost: 0,
          error: 'Tenant not found',
        };
      }

      const tenant = tenants[0];
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

      // Check if month changed - reset counts
      let newImageCount = tenant.ocr_image_count;
      let newBillableCount = tenant.ocr_billable_count;
      let newTotalCost = tenant.ocr_total_cost;

      if (tenant.ocr_year_month !== currentMonth) {
        // New month - reset counters
        newImageCount = count;
        newBillableCount = Math.max(0, count - FREE_QUOTA);
        newTotalCost = newBillableCount * PRICE_PER_IMAGE;
      } else {
        // Same month - increment
        newImageCount = tenant.ocr_image_count + count;
        newBillableCount = Math.max(0, newImageCount - FREE_QUOTA);
        newTotalCost = newBillableCount * PRICE_PER_IMAGE;
      }

      // Update tenant
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      await this.write('vendor.ops.tenant', [tenant.id], {
        ocr_image_count: newImageCount,
        ocr_billable_count: newBillableCount,
        ocr_total_cost: newTotalCost,
        ocr_year_month: currentMonth,
        ocr_last_sync: now,
      });

      console.log(`[Odoo19] Recorded OCR usage for ${tenantCode}: ${newImageCount} images, ${newBillableCount} billable, ¥${newTotalCost}`);

      return {
        success: true,
        newImageCount,
        newBillableCount,
        newTotalCost,
      };
    } catch (error) {
      console.error('[Odoo19] Error recording OCR usage:', error);
      return {
        success: false,
        newImageCount: 0,
        newBillableCount: 0,
        newTotalCost: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
let odoo19Instance: Odoo19Client | null = null;

/**
 * Get Odoo 19 client singleton
 */
export function getOdoo19Client(): Odoo19Client {
  if (!odoo19Instance) {
    odoo19Instance = new Odoo19Client();
  }
  return odoo19Instance;
}

/**
 * Create a new Odoo 19 client with custom config
 */
export function createOdoo19Client(config: Partial<Odoo19Config>): Odoo19Client {
  return new Odoo19Client(config);
}

// Export singleton for convenience
export const odoo19 = getOdoo19Client();
