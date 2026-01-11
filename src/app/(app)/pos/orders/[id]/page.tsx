'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Receipt, User, Calendar, CreditCard, MapPin,
  FileText, AlertCircle, Check, X, Clock
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import type { ApiResponse, PosOrder, PosOrderLine } from '@/types';

interface OrderDetail extends PosOrder {
  order_lines: PosOrderLine[];
  pos_reference?: string;
  note?: string;
  table_id?: [number, string] | false;
  user_id?: [number, string];
  amount_return?: number;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const orderId = params.id as string;

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['pos-order', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/pos/orders/${orderId}`);
      const data: ApiResponse<OrderDetail> = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch order');
      return data.data!;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await fetch(`/api/pos/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', note }),
      });
      const data: ApiResponse<PosOrder> = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to cancel order');
      return data.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['pos-orders'] });
      setShowCancelModal(false);
    },
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(price);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusConfig = (state: string) => {
    const configs: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
      draft: { color: 'text-gray-700', bg: 'bg-gray-100', icon: <Clock className="w-4 h-4" />, label: t('status.draft') },
      paid: { color: 'text-green-700', bg: 'bg-green-100', icon: <Check className="w-4 h-4" />, label: t('status.paid') },
      done: { color: 'text-green-700', bg: 'bg-green-100', icon: <Check className="w-4 h-4" />, label: t('status.done') },
      invoiced: { color: 'text-blue-700', bg: 'bg-blue-100', icon: <FileText className="w-4 h-4" />, label: t('status.invoiced') },
      cancel: { color: 'text-red-700', bg: 'bg-red-100', icon: <X className="w-4 h-4" />, label: t('status.cancelled') },
    };
    return configs[state] || configs.draft;
  };

  if (isLoading) {
    return <Loading text={t('common.loading')} />;
  }

  if (error || !order) {
    return (
      <div className="card p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-600">{(error as Error)?.message || t('common.error')}</p>
        <button onClick={() => router.back()} className="btn btn-primary mt-4">
          {t('common.back')}
        </button>
      </div>
    );
  }

  const statusConfig = getStatusConfig(order.state);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="page-title">{order.name}</h1>
          <p className="text-sm text-gray-500">{order.pos_reference}</p>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 ${statusConfig.bg} ${statusConfig.color}`}>
          {statusConfig.icon}
          {statusConfig.label}
        </span>
      </div>

      {/* Order Info */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <h2 className="font-medium text-gray-900">{t('order.info')}</h2>

          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">{formatDate(order.date_order)}</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">
              {order.partner_id ? order.partner_id[1] : t('pos.walkIn')}
            </span>
          </div>

          {order.table_id && (
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{order.table_id[1]}</span>
            </div>
          )}

          {order.user_id && (
            <div className="flex items-center gap-3 text-sm">
              <Receipt className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{t('order.cashier')}: {order.user_id[1]}</span>
            </div>
          )}
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="font-medium text-gray-900">{t('order.payment')}</h2>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('order.subtotal')}</span>
            <span className="font-medium">{formatPrice(order.amount_total - order.amount_tax)}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('pos.tax')}</span>
            <span className="font-medium">{formatPrice(order.amount_tax)}</span>
          </div>

          <div className="flex justify-between text-base pt-2 border-t border-gray-100">
            <span className="font-medium text-gray-900">{t('order.total')}</span>
            <span className="font-bold text-blue-600">{formatPrice(order.amount_total)}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t('order.paid')}</span>
            <span className="font-medium text-green-600">{formatPrice(order.amount_paid)}</span>
          </div>

          {order.amount_return && order.amount_return > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t('order.change')}</span>
              <span className="font-medium">{formatPrice(order.amount_return)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Order Lines */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900">{t('order.items')}</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {order.order_lines?.map((line) => (
            <div key={line.id} className="p-4 flex items-start gap-4">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">
                  {line.full_product_name || (line.product_id ? line.product_id[1] : '')}
                </h3>
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                  <span>{formatPrice(line.price_unit)}</span>
                  <span>×</span>
                  <span>{line.qty}</span>
                  {line.discount > 0 && (
                    <span className="text-red-600">(-{line.discount}%)</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-900">{formatPrice(line.price_subtotal_incl)}</p>
              </div>
            </div>
          ))}

          {(!order.order_lines || order.order_lines.length === 0) && (
            <div className="p-6 text-center text-gray-500">
              {t('order.noItems')}
            </div>
          )}
        </div>
      </div>

      {/* Note */}
      {order.note && (
        <div className="card p-4">
          <h2 className="font-medium text-gray-900 mb-2">{t('order.note')}</h2>
          <p className="text-gray-600">{order.note}</p>
        </div>
      )}

      {/* Actions */}
      {order.state !== 'cancel' && order.state !== 'done' && (
        <div className="flex gap-3">
          <button
            onClick={() => setShowCancelModal(true)}
            className="btn bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            {t('pos.cancelOrder')}
          </button>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('order.cancelTitle')}</h2>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-gray-600">{t('order.cancelConfirm')}</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('order.cancelReason')}
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="input w-full h-24"
                  placeholder={t('order.cancelReasonPlaceholder')}
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="btn btn-secondary"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => cancelMutation.mutate(cancelReason)}
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? t('common.loading') : t('order.confirmCancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
