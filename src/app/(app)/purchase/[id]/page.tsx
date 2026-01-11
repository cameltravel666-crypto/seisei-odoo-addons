'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Mail,
  FileText,
  Share2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import type { ApiResponse } from '@/types';

interface OrderLine {
  id: number;
  productId: number | null;
  productName: string;
  description: string;
  quantity: number;
  qtyReceived: number;
  priceUnit: number;
  subtotal: number;
  uom: string;
}

interface PurchaseOrderDetail {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string;
  dateOrder: string;
  dateApprove: string | null;
  amountTotal: number;
  amountUntaxed: number;
  amountTax: number;
  state: string;
  notes: string | null;
  userId: number | null;
  userName: string;
  currency: string;
  lines: OrderLine[];
}

// Format JPY with thousand separators
const formatJPY = (value: number): string => {
  const safeValue = isNaN(value) ? 0 : value;
  return `¥ ${safeValue.toLocaleString('ja-JP')}`;
};

const stateColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-yellow-100 text-yellow-800',
  'to approve': 'bg-yellow-100 text-yellow-800',
  purchase: 'bg-green-100 text-green-800',
  done: 'bg-green-100 text-green-800',
  cancel: 'bg-red-100 text-red-800',
};

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [order, setOrder] = useState<PurchaseOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showLines, setShowLines] = useState(true);

  // Fetch order details
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/purchase/${id}`);
        const data: ApiResponse<PurchaseOrderDetail> = await res.json();
        if (data.success && data.data) {
          setOrder(data.data);
        } else {
          setError(data.error?.message || 'Failed to load order');
        }
      } catch {
        setError('Failed to load order');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrder();
  }, [id]);

  const getStatusLabel = (state: string) => {
    const labels: Record<string, string> = {
      draft: t('status.draft'),
      sent: t('status.sent'),
      'to approve': t('status.toApprove'),
      purchase: t('status.confirmed'),
      done: t('status.done'),
      cancel: t('status.cancelled'),
    };
    return labels[state] || state;
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ja-JP');

  // Confirm order
  const handleConfirm = async () => {
    if (!order || order.state !== 'draft') return;

    setIsConfirming(true);
    try {
      const res = await fetch(`/api/purchase/${id}/confirm`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setOrder((prev) => prev ? { ...prev, state: 'purchase' } : null);
        queryClient.invalidateQueries({ queryKey: ['purchase'] });
      } else {
        alert(data.error?.message || 'Failed to confirm order');
      }
    } catch {
      alert('Failed to confirm order');
    } finally {
      setIsConfirming(false);
      setShowActions(false);
    }
  };

  // Send email via Odoo
  const handleSendEmail = async () => {
    if (!order) return;

    setIsEmailing(true);
    try {
      const res = await fetch(`/api/purchase/${id}/email`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Update order state if needed
        if (order.state === 'draft') {
          setOrder((prev) => prev ? { ...prev, state: 'sent' } : null);
        }
        // Show success message
        alert(t('common.success') + ': ' + (data.data?.message || 'Email sent'));
        queryClient.invalidateQueries({ queryKey: ['purchase'] });
      } else {
        alert(data.error?.message || 'Failed to send email');
      }
    } catch {
      alert('Failed to send email');
    } finally {
      setIsEmailing(false);
      setShowActions(false);
    }
  };

  // Generate and share PDF
  const handleSharePdf = async () => {
    if (!order) return;

    setIsGeneratingPdf(true);
    try {
      const res = await fetch(`/api/purchase/${id}/pdf`);
      const data = await res.json();

      if (data.success && data.data?.html) {
        // Create a blob from HTML and share
        const blob = new Blob([data.data.html], { type: 'text/html' });

        // Check if Web Share API is available
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], `${data.data.filename}.html`, { type: 'text/html' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `発注書: ${order.name}`,
              text: `${order.partnerName} への発注書 ${order.name}`,
              files: [file],
            });
          } else {
            // Fallback: open in new window for print/save
            openPrintWindow(data.data.html, data.data.filename);
          }
        } else {
          // Fallback: open in new window for print/save
          openPrintWindow(data.data.html, data.data.filename);
        }
      } else {
        alert(data.error?.message || 'Failed to generate PDF');
      }
    } catch {
      alert('Failed to generate PDF');
    } finally {
      setIsGeneratingPdf(false);
      setShowActions(false);
    }
  };

  const openPrintWindow = (html: string, filename: string) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      // Add print button
      const printBtn = printWindow.document.createElement('button');
      printBtn.textContent = 'PDF保存 / 印刷';
      printBtn.style.cssText = 'position: fixed; top: 10px; right: 10px; padding: 10px 20px; background: #4F46E5; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; z-index: 1000;';
      printBtn.onclick = () => {
        printBtn.style.display = 'none';
        printWindow.print();
        printBtn.style.display = 'block';
      };
      printWindow.document.body.appendChild(printBtn);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 mb-4">
          <ArrowLeft className="w-5 h-5" />
          {t('common.back')}
        </button>
        <div className="card p-6 text-center text-red-600">{error || 'Order not found'}</div>
      </div>
    );
  }

  const canConfirm = order.state === 'draft' || order.state === 'sent';
  const canSendEmail = order.state !== 'cancel';
  const canSharePdf = order.state === 'purchase' || order.state === 'done';

  return (
    <div className="pb-32 md:pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{order.name}</h1>
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${stateColors[order.state] || 'bg-gray-100'}`}>
              {getStatusLabel(order.state)}
            </span>
          </div>
        </div>
      </div>

      {/* Order Info Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">{t('purchase.supplier')}</div>
            <div className="font-medium text-gray-900">{order.partnerName}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">{t('purchase.orderDate')}</div>
            <div className="font-medium text-gray-900">{formatDate(order.dateOrder)}</div>
          </div>
          {order.dateApprove && (
            <div>
              <div className="text-xs text-gray-500">承認日</div>
              <div className="font-medium text-gray-900">{formatDate(order.dateApprove)}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-500">担当者</div>
            <div className="font-medium text-gray-900">{order.userName}</div>
          </div>
        </div>
      </div>

      {/* Order Lines */}
      <div className="bg-white rounded-lg border border-gray-200 mb-3">
        <button
          onClick={() => setShowLines(!showLines)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="font-medium text-gray-900">{t('purchase.orderLines')} ({order.lines.length})</span>
          {showLines ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {showLines && (
          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {order.lines.map((line) => (
              <div key={line.id} className="px-4 py-3">
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{line.productName}</div>
                  </div>
                  <div className="font-bold text-gray-900">{formatJPY(line.subtotal)}</div>
                </div>
                <div className="text-xs text-gray-500">
                  {t('purchase.quantity')} {line.quantity} × {t('purchase.unitPrice')} {formatJPY(line.priceUnit)}
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
            <span className="text-gray-900">{formatJPY(order.amountUntaxed)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">消費税</span>
            <span className="text-gray-900">{formatJPY(order.amountTax)}</span>
          </div>
          <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
            <span className="text-gray-900">{t('order.total')}</span>
            <span className="text-gray-900">{formatJPY(order.amountTotal)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 mb-3">
          <div className="text-xs text-yellow-700 mb-1">{t('order.note')}</div>
          <div className="text-sm text-yellow-900 whitespace-pre-wrap">{order.notes}</div>
        </div>
      )}

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 bg-white border-t border-gray-200 z-40">
        <div className="px-4 py-3">
          {/* Action buttons */}
          <div className="flex gap-2">
            {canConfirm && (
              <button
                onClick={handleConfirm}
                disabled={isConfirming}
                className="flex-1 btn btn-primary py-3 flex items-center justify-center gap-2"
              >
                {isConfirming ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    {t('status.confirmed')}
                  </>
                )}
              </button>
            )}

            {canSendEmail && (
              <button
                onClick={handleSendEmail}
                disabled={isEmailing}
                className="flex-1 btn bg-blue-600 text-white hover:bg-blue-700 py-3 flex items-center justify-center gap-2"
              >
                {isEmailing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Mail className="w-5 h-5" />
                    {t('purchase.sendEmail')}
                  </>
                )}
              </button>
            )}

            {canSharePdf && (
              <button
                onClick={handleSharePdf}
                disabled={isGeneratingPdf}
                className="flex-1 btn bg-gray-800 text-white hover:bg-gray-900 py-3 flex items-center justify-center gap-2"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Share2 className="w-5 h-5" />
                    {t('purchase.sharePdf')}
                  </>
                )}
              </button>
            )}

            {order.state === 'cancel' && (
              <div className="flex-1 text-center text-gray-500 py-3">
                {t('status.cancelled')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
