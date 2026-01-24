import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Sales API - Refactored for 4-queue execution architecture:
 * - Queue 1: 待确认 (To Confirm) - SO state in ('draft', 'sent')
 * - Queue 2: 待发货 (To Deliver) - SO confirmed, not fully delivered
 * - Queue 3: 待收款 (To Invoice) - Has unpaid customer invoices
 * - Queue 4: 已完成 (Completed) - Fully delivered and paid
 */

interface SaleOrder {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  date_order: string;
  amount_total: number;
  state: string;
  picking_ids: number[];
  delivery_status: string;
  invoice_status: string;
}

interface StockPicking {
  id: number;
  name: string;
  origin: string | false;
  state: string;
  picking_type_id: [number, string] | false;
  scheduled_date: string | false;
  date_deadline: string | false;
}

interface CustomerInvoice {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_residual: number;
  amount_total: number;
  payment_state: string;
  invoice_origin: string | false;
}

interface Capabilities {
  hasDeliveryAccess: boolean;
  hasInvoiceAccess: boolean;
}

// Queue types for tab filtering
type QueueType = 'to_confirm' | 'to_deliver' | 'to_invoice' | 'completed' | 'all';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('SALES', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sales module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const queue = (searchParams.get('queue') || 'to_confirm') as QueueType;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const sortBy = searchParams.get('sort') || 'amount'; // 'amount' or 'date'

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);
    const today = new Date().toISOString().split('T')[0];

    // Capability detection
    const capabilities = await detectCapabilities(odoo);

    // Build base date domain
    const dateDomain: unknown[] = [];
    if (dateFrom) {
      dateDomain.push(['date_order', '>=', dateFrom]);
    }
    if (dateTo) {
      dateDomain.push(['date_order', '<=', `${dateTo} 23:59:59`]);
    }

    // Fetch all SOs in date range for queue assignment
    const allSOs = await odoo.searchRead<SaleOrder>('sale.order', dateDomain, {
      fields: ['name', 'partner_id', 'date_order', 'amount_total', 'state', 'picking_ids', 'delivery_status', 'invoice_status'],
      order: sortBy === 'amount' ? 'amount_total desc' : 'date_order desc',
    });

    // Get delivery status map if we have access
    let deliveryStatusMap: Map<string, { delivered: boolean; pendingPickings: StockPicking[] }> = new Map();
    if (capabilities.hasDeliveryAccess) {
      const soNames = allSOs.map(so => so.name);
      deliveryStatusMap = await getDeliveryStatusMap(odoo, soNames);
    }

    // Get customer invoices if we have access
    let invoicesMap: Map<number, CustomerInvoice[]> = new Map(); // partner_id -> invoices
    let allUnpaidInvoices: CustomerInvoice[] = [];
    if (capabilities.hasInvoiceAccess) {
      const invoiceResult = await getCustomerInvoicesData(odoo, allSOs, today);
      invoicesMap = invoiceResult.invoicesMap;
      allUnpaidInvoices = invoiceResult.allUnpaidInvoices;
    }

    // Assign each SO to a queue
    const queueAssignments = assignSOsToQueues(allSOs, deliveryStatusMap, invoicesMap, capabilities, today);

    // Calculate KPIs
    const kpi = calculateKPIs(queueAssignments, allUnpaidInvoices, today, capabilities);

    // Special handling for to_invoice queue: show customer invoices instead of SOs
    if (queue === 'to_invoice' && capabilities.hasInvoiceAccess) {
      // Sort invoices by due date (overdue first) or amount
      const sortedInvoices = [...allUnpaidInvoices].sort((a, b) => {
        if (sortBy === 'amount') {
          return b.amount_residual - a.amount_residual;
        } else {
          // Sort by due date, nulls last
          const dateA = a.invoice_date_due || '9999-12-31';
          const dateB = b.invoice_date_due || '9999-12-31';
          return dateA.localeCompare(dateB);
        }
      });

      const totalCount = sortedInvoices.length;
      const paginatedInvoices = sortedInvoices.slice(offset, offset + limit);

      return NextResponse.json({
        success: true,
        data: {
          capabilities,
          kpi,
          itemType: 'invoice', // Indicate these are invoices, not SOs
          items: paginatedInvoices.map((invoice) => {
            const dueDate = invoice.invoice_date_due || null;
            const isOverdue = dueDate && dueDate < today;
            const overdueDays = isOverdue && dueDate
              ? Math.floor((new Date(today).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
              : 0;
            return {
              id: invoice.id,
              name: invoice.name,
              partnerId: Array.isArray(invoice.partner_id) ? invoice.partner_id[0] : null,
              partnerName: Array.isArray(invoice.partner_id) ? invoice.partner_id[1] : '-',
              invoiceDate: invoice.invoice_date || null,
              invoiceDateDue: invoice.invoice_date_due || null,
              amountResidual: invoice.amount_residual,
              amountTotal: invoice.amount_total,
              isOverdue,
              overdueDays,
              invoiceOrigin: invoice.invoice_origin || null,
            };
          }),
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
          queue,
        },
      });
    }

    // Filter by selected queue (for SO-based queues)
    const filteredItems = queue === 'all'
      ? queueAssignments.all
      : queueAssignments[queue] || [];

    // Paginate
    const totalCount = filteredItems.length;
    const paginatedItems = filteredItems.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: {
        capabilities,
        kpi,
        itemType: 'so', // Indicate these are SOs
        items: paginatedItems.map((item) => ({
          id: item.so.id,
          name: item.so.name,
          partnerId: Array.isArray(item.so.partner_id) ? item.so.partner_id[0] : null,
          partnerName: Array.isArray(item.so.partner_id) ? item.so.partner_id[1] : '-',
          dateOrder: item.so.date_order,
          amountTotal: item.so.amount_total,
          state: item.so.state,
          queue: item.queue,
          deliveryStatus: item.deliveryStatus,
          invoiceStatus: item.invoiceStatus,
          isOverdueDelivery: item.isOverdueDelivery,
          hasUnpaidInvoices: item.hasUnpaidInvoices,
          unpaidAmount: item.unpaidAmount,
        })),
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        queue,
      },
    });
  } catch (error) {
    console.error('[Sales Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch sales data' } },
      { status: 500 }
    );
  }
}

/**
 * Detect capabilities for stock.picking and account.move access
 */
async function detectCapabilities(odoo: Awaited<ReturnType<typeof getOdooClientForSession>>): Promise<Capabilities> {
  let hasDeliveryAccess = false;
  let hasInvoiceAccess = false;

  try {
    await odoo.searchCount('stock.picking', [['id', '>', 0]]);
    hasDeliveryAccess = true;
  } catch {
    console.log('[Sales] No stock.picking access');
  }

  try {
    await odoo.searchCount('account.move', [['move_type', '=', 'out_invoice']]);
    hasInvoiceAccess = true;
  } catch {
    console.log('[Sales] No account.move access');
  }

  return { hasDeliveryAccess, hasInvoiceAccess };
}

/**
 * Get delivery status for each SO by origin
 */
async function getDeliveryStatusMap(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  soNames: string[]
): Promise<Map<string, { delivered: boolean; pendingPickings: StockPicking[] }>> {
  const statusMap = new Map<string, { delivered: boolean; pendingPickings: StockPicking[] }>();

  if (soNames.length === 0) return statusMap;

  try {
    // Get outgoing pickings for these SOs
    const pickings = await odoo.searchRead<StockPicking>('stock.picking', [
      ['origin', 'in', soNames],
      ['picking_type_id.code', '=', 'outgoing'],
    ], {
      fields: ['name', 'origin', 'state', 'picking_type_id', 'scheduled_date', 'date_deadline'],
    });

    // Group by origin (SO name)
    for (const picking of pickings) {
      const origin = picking.origin as string;
      if (!origin) continue;

      // SO name might be part of origin (e.g., "SO00001" or "SO00001, SO00002")
      for (const soName of soNames) {
        if (origin.includes(soName)) {
          if (!statusMap.has(soName)) {
            statusMap.set(soName, { delivered: true, pendingPickings: [] });
          }
          const entry = statusMap.get(soName)!;

          if (!['done', 'cancel'].includes(picking.state)) {
            entry.delivered = false;
            entry.pendingPickings.push(picking);
          }
        }
      }
    }
  } catch (error) {
    console.log('[Sales] Error fetching pickings:', error);
  }

  return statusMap;
}

/**
 * Get customer invoices data for payment status
 */
async function getCustomerInvoicesData(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  allSOs: SaleOrder[],
  today: string
): Promise<{ invoicesMap: Map<number, CustomerInvoice[]>; allUnpaidInvoices: CustomerInvoice[] }> {
  const invoicesMap = new Map<number, CustomerInvoice[]>();
  let allUnpaidInvoices: CustomerInvoice[] = [];

  try {
    // Get all unpaid customer invoices
    allUnpaidInvoices = await odoo.searchRead<CustomerInvoice>('account.move', [
      ['move_type', '=', 'out_invoice'],
      ['state', '=', 'posted'],
      ['payment_state', '!=', 'paid'],
    ], {
      fields: ['name', 'partner_id', 'invoice_date', 'invoice_date_due', 'amount_residual', 'amount_total', 'payment_state', 'invoice_origin'],
    });

    // Group by partner_id for matching
    for (const invoice of allUnpaidInvoices) {
      if (Array.isArray(invoice.partner_id)) {
        const partnerId = invoice.partner_id[0];
        if (!invoicesMap.has(partnerId)) {
          invoicesMap.set(partnerId, []);
        }
        invoicesMap.get(partnerId)!.push(invoice);
      }
    }
  } catch (error) {
    console.log('[Sales] Error fetching customer invoices:', error);
  }

  return { invoicesMap, allUnpaidInvoices };
}

interface QueuedSO {
  so: SaleOrder;
  queue: QueueType;
  deliveryStatus: 'pending' | 'delivered' | 'partial' | 'unknown';
  invoiceStatus: 'pending' | 'invoiced' | 'partial' | 'unknown';
  isOverdueDelivery: boolean;
  hasUnpaidInvoices: boolean;
  unpaidAmount: number;
}

interface QueueAssignments {
  to_confirm: QueuedSO[];
  to_deliver: QueuedSO[];
  to_invoice: QueuedSO[];
  completed: QueuedSO[];
  all: QueuedSO[];
}

/**
 * Assign each SO to appropriate queue based on status
 */
function assignSOsToQueues(
  allSOs: SaleOrder[],
  deliveryStatusMap: Map<string, { delivered: boolean; pendingPickings: StockPicking[] }>,
  invoicesMap: Map<number, CustomerInvoice[]>,
  capabilities: Capabilities,
  today: string
): QueueAssignments {
  const assignments: QueueAssignments = {
    to_confirm: [],
    to_deliver: [],
    to_invoice: [],
    completed: [],
    all: [],
  };

  for (const so of allSOs) {
    const partnerId = Array.isArray(so.partner_id) ? so.partner_id[0] : null;

    // Determine delivery status
    let deliveryStatus: 'pending' | 'delivered' | 'partial' | 'unknown' = 'unknown';
    let isOverdueDelivery = false;

    if (capabilities.hasDeliveryAccess) {
      const deliveryInfo = deliveryStatusMap.get(so.name);
      if (deliveryInfo) {
        deliveryStatus = deliveryInfo.delivered ? 'delivered' : 'pending';
        // Check for overdue delivery
        if (!deliveryInfo.delivered) {
          for (const picking of deliveryInfo.pendingPickings) {
            const deadline = picking.date_deadline || picking.scheduled_date;
            if (deadline && deadline < today) {
              isOverdueDelivery = true;
              break;
            }
          }
        }
      } else if (so.state === 'sale') {
        // No picking found but SO is confirmed
        // Check delivery_status field first (service orders have delivery_status = 'full')
        if (so.delivery_status === 'full') {
          deliveryStatus = 'delivered';
        } else if (so.delivery_status === 'partial') {
          deliveryStatus = 'partial';
        } else {
          deliveryStatus = 'pending';
        }
      }
    } else {
      // Degrade: use delivery_status field or SO state
      if (so.delivery_status === 'full') {
        deliveryStatus = 'delivered';
      } else if (so.delivery_status === 'partial') {
        deliveryStatus = 'partial';
      } else if (so.state === 'sale') {
        deliveryStatus = 'pending';
      }
    }

    // Determine invoice/payment status
    let invoiceStatus: 'pending' | 'invoiced' | 'partial' | 'unknown' = 'unknown';
    let hasUnpaidInvoices = false;
    let unpaidAmount = 0;

    if (capabilities.hasInvoiceAccess && partnerId) {
      const partnerInvoices = invoicesMap.get(partnerId) || [];
      // Try to match by invoice_origin first
      for (const invoice of partnerInvoices) {
        if (invoice.invoice_origin && invoice.invoice_origin.includes(so.name)) {
          hasUnpaidInvoices = true;
          unpaidAmount += invoice.amount_residual;
        }
      }
      // If no direct match, check if SO is done but partner has unpaid invoices
      if (!hasUnpaidInvoices && (so.state === 'done' || deliveryStatus === 'delivered')) {
        for (const invoice of partnerInvoices) {
          if (invoice.amount_residual > 0) {
            hasUnpaidInvoices = true;
            break;
          }
        }
      }
      invoiceStatus = hasUnpaidInvoices ? 'pending' : 'invoiced';
    } else {
      // Degrade: use invoice_status field
      if (so.invoice_status === 'invoiced') {
        invoiceStatus = 'invoiced';
      } else if (so.invoice_status === 'to invoice') {
        invoiceStatus = 'pending';
      }
    }

    // Assign to queue
    let queue: QueueType;

    if (['draft', 'sent'].includes(so.state)) {
      queue = 'to_confirm';
    } else if (so.state === 'sale' && deliveryStatus !== 'delivered') {
      queue = 'to_deliver';
    } else if (so.state === 'cancel') {
      // Skip cancelled orders
      continue;
    } else {
      // state is 'sale' with delivered, or 'done'
      queue = 'completed';
    }

    const queuedSO: QueuedSO = {
      so,
      queue,
      deliveryStatus,
      invoiceStatus,
      isOverdueDelivery,
      hasUnpaidInvoices,
      unpaidAmount,
    };

    assignments[queue].push(queuedSO);
    assignments.all.push(queuedSO);
  }

  return assignments;
}

interface KPIs {
  toConfirmAmount: number;
  toConfirmCount: number;
  toDeliverAmount: number;
  toDeliverCount: number;
  toInvoiceAmount: number;
  toInvoiceCount: number;
  overdueAmount: number;
  overdueCount: number;
  completedAmount: number;
  completedCount: number;
}

/**
 * Calculate KPIs matching tab filters
 */
function calculateKPIs(
  queueAssignments: QueueAssignments,
  allUnpaidInvoices: CustomerInvoice[],
  today: string,
  capabilities: Capabilities
): KPIs {
  // To Confirm KPI
  const toConfirmAmount = queueAssignments.to_confirm.reduce((sum, item) => sum + item.so.amount_total, 0);
  const toConfirmCount = queueAssignments.to_confirm.length;

  // To Deliver KPI
  const toDeliverAmount = queueAssignments.to_deliver.reduce((sum, item) => sum + item.so.amount_total, 0);
  const toDeliverCount = queueAssignments.to_deliver.length;

  // Completed KPI
  const completedAmount = queueAssignments.completed.reduce((sum, item) => sum + item.so.amount_total, 0);
  const completedCount = queueAssignments.completed.length;

  // Invoice/Payment KPIs (from customer invoices, not SOs)
  let toInvoiceAmount = 0;
  let toInvoiceCount = 0;
  let overdueAmount = 0;
  let overdueCount = 0;

  if (capabilities.hasInvoiceAccess) {
    for (const invoice of allUnpaidInvoices) {
      toInvoiceAmount += invoice.amount_residual;
      toInvoiceCount++;

      if (invoice.invoice_date_due && invoice.invoice_date_due < today) {
        overdueAmount += invoice.amount_residual;
        overdueCount++;
      }
    }
  }

  return {
    toConfirmAmount,
    toConfirmCount,
    toDeliverAmount,
    toDeliverCount,
    toInvoiceAmount,
    toInvoiceCount,
    overdueAmount,
    overdueCount,
    completedAmount,
    completedCount,
  };
}

interface CreateSalesOrderRequest {
  partnerId: number;
  dateOrder?: string;
  lines: Array<{
    productId: number;
    quantity: number;
    priceUnit: number;
  }>;
}

// Create sales order
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('SALES', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Sales module not accessible' } },
        { status: 403 }
      );
    }

    const body: CreateSalesOrderRequest = await request.json();

    if (!body.partnerId || !body.lines || body.lines.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Customer and at least one product line required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Build order data
    const orderData: Record<string, unknown> = {
      partner_id: body.partnerId,
      order_line: body.lines.map((line) => [
        0,
        0,
        {
          product_id: line.productId,
          product_uom_qty: line.quantity,
          price_unit: line.priceUnit,
        },
      ]),
    };

    // Only add date if provided (Odoo defaults to now if not provided)
    if (body.dateOrder) {
      orderData.date_order = body.dateOrder;
    }

    const orderId = await odoo.create('sale.order', orderData);

    const [order] = await odoo.searchRead<SaleOrder>('sale.order', [['id', '=', orderId]], {
      fields: ['name', 'partner_id', 'date_order', 'amount_total', 'state'],
    });

    return NextResponse.json({
      success: true,
      data: {
        id: order.id,
        name: order.name,
        partnerId: Array.isArray(order.partner_id) ? order.partner_id[0] : null,
        partnerName: Array.isArray(order.partner_id) ? order.partner_id[1] : '-',
        dateOrder: order.date_order,
        amountTotal: order.amount_total,
        state: order.state,
      },
    });
  } catch (error) {
    console.error('[Sales Create Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create sales order';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: errorMessage } },
      { status: 500 }
    );
  }
}
