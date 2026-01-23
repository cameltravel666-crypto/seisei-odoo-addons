import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Purchase API - Refactored for 4-queue execution architecture:
 * - Queue 1: 待确认 (To Confirm) - PO state in ('draft', 'sent')
 * - Queue 2: 待入库 (To Receive) - PO confirmed, not fully received
 * - Queue 3: 待付款 (To Pay) - Has unpaid vendor bills
 * - Queue 4: 已完成 (Completed) - Fully received and paid
 */

interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  date_order: string;
  amount_total: number;
  state: string;
  picking_ids: number[];
  receipt_status: string;
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

interface VendorBill {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_residual: number;
  amount_total: number;
  payment_state: string;
  invoice_origin: string | false;
  // OCR fields
  ocr_status?: 'pending' | 'processing' | 'done' | 'failed';
  ocr_confidence?: number;
  ocr_pages?: number;
  message_main_attachment_id?: [number, string] | false;
}

interface Capabilities {
  hasPickingAccess: boolean;
  hasBillAccess: boolean;
}

interface CreatePurchaseOrderRequest {
  partnerId: number;
  dateOrder?: string;
  lines: Array<{
    productId: number;
    quantity: number;
    priceUnit: number;
  }>;
}

// Queue types for tab filtering
type QueueType = 'to_confirm' | 'to_receive' | 'to_pay' | 'completed' | 'all';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('PURCHASE', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Purchase module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const queue = (searchParams.get('queue') || 'all') as QueueType;
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

    // Fetch all POs in date range for queue assignment
    const allPOs = await odoo.searchRead<PurchaseOrder>('purchase.order', dateDomain, {
      fields: ['name', 'partner_id', 'date_order', 'amount_total', 'state', 'picking_ids', 'receipt_status', 'invoice_status'],
      order: sortBy === 'amount' ? 'amount_total desc' : 'date_order desc',
    });

    // Get picking status map if we have access
    let pickingStatusMap: Map<string, { received: boolean; pendingPickings: StockPicking[] }> = new Map();
    if (capabilities.hasPickingAccess) {
      const poNames = allPOs.map(po => po.name);
      pickingStatusMap = await getPickingStatusMap(odoo, poNames);
    }

    // Get vendor bills if we have access
    let billsMap: Map<number, VendorBill[]> = new Map(); // partner_id -> bills
    let allUnpaidBills: VendorBill[] = [];
    if (capabilities.hasBillAccess) {
      const billResult = await getVendorBillsData(odoo, allPOs, today);
      billsMap = billResult.billsMap;
      allUnpaidBills = billResult.allUnpaidBills;
    }

    // Assign each PO to a queue
    const queueAssignments = assignPOsToQueues(allPOs, pickingStatusMap, billsMap, capabilities, today);

    // Calculate KPIs
    const kpi = calculateKPIs(queueAssignments, allUnpaidBills, today, capabilities);

    // Special handling for to_pay queue: show vendor bills instead of POs
    if (queue === 'to_pay' && capabilities.hasBillAccess) {
      // Sort bills by due date (overdue first) or amount
      const sortedBills = [...allUnpaidBills].sort((a, b) => {
        if (sortBy === 'amount') {
          return b.amount_residual - a.amount_residual;
        } else {
          // Sort by due date, nulls last
          const dateA = a.invoice_date_due || '9999-12-31';
          const dateB = b.invoice_date_due || '9999-12-31';
          return dateA.localeCompare(dateB);
        }
      });

      const totalCount = sortedBills.length;
      const paginatedBills = sortedBills.slice(offset, offset + limit);

      return NextResponse.json({
        success: true,
        data: {
          capabilities,
          kpi,
          itemType: 'bill', // Indicate these are bills, not POs
          items: paginatedBills.map((bill) => {
            const dueDate = bill.invoice_date_due || null;
            const isOverdue = dueDate && dueDate < today;
            const overdueDays = isOverdue && dueDate
              ? Math.floor((new Date(today).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
              : 0;
            return {
              id: bill.id,
              name: bill.name,
              partnerId: Array.isArray(bill.partner_id) ? bill.partner_id[0] : null,
              partnerName: Array.isArray(bill.partner_id) ? bill.partner_id[1] : '-',
              invoiceDate: bill.invoice_date || null,
              invoiceDateDue: bill.invoice_date_due || null,
              amountResidual: bill.amount_residual,
              amountTotal: bill.amount_total,
              isOverdue,
              overdueDays,
              invoiceOrigin: bill.invoice_origin || null,
              // OCR fields
              ocrStatus: bill.ocr_status || 'pending',
              ocrConfidence: bill.ocr_confidence || 0,
              ocrPages: bill.ocr_pages || 0,
              hasAttachment: !!bill.message_main_attachment_id,
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

    // Filter by selected queue (for PO-based queues)
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
        itemType: 'po', // Indicate these are POs
        items: paginatedItems.map((item) => ({
          id: item.po.id,
          name: item.po.name,
          partnerId: Array.isArray(item.po.partner_id) ? item.po.partner_id[0] : null,
          partnerName: Array.isArray(item.po.partner_id) ? item.po.partner_id[1] : '-',
          dateOrder: item.po.date_order,
          amountTotal: item.po.amount_total,
          state: item.po.state,
          queue: item.queue,
          receiptStatus: item.receiptStatus,
          isOverdueDelivery: item.isOverdueDelivery,
          hasUnpaidBills: item.hasUnpaidBills,
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
    console.error('[Purchase Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch purchases' } },
      { status: 500 }
    );
  }
}

/**
 * Detect capabilities for stock.picking and account.move access
 */
async function detectCapabilities(odoo: Awaited<ReturnType<typeof getOdooClientForSession>>): Promise<Capabilities> {
  let hasPickingAccess = false;
  let hasBillAccess = false;

  try {
    await odoo.searchCount('stock.picking', [['id', '>', 0]]);
    hasPickingAccess = true;
  } catch {
    console.log('[Purchase] No stock.picking access');
  }

  try {
    await odoo.searchCount('account.move', [['move_type', '=', 'in_invoice']]);
    hasBillAccess = true;
  } catch {
    console.log('[Purchase] No account.move access');
  }

  return { hasPickingAccess, hasBillAccess };
}

/**
 * Get picking status for each PO by origin
 */
async function getPickingStatusMap(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  poNames: string[]
): Promise<Map<string, { received: boolean; pendingPickings: StockPicking[] }>> {
  const statusMap = new Map<string, { received: boolean; pendingPickings: StockPicking[] }>();

  if (poNames.length === 0) return statusMap;

  try {
    // Get incoming pickings for these POs
    const pickings = await odoo.searchRead<StockPicking>('stock.picking', [
      ['origin', 'in', poNames],
      ['picking_type_id.code', '=', 'incoming'],
    ], {
      fields: ['name', 'origin', 'state', 'picking_type_id', 'scheduled_date', 'date_deadline'],
    });

    // Group by origin (PO name)
    for (const picking of pickings) {
      const origin = picking.origin as string;
      if (!origin) continue;

      // PO name might be part of origin (e.g., "PO00001" or "PO00001, PO00002")
      for (const poName of poNames) {
        if (origin.includes(poName)) {
          if (!statusMap.has(poName)) {
            statusMap.set(poName, { received: true, pendingPickings: [] });
          }
          const entry = statusMap.get(poName)!;

          if (!['done', 'cancel'].includes(picking.state)) {
            entry.received = false;
            entry.pendingPickings.push(picking);
          }
        }
      }
    }
  } catch (error) {
    console.log('[Purchase] Error fetching pickings:', error);
  }

  return statusMap;
}

/**
 * Get vendor bills data for payment status
 */
async function getVendorBillsData(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  allPOs: PurchaseOrder[],
  today: string
): Promise<{ billsMap: Map<number, VendorBill[]>; allUnpaidBills: VendorBill[] }> {
  const billsMap = new Map<number, VendorBill[]>();
  let allUnpaidBills: VendorBill[] = [];

  try {
    // Get all unpaid vendor bills
    allUnpaidBills = await odoo.searchRead<VendorBill>('account.move', [
      ['move_type', '=', 'in_invoice'],
      ['state', '=', 'posted'],
      ['payment_state', '!=', 'paid'],
    ], {
      fields: [
        'name', 'partner_id', 'invoice_date', 'invoice_date_due',
        'amount_residual', 'amount_total', 'payment_state', 'invoice_origin',
        // OCR fields
        'ocr_status', 'ocr_confidence', 'ocr_pages', 'message_main_attachment_id'
      ],
    });

    // Group by partner_id for matching
    for (const bill of allUnpaidBills) {
      if (Array.isArray(bill.partner_id)) {
        const partnerId = bill.partner_id[0];
        if (!billsMap.has(partnerId)) {
          billsMap.set(partnerId, []);
        }
        billsMap.get(partnerId)!.push(bill);
      }
    }
  } catch (error) {
    console.log('[Purchase] Error fetching vendor bills:', error);
  }

  return { billsMap, allUnpaidBills };
}

interface QueuedPO {
  po: PurchaseOrder;
  queue: QueueType;
  receiptStatus: 'pending' | 'received' | 'unknown';
  isOverdueDelivery: boolean;
  hasUnpaidBills: boolean;
  unpaidAmount: number;
}

interface QueueAssignments {
  to_confirm: QueuedPO[];
  to_receive: QueuedPO[];
  to_pay: QueuedPO[];
  completed: QueuedPO[];
  all: QueuedPO[];
}

/**
 * Assign each PO to appropriate queue based on status
 */
function assignPOsToQueues(
  allPOs: PurchaseOrder[],
  pickingStatusMap: Map<string, { received: boolean; pendingPickings: StockPicking[] }>,
  billsMap: Map<number, VendorBill[]>,
  capabilities: Capabilities,
  today: string
): QueueAssignments {
  const assignments: QueueAssignments = {
    to_confirm: [],
    to_receive: [],
    to_pay: [],
    completed: [],
    all: [],
  };

  for (const po of allPOs) {
    const partnerId = Array.isArray(po.partner_id) ? po.partner_id[0] : null;

    // Determine receipt status
    let receiptStatus: 'pending' | 'received' | 'unknown' = 'unknown';
    let isOverdueDelivery = false;

    if (capabilities.hasPickingAccess) {
      const pickingInfo = pickingStatusMap.get(po.name);
      if (pickingInfo) {
        receiptStatus = pickingInfo.received ? 'received' : 'pending';
        // Check for overdue delivery
        if (!pickingInfo.received) {
          for (const picking of pickingInfo.pendingPickings) {
            const deadline = picking.date_deadline || picking.scheduled_date;
            if (deadline && deadline < today) {
              isOverdueDelivery = true;
              break;
            }
          }
        }
      } else if (po.state === 'purchase') {
        // No picking found but PO is confirmed - treat as pending receipt
        receiptStatus = 'pending';
      }
    } else {
      // Degrade: use receipt_status field or PO state
      if (po.receipt_status === 'full') {
        receiptStatus = 'received';
      } else if (po.state === 'purchase') {
        receiptStatus = 'pending';
      }
    }

    // Determine payment status
    let hasUnpaidBills = false;
    let unpaidAmount = 0;

    if (capabilities.hasBillAccess && partnerId) {
      const partnerBills = billsMap.get(partnerId) || [];
      // Try to match by invoice_origin first
      for (const bill of partnerBills) {
        if (bill.invoice_origin && bill.invoice_origin.includes(po.name)) {
          hasUnpaidBills = true;
          unpaidAmount += bill.amount_residual;
        }
      }
      // If no direct match, check if PO is done but partner has unpaid bills
      if (!hasUnpaidBills && (po.state === 'done' || receiptStatus === 'received')) {
        // Show warning chip but don't count towards unpaid for this specific PO
        for (const bill of partnerBills) {
          if (bill.amount_residual > 0) {
            hasUnpaidBills = true;
            break;
          }
        }
      }
    }

    // Assign to queue
    let queue: QueueType;

    if (['draft', 'sent'].includes(po.state)) {
      queue = 'to_confirm';
    } else if (po.state === 'purchase' && receiptStatus !== 'received') {
      queue = 'to_receive';
    } else if (po.state === 'cancel') {
      // Skip cancelled orders
      continue;
    } else {
      // state is 'purchase' with received, or 'done'
      queue = 'completed';
    }

    const queuedPO: QueuedPO = {
      po,
      queue,
      receiptStatus,
      isOverdueDelivery,
      hasUnpaidBills,
      unpaidAmount,
    };

    assignments[queue].push(queuedPO);
    assignments.all.push(queuedPO);
  }

  return assignments;
}

interface KPIs {
  toConfirmAmount: number;
  toConfirmCount: number;
  toReceiveAmount: number;
  toReceiveCount: number;
  unpaidAmount: number;
  unpaidCount: number;
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
  allUnpaidBills: VendorBill[],
  today: string,
  capabilities: Capabilities
): KPIs {
  // To Confirm KPI
  const toConfirmAmount = queueAssignments.to_confirm.reduce((sum, item) => sum + item.po.amount_total, 0);
  const toConfirmCount = queueAssignments.to_confirm.length;

  // To Receive KPI
  const toReceiveAmount = queueAssignments.to_receive.reduce((sum, item) => sum + item.po.amount_total, 0);
  const toReceiveCount = queueAssignments.to_receive.length;

  // Completed KPI
  const completedAmount = queueAssignments.completed.reduce((sum, item) => sum + item.po.amount_total, 0);
  const completedCount = queueAssignments.completed.length;

  // Payment KPIs (from vendor bills, not POs)
  let unpaidAmount = 0;
  let unpaidCount = 0;
  let overdueAmount = 0;
  let overdueCount = 0;

  if (capabilities.hasBillAccess) {
    for (const bill of allUnpaidBills) {
      unpaidAmount += bill.amount_residual;
      unpaidCount++;

      if (bill.invoice_date_due && bill.invoice_date_due < today) {
        overdueAmount += bill.amount_residual;
        overdueCount++;
      }
    }
  }

  return {
    toConfirmAmount,
    toConfirmCount,
    toReceiveAmount,
    toReceiveCount,
    unpaidAmount,
    unpaidCount,
    overdueAmount,
    overdueCount,
    completedAmount,
    completedCount,
  };
}

// Create purchase order (unchanged)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('PURCHASE', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Purchase module not accessible' } },
        { status: 403 }
      );
    }

    const body: CreatePurchaseOrderRequest = await request.json();

    if (!body.partnerId || !body.lines || body.lines.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Supplier and at least one product line required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    const orderId = await odoo.create('purchase.order', {
      partner_id: body.partnerId,
      date_order: body.dateOrder || new Date().toISOString().split('T')[0],
      order_line: body.lines.map((line) => [
        0,
        0,
        {
          product_id: line.productId,
          product_qty: line.quantity,
          price_unit: line.priceUnit,
        },
      ]),
    });

    const [order] = await odoo.searchRead<PurchaseOrder>('purchase.order', [['id', '=', orderId]], {
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
    console.error('[Purchase Create Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create purchase order' } },
      { status: 500 }
    );
  }
}
