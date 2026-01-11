import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Inventory Stock API - Mode A: 库存查询
 *
 * Strategy 1 (recommended): stock.quant aggregated by product
 * Strategy 2 (fallback): product.product with qty_available field
 *
 * Returns product-level inventory with quantities aggregated across locations.
 */

interface StockQuant {
  id: number;
  product_id: [number, string] | false;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  location_id: [number, string] | false;
}

interface ProductProduct {
  id: number;
  name: string;
  barcode: string | false;
  default_code: string | false;
  uom_id: [number, string] | false;
  qty_available?: number;
}

interface AggregatedStock {
  productId: number;
  productName: string;
  barcode: string | null;
  defaultCode: string | null;
  uom: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
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

    const hasAccess = await isModuleAccessible('INVENTORY', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Inventory module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const tab = searchParams.get('tab') || 'all'; // all, in_stock, out_of_stock, low_stock
    const lowStockThreshold = parseInt(searchParams.get('lowStockThreshold') || '5');
    const strategy = searchParams.get('strategy') || 'stock_quant'; // stock_quant or product_qty

    const odoo = await getOdooClientForSession(session);

    let items: AggregatedStock[] = [];
    let usedStrategy = strategy;

    if (strategy === 'stock_quant') {
      // Strategy 1: Aggregate stock.quant by product
      try {
        // Build quant domain - only internal locations (exclude virtual)
        const quantDomain: unknown[] = [['location_id.usage', '=', 'internal']];

        // Fetch all quants (we'll aggregate in app)
        const quants = await odoo.searchRead<StockQuant>('stock.quant', quantDomain, {
          fields: ['product_id', 'quantity', 'reserved_quantity', 'available_quantity', 'location_id'],
          limit: 5000, // Large limit for aggregation
        });

        // Aggregate by product_id
        const productMap = new Map<number, {
          productId: number;
          productName: string;
          quantity: number;
          reservedQuantity: number;
          availableQuantity: number;
        }>();

        for (const quant of quants) {
          if (!quant.product_id || !Array.isArray(quant.product_id)) continue;

          const productId = quant.product_id[0];
          const existing = productMap.get(productId);

          if (existing) {
            existing.quantity += quant.quantity || 0;
            existing.reservedQuantity += quant.reserved_quantity || 0;
            existing.availableQuantity += quant.available_quantity || 0;
          } else {
            productMap.set(productId, {
              productId,
              productName: quant.product_id[1],
              quantity: quant.quantity || 0,
              reservedQuantity: quant.reserved_quantity || 0,
              availableQuantity: quant.available_quantity || 0,
            });
          }
        }

        // Get product details (barcode, code, uom)
        const productIds = Array.from(productMap.keys());
        let productDetails: ProductProduct[] = [];

        if (productIds.length > 0) {
          // Build product domain
          let productDomain: unknown[] = [['id', 'in', productIds]];

          // Add search filter
          if (search) {
            // Check if it looks like a barcode (numeric or alphanumeric without spaces)
            const isBarcode = /^[A-Za-z0-9-]+$/.test(search) && !search.includes(' ');
            if (isBarcode) {
              productDomain = [
                '&',
                ['id', 'in', productIds],
                '|', '|',
                ['barcode', '=', search],
                ['default_code', 'ilike', search],
                ['name', 'ilike', search],
              ];
            } else {
              productDomain = [
                '&',
                ['id', 'in', productIds],
                ['name', 'ilike', search],
              ];
            }
          }

          productDetails = await odoo.searchRead<ProductProduct>('product.product', productDomain, {
            fields: ['id', 'name', 'barcode', 'default_code', 'uom_id'],
            limit: 5000,
          });
        }

        // Create product details map
        const detailsMap = new Map(productDetails.map((p) => [p.id, p]));

        // Build aggregated items
        for (const [productId, agg] of productMap) {
          const details = detailsMap.get(productId);
          if (!details && search) continue; // Skip if not matching search

          items.push({
            productId,
            productName: details?.name || agg.productName,
            barcode: details?.barcode || null,
            defaultCode: details?.default_code || null,
            uom: Array.isArray(details?.uom_id) ? details.uom_id[1] : '',
            quantity: agg.quantity,
            reservedQuantity: agg.reservedQuantity,
            availableQuantity: agg.availableQuantity,
          });
        }
      } catch (error) {
        console.error('[Stock API] stock.quant strategy failed, falling back to product_qty:', error);
        usedStrategy = 'product_qty';
      }
    }

    // Strategy 2: Fallback to product.product with qty_available
    if (usedStrategy === 'product_qty' || items.length === 0) {
      try {
        let productDomain: unknown[] = [];

        if (search) {
          const isBarcode = /^[A-Za-z0-9-]+$/.test(search) && !search.includes(' ');
          if (isBarcode) {
            productDomain = [
              '|', '|',
              ['barcode', '=', search],
              ['default_code', 'ilike', search],
              ['name', 'ilike', search],
            ];
          } else {
            productDomain = [['name', 'ilike', search]];
          }
        }

        const products = await odoo.searchRead<ProductProduct & { qty_available: number }>('product.product', productDomain, {
          fields: ['id', 'name', 'barcode', 'default_code', 'uom_id', 'qty_available'],
          limit: 500,
        });

        items = products.map((p) => ({
          productId: p.id,
          productName: p.name,
          barcode: p.barcode || null,
          defaultCode: p.default_code || null,
          uom: Array.isArray(p.uom_id) ? p.uom_id[1] : '',
          quantity: p.qty_available || 0,
          reservedQuantity: 0,
          availableQuantity: p.qty_available || 0,
        }));

        usedStrategy = 'product_qty';
      } catch (error) {
        console.error('[Stock API] product_qty strategy also failed:', error);
        usedStrategy = 'product_only';
      }
    }

    // Apply tab filters (client-side since we aggregated)
    let filteredItems = items;
    switch (tab) {
      case 'in_stock':
        filteredItems = items.filter((i) => i.availableQuantity > 0);
        break;
      case 'out_of_stock':
        filteredItems = items.filter((i) => i.availableQuantity <= 0);
        break;
      case 'low_stock':
        filteredItems = items.filter((i) => i.availableQuantity > 0 && i.availableQuantity <= lowStockThreshold);
        break;
    }

    // Calculate stats from filtered data (same source = consistent)
    const stats = {
      totalProducts: items.length,
      inStock: items.filter((i) => i.availableQuantity > 0).length,
      outOfStock: items.filter((i) => i.availableQuantity <= 0).length,
      lowStock: items.filter((i) => i.availableQuantity > 0 && i.availableQuantity <= lowStockThreshold).length,
    };

    // Sort by name and paginate
    filteredItems.sort((a, b) => a.productName.localeCompare(b.productName));
    const offset = (page - 1) * limit;
    const paginatedItems = filteredItems.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: {
        items: paginatedItems,
        pagination: {
          page,
          limit,
          total: filteredItems.length,
          totalPages: Math.ceil(filteredItems.length / limit),
        },
        stats,
        strategy: usedStrategy,
      },
    });
  } catch (error) {
    console.error('[Inventory Stock Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch inventory',
        },
      },
      { status: 500 }
    );
  }
}
