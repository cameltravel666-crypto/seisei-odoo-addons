import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * POS Replenishment API - Generate purchase suggestions based on stock levels and consumption
 *
 * GET /api/pos/replenishment
 *
 * This endpoint:
 * 1. Gets all raw materials (storable products used in BOMs)
 * 2. Calculates average daily consumption from last 7 days
 * 3. Compares against min/max stock levels
 * 4. Generates replenishment suggestions
 * 5. Lists pending purchase orders
 */

interface StockQuant {
  product_id: [number, string];
  quantity: number;
  available_quantity: number;
}

interface Product {
  id: number;
  name: string;
  default_code: string | false;
  uom_id: [number, string] | false;
  type: string;
  standard_price: number;
  seller_ids: number[];
}

interface SupplierInfo {
  id: number;
  partner_id: [number, string];
  price: number;
  min_qty: number;
}

interface ReorderRule {
  product_id: [number, string];
  product_min_qty: number;
  product_max_qty: number;
}

interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  date_order: string;
  amount_total: number;
  state: string;
  order_line: number[];
}

interface ReplenishmentItem {
  id: number;
  name: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  avgDailyUsage: number;
  daysRemaining: number;
  suggestedQty: number;
  status: 'critical' | 'warning';
  supplier: string;
  unitPrice: number;
  lastOrderDate: string | null;
}

interface PendingOrder {
  id: string;
  odooId: number;
  supplier: string;
  items: number;
  totalAmount: number;
  status: string;
  createdAt: string;
}

interface ReplenishmentResponse {
  summary: {
    criticalItems: number;
    warningItems: number;
    pendingOrders: number;
    totalSuggested: number;
  };
  items: ReplenishmentItem[];
  pendingOrders: PendingOrder[];
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('POS', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'POS module not accessible' } },
        { status: 403 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // 1. Get all raw materials (products that are components in BOMs)
    let bomLineProductIds: number[] = [];
    try {
      const bomLines = await odoo.searchRead('mrp.bom.line', [], {
        fields: ['product_id'],
        limit: 1000,
      }) as { product_id: [number, string] }[];

      bomLineProductIds = [...new Set(bomLines.map(l => l.product_id[0]))];
    } catch {
      // MRP not available, return empty
      console.warn('MRP module not available');
    }

    if (bomLineProductIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          summary: { criticalItems: 0, warningItems: 0, pendingOrders: 0, totalSuggested: 0 },
          items: [],
          pendingOrders: [],
        } as ReplenishmentResponse,
      });
    }

    // 2. Get product info
    const products = await odoo.searchRead<Product>('product.product',
      [['id', 'in', bomLineProductIds]],
      { fields: ['id', 'name', 'default_code', 'uom_id', 'type', 'standard_price', 'seller_ids'] }
    );

    // 3. Get current stock levels
    const quants = await odoo.searchRead<StockQuant>('stock.quant',
      [['product_id', 'in', bomLineProductIds], ['location_id.usage', '=', 'internal']],
      { fields: ['product_id', 'quantity', 'available_quantity'] }
    );

    // Aggregate stock by product
    const stockMap = new Map<number, number>();
    for (const q of quants) {
      if (!q.product_id) continue;
      const pid = q.product_id[0];
      stockMap.set(pid, (stockMap.get(pid) || 0) + (q.available_quantity || q.quantity || 0));
    }

    // 4. Get reorder rules
    let reorderRules: ReorderRule[] = [];
    try {
      reorderRules = await odoo.searchRead<ReorderRule>('stock.warehouse.orderpoint',
        [['product_id', 'in', bomLineProductIds]],
        { fields: ['product_id', 'product_min_qty', 'product_max_qty'] }
      );
    } catch {
      // Reorder rules might not be available
    }

    const reorderMap = new Map<number, { min: number; max: number }>();
    for (const rule of reorderRules) {
      if (rule.product_id) {
        reorderMap.set(rule.product_id[0], {
          min: rule.product_min_qty || 5,
          max: rule.product_max_qty || 50,
        });
      }
    }

    // 5. Calculate daily consumption (from last 7 days of POS orders)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateFrom = sevenDaysAgo.toISOString().split('T')[0];
    const dateTo = new Date().toISOString().split('T')[0];

    // Get orders from last 7 days
    const orders = await odoo.searchRead('pos.order',
      [['state', 'in', ['paid', 'done', 'invoiced']], ['date_order', '>=', dateFrom], ['date_order', '<=', `${dateTo} 23:59:59`]],
      { fields: ['lines'], limit: 5000 }
    ) as { lines: number[] }[];

    const lineIds = orders.flatMap(o => o.lines || []);

    // Get order lines
    let orderLines: { product_id: [number, string]; qty: number }[] = [];
    if (lineIds.length > 0) {
      orderLines = await odoo.searchRead('pos.order.line',
        [['id', 'in', lineIds]],
        { fields: ['product_id', 'qty'] }
      ) as { product_id: [number, string]; qty: number }[];
    }

    // Aggregate sold quantities by product
    const soldQtyMap = new Map<number, number>();
    for (const line of orderLines) {
      if (!line.product_id) continue;
      const pid = line.product_id[0];
      soldQtyMap.set(pid, (soldQtyMap.get(pid) || 0) + line.qty);
    }

    // Get BOMs to calculate consumption
    let boms: { product_tmpl_id: [number, string]; bom_line_ids: number[] }[] = [];
    let bomLines: { id: number; product_id: [number, string]; product_qty: number }[] = [];

    try {
      boms = await odoo.searchRead('mrp.bom', [],
        { fields: ['product_tmpl_id', 'bom_line_ids'], limit: 500 }
      ) as { product_tmpl_id: [number, string]; bom_line_ids: number[] }[];

      const allBomLineIds = boms.flatMap(b => b.bom_line_ids || []);
      if (allBomLineIds.length > 0) {
        bomLines = await odoo.searchRead('mrp.bom.line',
          [['id', 'in', allBomLineIds]],
          { fields: ['id', 'product_id', 'product_qty'] }
        ) as { id: number; product_id: [number, string]; product_qty: number }[];
      }
    } catch {
      // MRP not available
    }

    // Get product -> template mapping for sold products
    const soldProductIds = Array.from(soldQtyMap.keys());
    let productTemplates: { id: number; product_tmpl_id: [number, string] }[] = [];
    if (soldProductIds.length > 0) {
      productTemplates = await odoo.searchRead('product.product',
        [['id', 'in', soldProductIds]],
        { fields: ['id', 'product_tmpl_id'] }
      ) as { id: number; product_tmpl_id: [number, string] }[];
    }

    const productToTemplate = new Map<number, number>();
    for (const p of productTemplates) {
      if (p.product_tmpl_id) {
        productToTemplate.set(p.id, p.product_tmpl_id[0]);
      }
    }

    // Build template -> bom lines map
    const templateToBomLines = new Map<number, { product_id: number; qty: number }[]>();
    for (const bom of boms) {
      if (!bom.product_tmpl_id) continue;
      const lines = bom.bom_line_ids.map(id => {
        const bl = bomLines.find(l => l.id === id);
        return bl ? { product_id: bl.product_id[0], qty: bl.product_qty } : null;
      }).filter(Boolean) as { product_id: number; qty: number }[];
      templateToBomLines.set(bom.product_tmpl_id[0], lines);
    }

    // Calculate total consumption per raw material in 7 days
    const consumptionMap = new Map<number, number>();
    for (const [productId, soldQty] of soldQtyMap) {
      const templateId = productToTemplate.get(productId);
      if (!templateId) continue;
      const lines = templateToBomLines.get(templateId);
      if (!lines) continue;
      for (const line of lines) {
        const consumed = line.qty * soldQty;
        consumptionMap.set(line.product_id, (consumptionMap.get(line.product_id) || 0) + consumed);
      }
    }

    // 6. Get supplier info
    const allSellerIds = products.flatMap(p => p.seller_ids || []);
    let supplierInfos: SupplierInfo[] = [];
    if (allSellerIds.length > 0) {
      try {
        supplierInfos = await odoo.searchRead<SupplierInfo>('product.supplierinfo',
          [['id', 'in', allSellerIds]],
          { fields: ['id', 'partner_id', 'price', 'min_qty'] }
        );
      } catch {
        // product.supplierinfo might not be accessible
      }
    }

    const supplierMap = new Map<number, { name: string; price: number }>();
    for (const info of supplierInfos) {
      if (info.partner_id) {
        supplierMap.set(info.id, { name: info.partner_id[1], price: info.price || 0 });
      }
    }

    // 7. Build replenishment items
    const items: ReplenishmentItem[] = [];

    for (const product of products) {
      const currentStock = stockMap.get(product.id) || 0;
      const reorder = reorderMap.get(product.id) || { min: 5, max: 50 };
      const weeklyConsumption = consumptionMap.get(product.id) || 0;
      const avgDailyUsage = weeklyConsumption / 7;

      // Calculate days remaining
      const daysRemaining = avgDailyUsage > 0 ? currentStock / avgDailyUsage : 999;

      // Determine status
      let status: 'critical' | 'warning' | null = null;
      if (currentStock <= reorder.min) {
        status = 'critical';
      } else if (daysRemaining < 7 || currentStock < reorder.min * 1.5) {
        status = 'warning';
      }

      if (!status) continue; // Only include items that need attention

      // Get supplier info
      const sellerId = product.seller_ids?.[0];
      const supplier = sellerId ? supplierMap.get(sellerId) : null;

      // Calculate suggested quantity (up to max stock)
      const suggestedQty = Math.max(0, reorder.max - currentStock);

      items.push({
        id: product.id,
        name: product.name,
        currentStock,
        minStock: reorder.min,
        maxStock: reorder.max,
        unit: (product.uom_id && Array.isArray(product.uom_id)) ? product.uom_id[1] : 'Units',
        avgDailyUsage: Math.round(avgDailyUsage * 10) / 10,
        daysRemaining: Math.round(daysRemaining * 10) / 10,
        suggestedQty: Math.round(suggestedQty * 10) / 10,
        status,
        supplier: supplier?.name || '-',
        unitPrice: supplier?.price || product.standard_price || 0,
        lastOrderDate: null, // Could be fetched from purchase.order.line
      });
    }

    // Sort by urgency (critical first, then by days remaining)
    items.sort((a, b) => {
      if (a.status === 'critical' && b.status !== 'critical') return -1;
      if (a.status !== 'critical' && b.status === 'critical') return 1;
      return a.daysRemaining - b.daysRemaining;
    });

    // 8. Get pending purchase orders
    let purchaseOrders: PurchaseOrder[] = [];
    try {
      purchaseOrders = await odoo.searchRead<PurchaseOrder>('purchase.order',
        [['state', 'in', ['draft', 'sent', 'to approve']]],
        { fields: ['id', 'name', 'partner_id', 'date_order', 'amount_total', 'state', 'order_line'], limit: 20 }
      );
    } catch {
      // Purchase module might not be accessible
    }

    const pendingOrders: PendingOrder[] = purchaseOrders.map(po => ({
      id: po.name,
      odooId: po.id,
      supplier: po.partner_id ? po.partner_id[1] : '-',
      items: po.order_line?.length || 0,
      totalAmount: po.amount_total || 0,
      status: po.state === 'sent' ? 'sent' : 'pending',
      createdAt: po.date_order ? new Date(po.date_order).toLocaleString('ja-JP') : '',
    }));

    // 9. Build summary
    const criticalItems = items.filter(i => i.status === 'critical').length;
    const warningItems = items.filter(i => i.status === 'warning').length;

    const response: ReplenishmentResponse = {
      summary: {
        criticalItems,
        warningItems,
        pendingOrders: pendingOrders.length,
        totalSuggested: items.length,
      },
      items,
      pendingOrders,
    };

    return NextResponse.json({ success: true, data: response });

  } catch (error) {
    console.error('Replenishment API error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } },
      { status: 500 }
    );
  }
}
