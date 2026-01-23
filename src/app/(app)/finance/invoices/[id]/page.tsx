'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  FileText,
  AlertCircle,
  Edit,
  Save,
  X,
  Pencil,
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import type { ApiResponse } from '@/types';
import { StickyActionBar, StickyActionBarContent } from '@/components/documents';

interface InvoiceLine {
  id: number;
  productId: number | null;
  productName: string;
  accountId: number | null;
  accountName: string;
  /** User-editable line name/description */
  name: string;
  quantity: number;
  priceUnit: number;
  subtotal: number;
  total: number;
  taxIds: number[];
  uom: string;
}

interface InvoiceDetail {
  id: number;
  name: string;
  /** User-editable document name (stored in ref) */
  displayName: string | null;
  partnerId: number | null;
  partnerName: string;
  invoiceDate: string | null;
  invoiceDateDue: string | null;
  amountTotal: number;
  amountResidual: number;
  amountUntaxed: number;
  amountTax: number;
  state: string;
  paymentState: string;
  moveType: string;
  invoiceOrigin: string | null;
  notes: string | null;
  userId: number | null;
  userName: string;
  currency: string;
  journalId: number | null;
  journalName: string;
  isOverdue: boolean;
  overdueDays: number;
  lines: InvoiceLine[];
}

// Format JPY with thousand separators
const formatJPY = (value: number): string => {
  const safeValue = isNaN(value) ? 0 : value;
  return `¥ ${safeValue.toLocaleString('ja-JP')}`;
};

const stateColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  posted: 'bg-blue-100 text-blue-800',
  cancel: 'bg-red-100 text-red-800',
};

const paymentStateColors: Record<string, string> = {
  not_paid: 'bg-orange-100 text-orange-800',
  partial: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  reversed: 'bg-gray-100 text-gray-800',
};

const moveTypeLabels: Record<string, string> = {
  out_invoice: 'finance.customerInvoice',
  out_refund: 'finance.creditNote',
  in_invoice: 'finance.vendorBill',
  in_refund: 'finance.vendorCredit',
};

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPosting, setIsPosting] = useState(false);
  const [showLines, setShowLines] = useState(true);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedDisplayName, setEditedDisplayName] = useState<string>('');

  // Fetch invoice details
  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const res = await fetch(`/api/finance/invoices/${id}`);
        const data: ApiResponse<InvoiceDetail> = await res.json();
        if (data.success && data.data) {
          setInvoice(data.data);
        } else {
          setError(data.error?.message || 'Failed to load invoice');
        }
      } catch {
        setError('Failed to load invoice');
      } finally {
        setIsLoading(false);
      }
    };
    fetchInvoice();
  }, [id]);

  const getStateLabel = (state: string) => {
    const labels: Record<string, string> = {
      draft: t('status.draft'),
      posted: t('finance.posted'),
      cancel: t('status.cancelled'),
    };
    return labels[state] || state;
  };

  const getPaymentStateLabel = (paymentState: string) => {
    const labels: Record<string, string> = {
      not_paid: t('finance.notPaid'),
      partial: t('finance.partiallyPaid'),
      paid: t('finance.paid'),
      reversed: t('finance.reversed'),
    };
    return labels[paymentState] || paymentState;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP');
  };

  // Enter edit mode
  const handleEnterEditMode = () => {
    if (!invoice) return;
    setEditedDisplayName(invoice.displayName || '');
    setEditMode(true);
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditMode(false);
  };

  // Save changes
  const handleSaveChanges = async () => {
    if (!invoice) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/finance/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editedDisplayName || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setInvoice((prev) => prev ? { ...prev, displayName: editedDisplayName || null } : null);
        setEditMode(false);
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      } else {
        alert(data.error?.message || 'Failed to save changes');
      }
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Post invoice
  const handlePost = async () => {
    if (!invoice || invoice.state !== 'draft') return;

    setIsPosting(true);
    try {
      const res = await fetch(`/api/finance/invoices/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post' }),
      });
      const data = await res.json();
      if (data.success) {
        setInvoice((prev) => prev ? { ...prev, state: 'posted' } : null);
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
      } else {
        alert(data.error?.message || 'Failed to post invoice');
      }
    } catch {
      alert('Failed to post invoice');
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 mb-4">
          <ArrowLeft className="w-5 h-5" />
          {t('common.back')}
        </button>
        <div className="card p-6 text-center text-red-600">{error || 'Invoice not found'}</div>
      </div>
    );
  }

  const canPost = invoice.state === 'draft';
  const canEdit = invoice.state === 'draft';
  const isCustomerInvoice = ['out_invoice', 'out_refund'].includes(invoice.moveType);

  return (
    <div className="pb-32 md:pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => editMode ? handleCancelEdit() : router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            {editMode ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
          <div className="flex-1 min-w-0">
            {/* Document Number */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-gray-900">{invoice.name}</h1>
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${stateColors[invoice.state] || 'bg-gray-100'}`}>
                {getStateLabel(invoice.state)}
              </span>
              {invoice.state === 'posted' && (
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${paymentStateColors[invoice.paymentState] || 'bg-gray-100'}`}>
                  {getPaymentStateLabel(invoice.paymentState)}
                </span>
              )}
            </div>
            {/* User-editable Display Name */}
            {editMode ? (
              <input
                type="text"
                value={editedDisplayName}
                onChange={(e) => setEditedDisplayName(e.target.value)}
                placeholder={t('documents.documentName')}
                maxLength={60}
                className="mt-1 w-full text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            ) : invoice.displayName ? (
              <p className="text-sm text-gray-600 truncate">{invoice.displayName}</p>
            ) : canEdit ? (
              <button
                onClick={handleEnterEditMode}
                className="mt-0.5 text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" />
                {t('documents.addName')}
              </button>
            ) : null}
          </div>
        </div>
        {/* Edit button for draft invoices */}
        {canEdit && !editMode && (
          <button
            onClick={handleEnterEditMode}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition min-w-[44px] min-h-[44px]"
          >
            <Edit className="w-4 h-4" />
            {t('common.edit')}
          </button>
        )}
      </div>

      {/* Type Badge */}
      <div className="mb-3">
        <span className="text-xs text-gray-500">
          {t(moveTypeLabels[invoice.moveType] || 'finance.invoice')}
        </span>
      </div>

      {/* Overdue Warning */}
      {invoice.isOverdue && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="text-sm text-red-700">
            {t('finance.overdueDays', { days: invoice.overdueDays })}
          </div>
        </div>
      )}

      {/* Invoice Info Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">{isCustomerInvoice ? t('finance.customer') : t('finance.vendor')}</div>
            <div className="font-medium text-gray-900">{invoice.partnerName}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t('finance.invoiceDate')}</div>
            <div className="font-medium text-gray-900">{formatDate(invoice.invoiceDate)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t('finance.dueDate')}</div>
            <div className={`font-medium ${invoice.isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
              {formatDate(invoice.invoiceDateDue)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t('finance.journal')}</div>
            <div className="font-medium text-gray-900">{invoice.journalName}</div>
          </div>
          {invoice.invoiceOrigin && (
            <div className="col-span-2">
              <div className="text-xs text-gray-500">{t('finance.origin')}</div>
              <div className="font-medium text-gray-900">{invoice.invoiceOrigin}</div>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Lines */}
      <div className="bg-white rounded-lg border border-gray-200 mb-3">
        <button
          onClick={() => setShowLines(!showLines)}
          className="w-full flex items-center justify-between p-4 text-left min-h-[44px]"
        >
          <span className="font-medium text-gray-900">{t('finance.invoiceLines')} ({invoice.lines.length})</span>
          {showLines ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {showLines && (
          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {invoice.lines.map((line) => (
              <div key={line.id} className="px-4 py-3">
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{line.productName || line.name}</div>
                    {line.name !== line.productName && (
                      <div className="text-xs text-gray-500 truncate">{line.name}</div>
                    )}
                  </div>
                  <div className="font-bold text-gray-900">{formatJPY(line.subtotal)}</div>
                </div>
                <div className="text-xs text-gray-500">
                  {t('documents.quantity')} {line.quantity} × {t('documents.unitPrice')} {formatJPY(line.priceUnit)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('order.subtotal')}</span>
            <span className="text-gray-900">{formatJPY(invoice.amountUntaxed)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('finance.tax')}</span>
            <span className="text-gray-900">{formatJPY(invoice.amountTax)}</span>
          </div>
          <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
            <span className="text-gray-900">{t('order.total')}</span>
            <span className="text-gray-900">{formatJPY(invoice.amountTotal)}</span>
          </div>
          {invoice.state === 'posted' && invoice.paymentState !== 'paid' && (
            <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
              <span className="text-orange-600 font-medium">{t('finance.amountDue')}</span>
              <span className="text-orange-600 font-bold">{formatJPY(invoice.amountResidual)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 mb-3">
          <div className="text-xs text-yellow-700 mb-1">{t('order.note')}</div>
          <div className="text-sm text-yellow-900 whitespace-pre-wrap">{invoice.notes}</div>
        </div>
      )}

      {/* Sticky Bottom Bar with safe-area-inset-bottom support */}
      <StickyActionBar>
        <StickyActionBarContent>
          {editMode ? (
            /* Edit mode buttons */
            <div className="flex gap-2">
              <button
                onClick={handleCancelEdit}
                className="flex-1 btn bg-gray-100 text-gray-700 hover:bg-gray-200 py-3 flex items-center justify-center gap-2 min-h-[44px]"
              >
                <X className="w-5 h-5" />
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="flex-1 btn btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    {t('common.save')}
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Normal mode buttons */
            <div className="flex gap-2">
              {canPost && (
                <button
                  onClick={handlePost}
                  disabled={isPosting}
                  className="flex-1 btn btn-primary py-3 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {isPosting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      {t('finance.post')}
                    </>
                  )}
                </button>
              )}

              {invoice.state === 'posted' && (
                <div className="flex-1 text-center py-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${paymentStateColors[invoice.paymentState]}`}>
                    {getPaymentStateLabel(invoice.paymentState)}
                  </span>
                </div>
              )}

              {invoice.state === 'cancel' && (
                <div className="flex-1 text-center text-gray-500 py-3">
                  {t('status.cancelled')}
                </div>
              )}
            </div>
          )}
        </StickyActionBarContent>
      </StickyActionBar>
    </div>
  );
}
