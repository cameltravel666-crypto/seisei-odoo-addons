import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession, TenantProvisioningError } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface PosOrderData {
  id: number;
  amount_total: number;
  amount_paid: number;
  state: string;
  date_order: string;
  pos_reference: string;
}

interface SaleOrderData {
  id: number;
  name: string;
  amount_total: number;
  state: string;
  date_order: string;
  invoice_status: string;
}

interface SaleOrderLineData {
  id: number;
  product_id: [number, string];
  product_uom_qty: number;
  price_subtotal: number;
}

interface PosOrderLineData {
  id: number;
  product_id: [number, string];
  qty: number;
  price_subtotal_incl: number;
}

interface PaymentData {
  id: number;
  payment_method_id: [number, string];
  amount: number;
}

// Helper to get date range
function getDateRange(range: string): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  switch (range) {
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yd = yesterday.toISOString().split('T')[0];
      return { from: yd, to: yd };
    }
    case 'thisWeek': {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(monday.getDate() + mondayOffset);
      return { from: monday.toISOString().split('T')[0], to: today };
    }
    case 'thisMonth': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: monthStart.toISOString().split('T')[0], to: today };
    }
    case 'lastMonth': {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: lastMonthStart.toISOString().split('T')[0], to: lastMonthEnd.toISOString().split('T')[0] };
    }
    case 'today':
    default:
      return { from: today, to: today };
  }
}

// Get comparison date range (same duration, previous period)
function getComparisonRange(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const duration = toDate.getTime() - fromDate.getTime();

  const compTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000); // day before start
  const compFrom = new Date(compTo.getTime() - duration);

  return {
    from: compFrom.toISOString().split('T')[0],
    to: compTo.toISOString().split('T')[0],
  };
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

    const hasAccess = await isModuleAccessible('DASHBOARD', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Dashboard module not accessible' } },
        { status: 403 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const range = searchParams.get('range') || 'today';
    const customFrom = searchParams.get('from');
    const customTo = searchParams.get('to');

    let dateRange: { from: string; to: string };
    if (range === 'custom' && customFrom && customTo) {
      dateRange = { from: customFrom, to: customTo };
    } else {
      dateRange = getDateRange(range);
    }

    const compRange = getComparisonRange(dateRange.from, dateRange.to);

    // Fetch POS orders (if accessible)
    let posOrders: PosOrderData[] = [];
    let compPosOrders: PosOrderData[] = [];
    try {
      posOrders = await odoo.searchRead<PosOrderData>('pos.order', [
        ['date_order', '>=', `${dateRange.from} 00:00:00`],
        ['date_order', '<=', `${dateRange.to} 23:59:59`],
      ], {
        fields: ['amount_total', 'amount_paid', 'state', 'date_order', 'pos_reference'],
      });

      compPosOrders = await odoo.searchRead<PosOrderData>('pos.order', [
        ['date_order', '>=', `${compRange.from} 00:00:00`],
        ['date_order', '<=', `${compRange.to} 23:59:59`],
        ['state', 'in', ['paid', 'done', 'invoiced']],
      ], {
        fields: ['amount_total'],
      });
    } catch {
      // POS module might not be installed
      console.log('[Dashboard] POS module not accessible, skipping POS orders');
    }

    // Fetch Sales Orders (sale.order)
    let saleOrders: SaleOrderData[] = [];
    let compSaleOrders: SaleOrderData[] = [];
    try {
      saleOrders = await odoo.searchRead<SaleOrderData>('sale.order', [
        ['date_order', '>=', `${dateRange.from} 00:00:00`],
        ['date_order', '<=', `${dateRange.to} 23:59:59`],
      ], {
        fields: ['name', 'amount_total', 'state', 'date_order', 'invoice_status'],
      });

      compSaleOrders = await odoo.searchRead<SaleOrderData>('sale.order', [
        ['date_order', '>=', `${compRange.from} 00:00:00`],
        ['date_order', '<=', `${compRange.to} 23:59:59`],
        ['state', '=', 'sale'],  // Confirmed orders
      ], {
        fields: ['amount_total'],
      });
    } catch {
      // Sale module might not be accessible
      console.log('[Dashboard] Sale module not accessible, skipping sale orders');
    }

    // Filter completed POS orders
    const completedPosOrders = posOrders.filter(o => ['paid', 'done', 'invoiced'].includes(o.state));
    const cancelledPosOrders = posOrders.filter(o => o.state === 'cancel');

    // Filter confirmed Sale orders (state='sale' means confirmed, 'cancel' means cancelled)
    const completedSaleOrders = saleOrders.filter(o => o.state === 'sale');
    const cancelledSaleOrders = saleOrders.filter(o => o.state === 'cancel');

    // Calculate core metrics - combine POS and Sales orders
    const posSales = completedPosOrders.reduce((sum, o) => sum + o.amount_total, 0);
    const saleSales = completedSaleOrders.reduce((sum, o) => sum + o.amount_total, 0);
    const totalSales = posSales + saleSales;

    const posOrderCount = completedPosOrders.length;
    const saleOrderCount = completedSaleOrders.length;
    const orderCount = posOrderCount + saleOrderCount;

    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

    const cancelCount = cancelledPosOrders.length + cancelledSaleOrders.length;
    const totalOrders = posOrders.length + saleOrders.length;
    const cancelRate = totalOrders > 0 ? (cancelCount / totalOrders) * 100 : 0;

    // Comparison metrics - combine POS and Sales
    const compPosSales = compPosOrders.reduce((sum, o) => sum + o.amount_total, 0);
    const compSaleSales = compSaleOrders.reduce((sum, o) => sum + o.amount_total, 0);
    const compTotalSales = compPosSales + compSaleSales;
    const compOrderCount = compPosOrders.length + compSaleOrders.length;
    const compAvgOrder = compOrderCount > 0 ? compTotalSales / compOrderCount : 0;

    const salesChange = compTotalSales > 0 ? ((totalSales - compTotalSales) / compTotalSales) * 100 : 0;
    const orderChange = compOrderCount > 0 ? ((orderCount - compOrderCount) / compOrderCount) * 100 : 0;
    const avgChange = compAvgOrder > 0 ? ((avgOrderValue - compAvgOrder) / compAvgOrder) * 100 : 0;

    // Product ranking - combine POS and Sales order lines
    const productMap = new Map<number, { name: string; qty: number; amount: number }>();
    let categoryRanking: { categoryId: number; categoryName: string; totalAmount: number }[] = [];
    let paymentBreakdown: { method: string; amount: number; count: number }[] = [];

    // Fetch POS order lines for product ranking
    const posOrderIds = completedPosOrders.map(o => o.id);
    if (posOrderIds.length > 0) {
      try {
        const posOrderLines = await odoo.searchRead<PosOrderLineData>('pos.order.line', [
          ['order_id', 'in', posOrderIds],
        ], {
          fields: ['product_id', 'qty', 'price_subtotal_incl'],
        });

        for (const line of posOrderLines) {
          const [productId, productName] = line.product_id;
          const existing = productMap.get(productId) || { name: productName, qty: 0, amount: 0 };
          existing.qty += line.qty;
          existing.amount += line.price_subtotal_incl;
          productMap.set(productId, existing);
        }

        // Fetch POS payments
        const payments = await odoo.searchRead<PaymentData>('pos.payment', [
          ['pos_order_id', 'in', posOrderIds],
        ], {
          fields: ['payment_method_id', 'amount'],
        });

        const paymentMap = new Map<string, { amount: number; count: number }>();
        for (const payment of payments) {
          const methodName = payment.payment_method_id[1];
          const existing = paymentMap.get(methodName) || { amount: 0, count: 0 };
          existing.amount += payment.amount;
          existing.count += 1;
          paymentMap.set(methodName, existing);
        }

        paymentBreakdown = Array.from(paymentMap.entries())
          .map(([method, data]) => ({
            method,
            amount: data.amount,
            count: data.count,
          }))
          .sort((a, b) => b.amount - a.amount);
      } catch {
        // POS module might not be accessible
      }
    }

    // Fetch Sales order lines for product ranking
    const saleOrderIds = completedSaleOrders.map(o => o.id);
    if (saleOrderIds.length > 0) {
      try {
        const saleOrderLines = await odoo.searchRead<SaleOrderLineData>('sale.order.line', [
          ['order_id', 'in', saleOrderIds],
        ], {
          fields: ['product_id', 'product_uom_qty', 'price_subtotal'],
        });

        for (const line of saleOrderLines) {
          const [productId, productName] = line.product_id;
          const existing = productMap.get(productId) || { name: productName, qty: 0, amount: 0 };
          existing.qty += line.product_uom_qty;
          existing.amount += line.price_subtotal;
          productMap.set(productId, existing);
        }
      } catch {
        // Sale order line might not be accessible
        console.log('[Dashboard] Sale order lines not accessible');
      }
    }

    const productRanking = Array.from(productMap.entries())
      .map(([productId, data]) => ({
        productId,
        productName: data.name,
        totalQty: data.qty,
        totalAmount: data.amount,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10);

    // Build hourly distribution (for peak hours analysis) - combine POS and Sales
    const hourlyOrders = new Array(24).fill(0).map((_, hour) => ({
      hour,
      orderCount: 0,
      totalSales: 0,
    }));

    // Add POS orders to hourly distribution
    for (const order of completedPosOrders) {
      const orderDate = new Date(order.date_order);
      const hour = orderDate.getHours();
      hourlyOrders[hour].orderCount += 1;
      hourlyOrders[hour].totalSales += order.amount_total;
    }

    // Add Sales orders to hourly distribution
    for (const order of completedSaleOrders) {
      const orderDate = new Date(order.date_order);
      const hour = orderDate.getHours();
      hourlyOrders[hour].orderCount += 1;
      hourlyOrders[hour].totalSales += order.amount_total;
    }

    // Build daily trend - combine POS and Sales
    const dailyMap = new Map<string, { totalSales: number; orderCount: number }>();

    // Add POS orders to daily trend
    for (const order of completedPosOrders) {
      const dateKey = order.date_order.split(' ')[0];
      const existing = dailyMap.get(dateKey) || { totalSales: 0, orderCount: 0 };
      existing.totalSales += order.amount_total;
      existing.orderCount += 1;
      dailyMap.set(dateKey, existing);
    }

    // Add Sales orders to daily trend
    for (const order of completedSaleOrders) {
      const dateKey = order.date_order.split(' ')[0];
      const existing = dailyMap.get(dateKey) || { totalSales: 0, orderCount: 0 };
      existing.totalSales += order.amount_total;
      existing.orderCount += 1;
      dailyMap.set(dateKey, existing);
    }

    const salesTrend = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        totalSales: data.totalSales,
        orderCount: data.orderCount,
        averageOrderValue: data.orderCount > 0 ? data.totalSales / data.orderCount : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      data: {
        dateRange,
        summary: {
          totalSales,
          orderCount,
          avgOrderValue,
          cancelCount,
          cancelRate,
          salesChange,
          orderChange,
          avgChange,
        },
        productRanking,
        categoryRanking,
        paymentBreakdown,
        hourlyDistribution: hourlyOrders,
        salesTrend,
      },
    });
  } catch (error) {
    console.error('[Dashboard Error]', error);

    // Handle tenant provisioning state
    if (error instanceof TenantProvisioningError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 503 } // Service Unavailable - temporary state
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard data' } },
      { status: 500 }
    );
  }
}
