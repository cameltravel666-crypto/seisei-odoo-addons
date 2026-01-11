import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * POS Consumption API - Calculate material consumption based on POS orders × BOM
 *
 * GET /api/pos/consumption?date_from=2024-01-01&date_to=2024-01-31
 *
 * This endpoint:
 * 1. Fetches POS orders within the date range
 * 2. Gets order lines with product info
 * 3. Looks up BOM for each product
 * 4. Calculates total material consumption
 * 5. Returns aggregated data by dish and by ingredient
 */

interface PosOrderLine {
  id: number;
  product_id: [number, string] | false;
  qty: number;
  price_unit: number;
}

interface BomLine {
  id: number;
  product_id: [number, string];
  product_qty: number;
  product_uom_id: [number, string];
}

interface Bom {
  id: number;
  product_tmpl_id: [number, string];
  product_id: [number, string] | false;
  bom_line_ids: number[];
}

interface StockQuant {
  product_id: [number, string];
  quantity: number;
  available_quantity: number;
}

interface ProductInfo {
  id: number;
  name: string;
  reorderpoint_min_qty?: number;
  uom_id: [number, string] | false;
}

interface DishConsumption {
  id: number;
  name: string;
  soldCount: number;
  ingredients: IngredientConsumption[];
}

interface IngredientConsumption {
  id: number;
  name: string;
  consumed: number;
  unit: string;
  remaining: number;
  minStock: number;
}

interface ConsumptionResponse {
  summary: {
    totalDishes: number;
    totalIngredients: number;
    lowStockItems: number;
  };
  byDish: DishConsumption[];
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

    const searchParams = request.nextUrl.searchParams;
    const dateRange = searchParams.get('range') || 'today'; // today, week, month

    // Calculate date range
    const today = new Date();
    let dateFrom: string;
    let dateTo: string = today.toISOString().split('T')[0];

    switch (dateRange) {
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFrom = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        dateFrom = monthAgo.toISOString().split('T')[0];
        break;
      default: // today
        dateFrom = dateTo;
    }

    const odoo = await getOdooClientForSession(session);

    // 1. Get completed POS orders in date range
    const orderDomain: unknown[] = [
      ['state', 'in', ['paid', 'done', 'invoiced']],
      ['date_order', '>=', dateFrom],
      ['date_order', '<=', `${dateTo} 23:59:59`],
    ];

    const orders = await odoo.searchRead<{ id: number; name: string; lines: number[] }>('pos.order', orderDomain, {
      fields: ['id', 'name', 'lines'],
      limit: 1000,
    });

    if (!orders.length) {
      return NextResponse.json({
        success: true,
        data: {
          summary: { totalDishes: 0, totalIngredients: 0, lowStockItems: 0 },
          byDish: [],
        } as ConsumptionResponse,
      });
    }

    // 2. Get all order line IDs and fetch them
    const allLineIds = orders.flatMap((o) => o.lines || []);

    if (!allLineIds.length) {
      return NextResponse.json({
        success: true,
        data: {
          summary: { totalDishes: 0, totalIngredients: 0, lowStockItems: 0 },
          byDish: [],
        } as ConsumptionResponse,
      });
    }

    const orderLines = await odoo.searchRead<PosOrderLine>('pos.order.line', [['id', 'in', allLineIds]], {
      fields: ['product_id', 'qty'],
    });

    // 3. Aggregate quantities by product
    const productQtyMap = new Map<number, { name: string; qty: number }>();
    for (const line of orderLines) {
      if (!line.product_id || !Array.isArray(line.product_id)) continue;
      const [productId, productName] = line.product_id;
      const existing = productQtyMap.get(productId);
      if (existing) {
        existing.qty += line.qty;
      } else {
        productQtyMap.set(productId, { name: productName, qty: line.qty });
      }
    }

    const productIds = Array.from(productQtyMap.keys());

    // 4. Get product template IDs for BOM lookup
    const products = await odoo.searchRead<{ id: number; name: string; product_tmpl_id: [number, string] | false }>('product.product', [['id', 'in', productIds]], {
      fields: ['id', 'name', 'product_tmpl_id'],
    });

    const productToTemplate = new Map<number, number>();
    for (const p of products) {
      if (p.product_tmpl_id && Array.isArray(p.product_tmpl_id)) {
        productToTemplate.set(p.id, p.product_tmpl_id[0]);
      }
    }

    const templateIds = Array.from(new Set(productToTemplate.values()));

    // 5. Get BOMs for products
    let boms: Bom[] = [];
    if (templateIds.length > 0) {
      try {
        boms = await odoo.searchRead<Bom>('mrp.bom', [['product_tmpl_id', 'in', templateIds]], {
          fields: ['id', 'product_tmpl_id', 'product_id', 'bom_line_ids'],
        });
      } catch {
        // MRP module might not be installed
        console.warn('MRP module not available, returning empty consumption data');
      }
    }

    // Build template -> BOM map
    const templateToBom = new Map<number, Bom>();
    for (const bom of boms) {
      if (bom.product_tmpl_id && Array.isArray(bom.product_tmpl_id)) {
        templateToBom.set(bom.product_tmpl_id[0], bom);
      }
    }

    // 6. Get all BOM lines
    const allBomLineIds = boms.flatMap(b => b.bom_line_ids || []);
    let bomLines: BomLine[] = [];
    if (allBomLineIds.length > 0) {
      bomLines = await odoo.searchRead<BomLine>('mrp.bom.line', [['id', 'in', allBomLineIds]], {
        fields: ['id', 'product_id', 'product_qty', 'product_uom_id'],
      });
    }

    // Build BOM line map
    const bomLineMap = new Map<number, BomLine>();
    for (const line of bomLines) {
      bomLineMap.set(line.id, line);
    }

    // 7. Calculate consumption per dish and aggregate ingredients
    const ingredientConsumption = new Map<number, {
      name: string;
      consumed: number;
      unit: string;
    }>();

    const byDish: DishConsumption[] = [];
    let totalDishes = 0;

    for (const [productId, { name: productName, qty: soldCount }] of productQtyMap) {
      totalDishes += soldCount;

      const templateId = productToTemplate.get(productId);
      if (!templateId) continue;

      const bom = templateToBom.get(templateId);
      if (!bom) continue;

      const dishIngredients: IngredientConsumption[] = [];

      for (const lineId of bom.bom_line_ids || []) {
        const bomLine = bomLineMap.get(lineId);
        if (!bomLine || !bomLine.product_id) continue;

        const [ingredientId, ingredientName] = bomLine.product_id;
        const consumedQty = bomLine.product_qty * soldCount;
        const unit = bomLine.product_uom_id?.[1] || 'Units';

        // Aggregate for summary
        const existing = ingredientConsumption.get(ingredientId);
        if (existing) {
          existing.consumed += consumedQty;
        } else {
          ingredientConsumption.set(ingredientId, {
            name: ingredientName,
            consumed: consumedQty,
            unit,
          });
        }

        dishIngredients.push({
          id: ingredientId,
          name: ingredientName,
          consumed: consumedQty,
          unit,
          remaining: 0, // Will be filled later
          minStock: 0,  // Will be filled later
        });
      }

      if (dishIngredients.length > 0) {
        byDish.push({
          id: productId,
          name: productName,
          soldCount,
          ingredients: dishIngredients,
        });
      }
    }

    // 8. Get current stock levels for ingredients
    const ingredientIds = Array.from(ingredientConsumption.keys());

    if (ingredientIds.length > 0) {
      // Get stock levels
      const quants = await odoo.searchRead<StockQuant>('stock.quant',
        [['product_id', 'in', ingredientIds], ['location_id.usage', '=', 'internal']],
        { fields: ['product_id', 'quantity', 'available_quantity'] }
      );

      // Aggregate stock by product
      const stockMap = new Map<number, number>();
      for (const q of quants) {
        if (!q.product_id) continue;
        const pid = q.product_id[0];
        stockMap.set(pid, (stockMap.get(pid) || 0) + (q.available_quantity || q.quantity || 0));
      }

      // Get product info for min stock (reorder rules)
      let productInfos: ProductInfo[] = [];
      try {
        productInfos = await odoo.searchRead<ProductInfo>('product.product',
          [['id', 'in', ingredientIds]],
          { fields: ['id', 'name', 'uom_id'] }
        );
      } catch {
        // Ignore if fails
      }

      // Try to get reorder rules
      let reorderRules: { product_id: [number, string]; product_min_qty: number }[] = [];
      try {
        reorderRules = await odoo.searchRead('stock.warehouse.orderpoint',
          [['product_id', 'in', ingredientIds]],
          { fields: ['product_id', 'product_min_qty'] }
        ) as { product_id: [number, string]; product_min_qty: number }[];
      } catch {
        // Reorder rules might not be available
      }

      const minStockMap = new Map<number, number>();
      for (const rule of reorderRules) {
        if (rule.product_id) {
          minStockMap.set(rule.product_id[0], rule.product_min_qty || 0);
        }
      }

      // Update dish ingredients with stock info
      for (const dish of byDish) {
        for (const ing of dish.ingredients) {
          ing.remaining = stockMap.get(ing.id) || 0;
          ing.minStock = minStockMap.get(ing.id) || 5; // Default min stock
        }
      }
    }

    // 9. Count low stock items
    let lowStockItems = 0;
    for (const dish of byDish) {
      for (const ing of dish.ingredients) {
        if (ing.remaining <= ing.minStock) {
          lowStockItems++;
        }
      }
    }
    // Deduplicate - count unique ingredients that are low
    const lowStockSet = new Set<number>();
    for (const dish of byDish) {
      for (const ing of dish.ingredients) {
        if (ing.remaining <= ing.minStock) {
          lowStockSet.add(ing.id);
        }
      }
    }

    // Sort dishes by sold count descending
    byDish.sort((a, b) => b.soldCount - a.soldCount);

    const response: ConsumptionResponse = {
      summary: {
        totalDishes,
        totalIngredients: ingredientConsumption.size,
        lowStockItems: lowStockSet.size,
      },
      byDish,
    };

    return NextResponse.json({ success: true, data: response });

  } catch (error) {
    console.error('Consumption API error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } },
      { status: 500 }
    );
  }
}
