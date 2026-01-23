'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, CreditCard, Banknote, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse } from '@/types';

interface PaymentJournal {
  id: number;
  name: string;
  type: 'bank' | 'cash';
  code: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: number;
  invoiceName: string;
  partnerName: string;
  amount: number;
  currency?: string;
  type: 'inbound' | 'outbound'; // inbound = receive (sales), outbound = pay (purchase)
  onSuccess?: () => void;
}

export function PaymentModal({
  isOpen,
  onClose,
  invoiceId,
  invoiceName,
  partnerName,
  amount,
  currency = 'JPY',
  type,
  onSuccess,
}: PaymentModalProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [selectedJournalId, setSelectedJournalId] = useState<number | null>(null);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentAmount, setPaymentAmount] = useState(amount);
  const [memo, setMemo] = useState('');

  // Reset form when modal opens with new invoice
  useEffect(() => {
    if (isOpen) {
      setPaymentAmount(amount);
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setMemo('');
    }
  }, [isOpen, amount]);

  // Fetch available payment journals
  const { data: journalsData, isLoading: isLoadingJournals } = useQuery({
    queryKey: ['payment-journals'],
    queryFn: async () => {
      const res = await fetch('/api/finance/payments/register');
      const data: ApiResponse<{ journals: PaymentJournal[] }> = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch journals');
      return data.data!.journals;
    },
    enabled: isOpen,
  });

  // Set default journal when data loads
  useEffect(() => {
    if (journalsData && journalsData.length > 0 && !selectedJournalId) {
      // Prefer cash journal for quick payments
      const cashJournal = journalsData.find(j => j.type === 'cash');
      setSelectedJournalId(cashJournal?.id || journalsData[0].id);
    }
  }, [journalsData, selectedJournalId]);

  // Register payment mutation
  const registerPayment = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/finance/payments/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceIds: [invoiceId],
          journalId: selectedJournalId,
          paymentDate,
          amount: paymentAmount,
          memo,
        }),
      });
      const data: ApiResponse<{ message: string }> = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to register payment');
      return data.data!;
    },
    onSuccess: () => {
      // Invalidate related queries - use correct query keys matching page queries
      queryClient.invalidateQueries({ queryKey: ['purchase'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['finance-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-payments'] });

      // Call success callback after short delay
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    },
  });

  if (!isOpen) return null;

  const isInbound = type === 'inbound';
  const title = isInbound
    ? (t('payment.confirmReceipt') || '确认收款')
    : (t('payment.confirmPayment') || '确认付款');
  const actionText = isInbound
    ? (t('payment.receivePayment') || '确认收款')
    : (t('payment.makePayment') || '确认付款');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 ${isInbound ? 'bg-green-600' : 'bg-blue-600'} text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isInbound ? (
                <Banknote className="w-6 h-6" />
              ) : (
                <CreditCard className="w-6 h-6" />
              )}
              <h2 className="text-lg font-semibold">{title}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-lg transition"
              disabled={registerPayment.isPending}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success State */}
        {registerPayment.isSuccess && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isInbound ? (t('payment.receiptSuccess') || '收款成功') : (t('payment.paymentSuccess') || '付款成功')}
            </h3>
            <p className="text-gray-500">
              {t('payment.invoiceReconciled') || '账单已核销'}
            </p>
          </div>
        )}

        {/* Error State */}
        {registerPayment.isError && (
          <div className="p-6">
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">{t('payment.error') || '操作失败'}</p>
                <p className="text-sm text-red-600 mt-1">
                  {(registerPayment.error as Error)?.message || t('common.error')}
                </p>
              </div>
            </div>
            <button
              onClick={() => registerPayment.reset()}
              className="w-full py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
            >
              {t('common.retry') || '重试'}
            </button>
          </div>
        )}

        {/* Form */}
        {!registerPayment.isSuccess && !registerPayment.isError && (
          <>
            <div className="p-6 space-y-4">
              {/* Invoice Info */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm text-gray-500">{t('payment.invoice') || '账单'}</span>
                  <span className="font-mono text-sm">{invoiceName}</span>
                </div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm text-gray-500">{t('payment.partner') || '往来单位'}</span>
                  <span className="text-sm font-medium text-gray-900 text-right max-w-[60%] truncate">
                    {partnerName}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <span className="text-sm text-gray-500">
                    {isInbound ? (t('payment.amountToReceive') || '应收金额') : (t('payment.amountToPay') || '应付金额')}
                  </span>
                  <span className={`text-lg font-bold ${isInbound ? 'text-green-600' : 'text-blue-600'}`}>
                    ¥{amount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Payment Journal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payment.paymentMethod') || '付款方式'}
                </label>
                {isLoadingJournals ? (
                  <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {journalsData?.map((journal) => (
                      <button
                        key={journal.id}
                        type="button"
                        onClick={() => setSelectedJournalId(journal.id)}
                        className={`flex items-center gap-2 p-3 rounded-lg border-2 transition ${
                          selectedJournalId === journal.id
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {journal.type === 'cash' ? (
                          <Banknote className={`w-5 h-5 ${selectedJournalId === journal.id ? 'text-blue-600' : 'text-gray-400'}`} />
                        ) : (
                          <CreditCard className={`w-5 h-5 ${selectedJournalId === journal.id ? 'text-blue-600' : 'text-gray-400'}`} />
                        )}
                        <span className={`text-sm font-medium ${selectedJournalId === journal.id ? 'text-blue-600' : 'text-gray-700'}`}>
                          {journal.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payment.paymentDate') || '付款日期'}
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Payment Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payment.paymentAmount') || '付款金额'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">¥</span>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Memo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('payment.memo') || '备注'} <span className="text-gray-400 font-normal">({t('common.optional') || '可选'})</span>
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={t('payment.memoPlaceholder') || '付款备注...'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={registerPayment.isPending}
                className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition disabled:opacity-50"
              >
                {t('common.cancel') || '取消'}
              </button>
              <button
                type="button"
                onClick={() => registerPayment.mutate()}
                disabled={registerPayment.isPending || !selectedJournalId}
                className={`flex-1 py-2.5 px-4 rounded-lg text-white font-medium transition disabled:opacity-50 flex items-center justify-center gap-2 ${
                  isInbound
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {registerPayment.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('common.processing') || '处理中...'}
                  </>
                ) : (
                  actionText
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
