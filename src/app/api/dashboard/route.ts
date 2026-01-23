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

    // Fetch current period orders
    const orders = await odoo.searchRead<PosOrderData>('pos.order', [
      ['date_order', '>=', `${dateRange.from} 00:00:00`],
      ['date_order', '<=', `${dateRange.to} 23:59:59`],
    ], {
      fields: ['amount_total', 'amount_paid', 'state', 'date_order', 'pos_reference'],
    });

    // Fetch comparison period orders
    const compOrders = await odoo.searchRead<PosOrderData>('pos.order', [
      ['date_order', '>=', `${compRange.from} 00:00:00`],
      ['date_order', '<=', `${compRange.to} 23:59:59`],
      ['state', 'in', ['paid', 'done', 'invoiced']],
    ], {
      fields: ['amount_total'],
    });

    // Filter completed orders
    const completedOrders = orders.filter(o => ['paid', 'done', 'invoiced'].includes(o.state));
    const cancelledOrders = orders.filter(o => o.state === 'cancel');

    // Calculate core metrics
    const totalSales = completedOrders.reduce((sum, o) => sum + o.amount_total, 0);
    const orderCount = completedOrders.length;
    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;
    const cancelCount = cancelledOrders.length;
    const cancelRate = orders.length > 0 ? (cancelCount / orders.length) * 100 : 0;

    // Comparison metrics
    const compTotalSales = compOrders.reduce((sum, o) => sum + o.amount_total, 0);
    const compOrderCount = compOrders.length;
    const compAvgOrder = compOrderCount > 0 ? compTotalSales / compOrderCount : 0;

    const salesChange = compTotalSales > 0 ? ((totalSales - compTotalSales) / compTotalSales) * 100 : 0;
    const orderChange = compOrderCount > 0 ? ((orderCount - compOrderCount) / compOrderCount) * 100 : 0;
    const avgChange = compAvgOrder > 0 ? ((avgOrderValue - compAvgOrder) / compAvgOrder) * 100 : 0;

    // Get order line IDs for top products
    const orderIds = completedOrders.map(o => o.id);
    let productRanking: { productId: number; productName: string; totalQty: number; totalAmount: number }[] = [];
    let categoryRanking: { categoryId: number; categoryName: string; totalAmount: number }[] = [];
    let paymentBreakdown: { method: string; amount: number; count: number }[] = [];

    if (orderIds.length > 0) {
      // Fetch order lines
      const orderLines = await odoo.searchRead<PosOrderLineData>('pos.order.line', [
        ['order_id', 'in', orderIds],
      ], {
        fields: ['product_id', 'qty', 'price_subtotal_incl'],
      });

      // Aggregate by product
      const productMap = new Map<number, { name: string; qty: number; amount: number }>();
      for (const line of orderLines) {
        const [productId, productName] = line.product_id;
        const existing = productMap.get(productId) || { name: productName, qty: 0, amount: 0 };
        existing.qty += line.qty;
        existing.amount += line.price_subtotal_incl;
        productMap.set(productId, existing);
      }

      productRanking = Array.from(productMap.entries())
        .map(([productId, data]) => ({
          productId,
          productName: data.name,
          totalQty: data.qty,
          totalAmount: data.amount,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10);

      // Fetch payments
      try {
        const payments = await odoo.searchRead<PaymentData>('pos.payment', [
          ['pos_order_id', 'in', orderIds],
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
        // pos.payment might not be accessible
      }
    }

    // Build hourly distribution (for peak hours analysis)
    const hourlyOrders = new Array(24).fill(0).map((_, hour) => ({
      hour,
      orderCount: 0,
      totalSales: 0,
    }));

    for (const order of completedOrders) {
      const orderDate = new Date(order.date_order);
      const hour = orderDate.getHours();
      hourlyOrders[hour].orderCount += 1;
      hourlyOrders[hour].totalSales += order.amount_total;
    }

    // Build daily trend
    const dailyMap = new Map<string, { totalSales: number; orderCount: number }>();
    for (const order of completedOrders) {
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
