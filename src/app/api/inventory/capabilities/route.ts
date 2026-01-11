import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * Capability Detection API for Inventory Module
 *
 * Detects available Odoo models, fields, and picking types
 * without modifying the ERP. Returns capability flags for graceful degradation.
 */

interface PickingType {
  id: number;
  name: string;
  code: string;
  warehouseId: number | null;
}

interface CapabilityResult {
  // Model access flags
  canAccessStockQuant: boolean;
  canAccessProductProduct: boolean;
  canAccessStockPicking: boolean;
  canAccessStockPickingType: boolean;
  canAccessStockMove: boolean;
  canAccessStockMoveLine: boolean;

  // Available fields per model
  stockQuantFields: string[];
  productFields: string[];

  // Picking types discovered
  incomingPickingTypeIds: number[];
  outgoingPickingTypeIds: number[];
  internalPickingTypeIds: number[];
  pickingTypes: PickingType[];

  // Recommended data strategy
  inventoryStrategy: 'stock_quant' | 'product_qty' | 'product_only';

  // Error messages for failed probes
  errors: string[];
}

// Probe a model with minimal fields to check access
async function probeModel(
  odoo: Awaited<ReturnType<typeof getOdooClientForSession>>,
  model: string,
  fields: string[]
): Promise<{ accessible: boolean; availableFields: string[]; error?: string }> {
  try {
    const result = await odoo.searchRead(model, [], {
      fields,
      limit: 1,
    });

    // If we got a result, check which fields are actually present
    const availableFields: string[] = [];
    if (result.length > 0) {
      const record = result[0] as Record<string, unknown>;
      for (const field of fields) {
        if (field in record) {
          availableFields.push(field);
        }
      }
    } else {
      // No records but access granted - assume all fields available
      availableFields.push(...fields);
    }

    return { accessible: true, availableFields };
  } catch (error) {
    return {
      accessible: false,
      availableFields: [],
      error: error instanceof Error ? error.message : 'Access denied',
    };
  }
}

export async function GET() {
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

    const odoo = await getOdooClientForSession(session);
    const errors: string[] = [];

    // Probe stock.quant
    const stockQuantProbe = await probeModel(odoo, 'stock.quant', [
      'id', 'product_id', 'quantity', 'reserved_quantity', 'available_quantity',
      'location_id', 'company_id', 'lot_id',
    ]);
    if (!stockQuantProbe.accessible) {
      errors.push(`stock.quant: ${stockQuantProbe.error}`);
    }

    // Probe product.product
    const productProbe = await probeModel(odoo, 'product.product', [
      'id', 'name', 'barcode', 'default_code', 'uom_id', 'qty_available',
      'virtual_available', 'free_qty',
    ]);
    if (!productProbe.accessible) {
      errors.push(`product.product: ${productProbe.error}`);
    }

    // Probe stock.picking
    const pickingProbe = await probeModel(odoo, 'stock.picking', [
      'id', 'name', 'partner_id', 'scheduled_date', 'date_done', 'origin',
      'state', 'picking_type_id', 'location_id', 'location_dest_id',
    ]);
    if (!pickingProbe.accessible) {
      errors.push(`stock.picking: ${pickingProbe.error}`);
    }

    // Probe stock.picking.type to get incoming/outgoing types
    let pickingTypes: PickingType[] = [];
    let pickingTypeProbeSuccess = false;
    try {
      const types = await odoo.searchRead<{
        id: number;
        name: string;
        code: string;
        warehouse_id: [number, string] | false;
      }>('stock.picking.type', [], {
        fields: ['id', 'name', 'code', 'warehouse_id'],
        limit: 100,
      });

      pickingTypes = types.map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        warehouseId: Array.isArray(t.warehouse_id) ? t.warehouse_id[0] : null,
      }));
      pickingTypeProbeSuccess = true;
    } catch (error) {
      errors.push(`stock.picking.type: ${error instanceof Error ? error.message : 'Access denied'}`);
    }

    // Probe stock.move
    const stockMoveProbe = await probeModel(odoo, 'stock.move', [
      'id', 'product_id', 'product_uom_qty', 'quantity', 'state', 'picking_id',
    ]);
    if (!stockMoveProbe.accessible) {
      errors.push(`stock.move: ${stockMoveProbe.error}`);
    }

    // Probe stock.move.line
    const stockMoveLineProbe = await probeModel(odoo, 'stock.move.line', [
      'id', 'product_id', 'quantity', 'move_id', 'picking_id', 'lot_id',
    ]);
    if (!stockMoveLineProbe.accessible) {
      errors.push(`stock.move.line: ${stockMoveLineProbe.error}`);
    }

    // Categorize picking types
    const incomingPickingTypeIds = pickingTypes
      .filter((t) => t.code === 'incoming')
      .map((t) => t.id);
    const outgoingPickingTypeIds = pickingTypes
      .filter((t) => t.code === 'outgoing')
      .map((t) => t.id);
    const internalPickingTypeIds = pickingTypes
      .filter((t) => t.code === 'internal')
      .map((t) => t.id);

    // Determine inventory strategy
    let inventoryStrategy: CapabilityResult['inventoryStrategy'] = 'product_only';
    if (stockQuantProbe.accessible) {
      inventoryStrategy = 'stock_quant';
    } else if (productProbe.accessible && productProbe.availableFields.includes('qty_available')) {
      inventoryStrategy = 'product_qty';
    }

    const capabilities: CapabilityResult = {
      canAccessStockQuant: stockQuantProbe.accessible,
      canAccessProductProduct: productProbe.accessible,
      canAccessStockPicking: pickingProbe.accessible,
      canAccessStockPickingType: pickingTypeProbeSuccess,
      canAccessStockMove: stockMoveProbe.accessible,
      canAccessStockMoveLine: stockMoveLineProbe.accessible,

      stockQuantFields: stockQuantProbe.availableFields,
      productFields: productProbe.availableFields,

      incomingPickingTypeIds,
      outgoingPickingTypeIds,
      internalPickingTypeIds,
      pickingTypes,

      inventoryStrategy,
      errors,
    };

    return NextResponse.json({
      success: true,
      data: capabilities,
    });
  } catch (error) {
    console.error('[Inventory Capabilities Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to detect capabilities',
        },
      },
      { status: 500 }
    );
  }
}
