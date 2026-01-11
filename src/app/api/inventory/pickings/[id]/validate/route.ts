import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession, OdooRPC } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface StockPicking {
  id: number;
  name: string;
  picking_type_code: string;
  origin: string | false;
  purchase_id: [number, string] | false;
  sale_id: [number, string] | false;
}

interface PurchaseOrder {
  id: number;
  invoice_status: string;
  invoice_ids: number[];
}

interface SaleOrder {
  id: number;
  invoice_status: string;
  invoice_ids: number[];
}

/**
 * Auto-generate vendor bill after purchase receipt validation
 */
async function autoGenerateVendorBill(odoo: OdooRPC, purchaseOrderId: number): Promise<number | null> {
  try {
    // Check if invoice already exists
    const [po] = await odoo.searchRead<PurchaseOrder>('purchase.order', [['id', '=', purchaseOrderId]], {
      fields: ['invoice_status', 'invoice_ids'],
    });

    if (!po || po.invoice_status === 'invoiced') {
      console.log('[Auto Invoice] Purchase order already invoiced');
      return null;
    }

    // Create vendor bill from purchase order
    const result = await odoo.callKw('purchase.order', 'action_create_invoice', [[purchaseOrderId]]);

    // Get the created invoice ID
    const [updatedPo] = await odoo.searchRead<PurchaseOrder>('purchase.order', [['id', '=', purchaseOrderId]], {
      fields: ['invoice_ids'],
    });

    if (updatedPo && updatedPo.invoice_ids && updatedPo.invoice_ids.length > 0) {
      const invoiceId = updatedPo.invoice_ids[updatedPo.invoice_ids.length - 1];

      // Auto-post the invoice (confirm it)
      try {
        await odoo.callKw('account.move', 'action_post', [[invoiceId]]);
        console.log(`[Auto Invoice] Vendor bill ${invoiceId} created and posted for PO ${purchaseOrderId}`);
      } catch (postError) {
        console.log(`[Auto Invoice] Vendor bill ${invoiceId} created but not posted:`, postError);
      }

      return invoiceId;
    }

    return typeof result === 'number' ? result : null;
  } catch (error) {
    console.error('[Auto Invoice] Failed to create vendor bill:', error);
    return null;
  }
}

/**
 * Auto-generate customer invoice after sales delivery validation
 */
async function autoGenerateCustomerInvoice(odoo: OdooRPC, saleOrderId: number): Promise<number | null> {
  try {
    // Check if invoice already exists
    const [so] = await odoo.searchRead<SaleOrder>('sale.order', [['id', '=', saleOrderId]], {
      fields: ['invoice_status', 'invoice_ids'],
    });

    if (!so || so.invoice_status === 'invoiced') {
      console.log('[Auto Invoice] Sale order already invoiced');
      return null;
    }

    // Create customer invoice from sale order
    const result = await odoo.callKw('sale.order', '_create_invoices', [[saleOrderId]]);

    // Get the invoice ID from result or fetch it
    let invoiceId: number | null = null;

    if (typeof result === 'number') {
      invoiceId = result;
    } else if (Array.isArray(result) && result.length > 0) {
      invoiceId = result[0];
    } else {
      // Fetch updated invoice_ids
      const [updatedSo] = await odoo.searchRead<SaleOrder>('sale.order', [['id', '=', saleOrderId]], {
        fields: ['invoice_ids'],
      });
      if (updatedSo && updatedSo.invoice_ids && updatedSo.invoice_ids.length > 0) {
        invoiceId = updatedSo.invoice_ids[updatedSo.invoice_ids.length - 1];
      }
    }

    if (invoiceId) {
      // Auto-post the invoice (confirm it)
      try {
        await odoo.callKw('account.move', 'action_post', [[invoiceId]]);
        console.log(`[Auto Invoice] Customer invoice ${invoiceId} created and posted for SO ${saleOrderId}`);
      } catch (postError) {
        console.log(`[Auto Invoice] Customer invoice ${invoiceId} created but not posted:`, postError);
      }

      return invoiceId;
    }

    return null;
  } catch (error) {
    console.error('[Auto Invoice] Failed to create customer invoice:', error);
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const pickingId = parseInt(id);
    if (isNaN(pickingId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid picking ID' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Get picking details before validation
    const [picking] = await odoo.searchRead<StockPicking>('stock.picking', [['id', '=', pickingId]], {
      fields: ['name', 'picking_type_code', 'origin', 'purchase_id', 'sale_id'],
    });

    if (!picking) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Picking not found' } },
        { status: 404 }
      );
    }

    // Call button_validate to validate the picking
    const result = await odoo.callKw('stock.picking', 'button_validate', [[pickingId]]);

    // Handle wizards if needed
    if (result && typeof result === 'object') {
      const actionResult = result as Record<string, unknown>;

      // Handle immediate transfer wizard
      if (actionResult.res_model === 'stock.immediate.transfer') {
        try {
          await odoo.callKw('stock.immediate.transfer', 'process', [[actionResult.res_id as number]]);
        } catch {
          console.log('[Picking Validate] Immediate transfer not needed or failed');
        }
      }

      // Handle backorder wizard
      if (actionResult.res_model === 'stock.backorder.confirmation') {
        try {
          await odoo.callKw('stock.backorder.confirmation', 'process', [[actionResult.res_id as number]]);
        } catch {
          console.log('[Picking Validate] Backorder confirmation not needed or failed');
        }
      }
    }

    // Auto-generate invoice based on picking type
    let invoiceId: number | null = null;
    let invoiceType: string | null = null;

    if (picking.picking_type_code === 'incoming' && picking.purchase_id) {
      // Purchase receipt -> Generate vendor bill
      const purchaseOrderId = Array.isArray(picking.purchase_id) ? picking.purchase_id[0] : null;
      if (purchaseOrderId) {
        invoiceId = await autoGenerateVendorBill(odoo, purchaseOrderId);
        invoiceType = 'vendor_bill';
      }
    } else if (picking.picking_type_code === 'outgoing' && picking.sale_id) {
      // Sales delivery -> Generate customer invoice
      const saleOrderId = Array.isArray(picking.sale_id) ? picking.sale_id[0] : null;
      if (saleOrderId) {
        invoiceId = await autoGenerateCustomerInvoice(odoo, saleOrderId);
        invoiceType = 'customer_invoice';
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        validated: true,
        invoiceGenerated: invoiceId !== null,
        invoiceId,
        invoiceType,
      },
    });
  } catch (error) {
    console.error('[Picking Validate Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to validate picking'
        }
      },
      { status: 500 }
    );
  }
}
