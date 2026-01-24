import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

/**
 * Payment Registration API - Compatible with Odoo 18
 * Registers payment for invoices/bills and reconciles them
 *
 * This uses Odoo's account.payment.register wizard to:
 * 1. Create a payment record
 * 2. Post the payment
 * 3. Reconcile with the invoice/bill
 */

interface RegisterPaymentRequest {
  invoiceIds: number[];  // account.move IDs to pay
  journalId?: number;    // Payment journal (bank/cash)
  paymentDate?: string;  // Payment date (defaults to today)
  amount?: number;       // Payment amount (defaults to invoice total)
  memo?: string;         // Payment reference/memo
}

interface AccountJournal {
  id: number;
  name: string;
  type: string;
  code: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const body: RegisterPaymentRequest = await request.json();
    const { invoiceIds, journalId, paymentDate, amount, memo } = body;

    if (!invoiceIds || invoiceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invoice IDs are required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Get invoice details to determine payment type
    const invoices = await odoo.searchRead<{
      id: number;
      move_type: string;
      amount_residual: number;
      partner_id: [number, string] | false;
      currency_id: [number, string] | false;
      company_id: [number, string] | false;
    }>('account.move', [['id', 'in', invoiceIds]], {
      fields: ['move_type', 'amount_residual', 'partner_id', 'currency_id', 'company_id'],
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Invoices not found' } },
        { status: 404 }
      );
    }

    // Determine payment type based on invoice type
    // out_invoice (customer invoice) -> inbound payment (receive money)
    // in_invoice (vendor bill) -> outbound payment (pay money)
    const invoice = invoices[0];
    const isCustomerInvoice = invoice.move_type === 'out_invoice' || invoice.move_type === 'out_refund';
    const paymentType = isCustomerInvoice ? 'inbound' : 'outbound';
    const partnerType = isCustomerInvoice ? 'customer' : 'supplier';

    // Get the invoice's company_id for multi-company support
    const invoiceCompanyId = (invoice as unknown as { company_id: [number, string] | false }).company_id;
    const companyId = Array.isArray(invoiceCompanyId) ? invoiceCompanyId[0] : 1;

    // Calculate total amount if not specified
    const paymentAmount = amount || invoices.reduce((sum, inv) => sum + (inv.amount_residual || 0), 0);

    // Get payment journal - must be in the same company as the invoice
    let paymentJournalId = journalId;
    if (paymentJournalId) {
      // Verify the journal belongs to the invoice's company
      const journalCheck = await odoo.searchRead<{ id: number; company_id: [number, string] | false }>(
        'account.journal',
        [['id', '=', paymentJournalId]],
        { fields: ['id', 'company_id'] }
      );
      if (journalCheck.length > 0) {
        const journalCompanyId = Array.isArray(journalCheck[0].company_id) ? journalCheck[0].company_id[0] : null;
        if (journalCompanyId !== companyId) {
          // Journal is in a different company, find one in the correct company
          paymentJournalId = undefined;
        }
      }
    }

    if (!paymentJournalId) {
      // Find bank or cash journal in the invoice's company
      const journals = await odoo.searchRead<AccountJournal>(
        'account.journal',
        [['type', 'in', ['bank', 'cash']], ['company_id', '=', companyId]],
        { fields: ['id', 'name', 'type', 'code'], limit: 1 }
      );
      if (journals.length > 0) {
        paymentJournalId = journals[0].id;
      } else {
        return NextResponse.json(
          { success: false, error: { code: 'CONFIG_ERROR', message: `No payment journal found for company ${companyId}` } },
          { status: 400 }
        );
      }
    }

    // Method 1: Use account.payment.register wizard (Odoo 18 recommended approach)
    try {
      // Create the payment register wizard context with proper company
      const context = {
        active_model: 'account.move',
        active_ids: invoiceIds,
        default_journal_id: paymentJournalId,
        default_company_id: companyId,
        allowed_company_ids: [companyId],
      };

      // First, get the default values from the wizard with the context
      // This ensures the wizard is properly initialized with the invoice data
      const defaultValues = await odoo.callKw(
        'account.payment.register',
        'default_get',
        [['journal_id', 'payment_date', 'amount', 'communication', 'payment_type', 'partner_type', 'partner_id', 'currency_id', 'line_ids']],
        { context }
      ) as Record<string, unknown>;

      // Merge our custom values with defaults
      const wizardData: Record<string, unknown> = {
        ...(defaultValues || {}),
        journal_id: paymentJournalId,
        payment_date: paymentDate || new Date().toISOString().split('T')[0],
        communication: memo || '',
      };

      // Only override amount if explicitly specified and different from default
      if (amount && amount !== (defaultValues?.amount as number)) {
        wizardData.amount = paymentAmount;
      }

      // Create wizard record with merged data
      const wizardId = await odoo.callKw(
        'account.payment.register',
        'create',
        [wizardData],
        { context }
      );

      // Execute the wizard to create and post payment (this also reconciles)
      const result = await odoo.callKw(
        'account.payment.register',
        'action_create_payments',
        [[wizardId]],
        { context }
      );

      return NextResponse.json({
        success: true,
        data: {
          message: isCustomerInvoice ? 'Payment received successfully' : 'Payment made successfully',
          wizardResult: result,
        },
      });
    } catch (wizardError) {
      console.error('[Payment Register] Wizard method failed, trying direct payment:', wizardError);

      // Method 2: Fallback - Create payment directly
      try {
        const partnerId = Array.isArray(invoice.partner_id) ? invoice.partner_id[0] : null;
        const currencyId = Array.isArray(invoice.currency_id) ? invoice.currency_id[0] : null;

        // Create payment record
        // Note: Odoo 18 uses 'memo' field instead of 'ref' for account.payment
        const paymentData: Record<string, unknown> = {
          payment_type: paymentType,
          partner_type: partnerType,
          partner_id: partnerId,
          amount: paymentAmount,
          journal_id: paymentJournalId,
          company_id: companyId,  // Ensure payment is in same company as invoice
          date: paymentDate || new Date().toISOString().split('T')[0],
          memo: memo || `Payment for ${invoiceIds.join(', ')}`,
        };

        if (currencyId) {
          paymentData.currency_id = currencyId;
        }

        // Create with proper company context
        const paymentId = await odoo.callKw<number>(
          'account.payment',
          'create',
          [paymentData],
          { context: { allowed_company_ids: [companyId], default_company_id: companyId } }
        );

        // Post the payment
        await odoo.callKw('account.payment', 'action_post', [[paymentId]]);

        // Try to reconcile with invoices using js_assign_outstanding_line
        try {
          // Get the payment's move lines (receivable/payable)
          const payment = await odoo.searchRead<{
            id: number;
            move_id: [number, string] | false;
          }>('account.payment', [['id', '=', paymentId]], {
            fields: ['move_id'],
          });

          if (payment.length > 0 && payment[0].move_id) {
            const paymentMoveId = payment[0].move_id[0];

            // Get the receivable/payable line from the payment move
            const accountType = isCustomerInvoice ? 'asset_receivable' : 'liability_payable';

            const paymentLines = await odoo.searchRead<{ id: number }>(
              'account.move.line',
              [
                ['move_id', '=', paymentMoveId],
                ['account_id.account_type', '=', accountType],
                ['reconciled', '=', false],
              ],
              { fields: ['id'] }
            );

            if (paymentLines.length > 0) {
              const paymentLineId = paymentLines[0].id;

              // Use js_assign_outstanding_line on each invoice to reconcile
              // This method is designed for web client use and works via XML-RPC
              // Note: Method returns None which causes XML-RPC serialization error, but reconciliation still works
              for (const invId of invoiceIds) {
                try {
                  await odoo.callKw('account.move', 'js_assign_outstanding_line', [[invId], paymentLineId], {
                    context: { allowed_company_ids: [companyId] }
                  });
                  console.log(`[Payment Register] Reconciled invoice ${invId} with payment line ${paymentLineId}`);
                } catch (assignError) {
                  // Check if error is just "cannot marshal None" - this means method succeeded but returned None
                  const errorMsg = String(assignError);
                  if (errorMsg.includes('cannot marshal None') || errorMsg.includes('dump_nil')) {
                    console.log(`[Payment Register] Reconciled invoice ${invId} (None return is expected)`);
                  } else {
                    console.log(`[Payment Register] js_assign_outstanding_line failed for invoice ${invId}:`, assignError);
                  }
                }
              }
            }
          }
        } catch (reconcileError) {
          console.log('[Payment Register] Auto-reconcile failed (payment still created):', reconcileError);
        }

        return NextResponse.json({
          success: true,
          data: {
            message: isCustomerInvoice ? 'Payment received successfully' : 'Payment made successfully',
            paymentId,
          },
        });
      } catch (directError) {
        console.error('[Payment Register] Direct payment method also failed:', directError);
        throw directError;
      }
    }
  } catch (error) {
    console.error('[Payment Register Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to register payment';
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: errorMessage } },
      { status: 500 }
    );
  }
}

// GET: Fetch available payment journals
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Check if invoiceId is provided to filter by company
    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get('invoiceId');

    let companyId: number | null = null;

    if (invoiceId) {
      // Get the invoice's company
      const invoices = await odoo.searchRead<{ id: number; company_id: [number, string] | false }>(
        'account.move',
        [['id', '=', parseInt(invoiceId)]],
        { fields: ['company_id'] }
      );
      if (invoices.length > 0 && invoices[0].company_id) {
        companyId = invoices[0].company_id[0];
      }
    }

    // Build domain - filter by company if available
    const domain: Array<[string, string, unknown]> = [['type', 'in', ['bank', 'cash']]];
    if (companyId) {
      domain.push(['company_id', '=', companyId]);
    }

    // Get bank and cash journals
    const journals = await odoo.searchRead<AccountJournal>(
      'account.journal',
      domain,
      { fields: ['id', 'name', 'type', 'code'], order: 'type, name' }
    );

    return NextResponse.json({
      success: true,
      data: {
        journals: journals.map(j => ({
          id: j.id,
          name: j.name,
          type: j.type,
          code: j.code,
        })),
      },
    });
  } catch (error) {
    console.error('[Payment Journals Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch journals' } },
      { status: 500 }
    );
  }
}
