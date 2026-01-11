'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, X, FileText, ShoppingBag, Loader2 } from 'lucide-react';
import { useApprovals, useApprovalAction } from '@/hooks/use-approvals';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';

const typeIcons: Record<string, typeof FileText> = {
  expense: FileText,
  purchase: ShoppingBag,
};

const typeColors: Record<string, string> = {
  expense: 'bg-orange-50 text-orange-600',
  purchase: 'bg-blue-50 text-blue-600',
};

export default function ApprovalsPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>('all');
  const [processingId, setProcessingId] = useState<number | null>(null);

  const { data, isLoading, error } = useApprovals({
    type: type === 'all' ? undefined : type,
    page,
    limit: 20,
  });

  const approvalAction = useApprovalAction();

  const formatPrice = (price: number | null) => {
    if (price === null) return '-';
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(price);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const handleAction = async (id: number, model: string, action: 'approve' | 'reject') => {
    setProcessingId(id);
    try {
      await approvalAction.mutateAsync({ id, model, action });
    } catch (err) {
      console.error('Approval action failed:', err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="page-title">{t('nav.approvals')}</h1>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="input w-auto"
        >
          <option value="all">{t('common.all')}</option>
          <option value="expense">{t('approvals.expense')}</option>
          <option value="purchase">{t('approvals.purchase')}</option>
        </select>
      </div>

      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">
          {t('common.error')}: {(error as Error).message}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon="clipboard"
          title={t('approvals.noItems')}
          description={t('approvals.noItemsDesc')}
        />
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((item) => {
              const Icon = typeIcons[item.type] || FileText;
              const isProcessing = processingId === item.id;

              return (
                <div key={`${item.model}-${item.id}`} className="card p-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${typeColors[item.type] || 'bg-gray-50 text-gray-600'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                        <span className="badge badge-info text-xs">
                          {t(`approvals.${item.type}`)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{item.requester}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(item.date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 mb-2">
                        {formatPrice(item.amount)}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(item.id, item.model, 'reject')}
                          disabled={isProcessing}
                          className="p-2 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors disabled:opacity-50"
                          title={t('approvals.reject')}
                        >
                          {isProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleAction(item.id, item.model, 'approve')}
                          disabled={isProcessing}
                          className="p-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                          title={t('approvals.approve')}
                        >
                          {isProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            page={page}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
          />

          <p className="text-center text-sm text-gray-500">
            {t('common.totalItems', { count: data.pagination.total })}
          </p>
        </>
      )}
    </div>
  );
}
