'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Wrench, Calendar, AlertCircle } from 'lucide-react';
import { useMaintenance } from '@/hooks/use-modules';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';

const priorityColors: Record<string, string> = {
  '0': 'text-gray-500',
  '1': 'text-blue-500',
  '2': 'text-yellow-500',
  '3': 'text-red-500',
};

export default function MaintenancePage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useMaintenance({ page, limit: 20 });

  const formatDate = (dateStr: string | null) => dateStr ? new Date(dateStr).toLocaleDateString('ja-JP') : '-';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">{t('nav.maintenance')}</h1>
      </div>

      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState icon="clipboard" title={t('maintenance.noItems')} />
      ) : (
        <>
          <div className="card divide-y divide-gray-100">
            {data.items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-gray-50">
                <div className="p-2 bg-yellow-50 rounded-lg">
                  <Wrench className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                    <span className="badge badge-info">{item.stageName}</span>
                    <AlertCircle className={`w-4 h-4 ${priorityColors[item.priority] || 'text-gray-400'}`} />
                  </div>
                  <p className="text-sm text-gray-500">{item.equipmentName}</p>
                </div>
                <div className="text-right text-sm">
                  <div className="flex items-center gap-1 text-gray-500">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(item.requestDate)}</span>
                  </div>
                  {item.scheduleDate && (
                    <p className="text-xs text-gray-400">{t('maintenance.scheduled')}: {formatDate(item.scheduleDate)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          <p className="text-center text-sm text-gray-500">{t('common.totalItems', { count: data.pagination.total })}</p>
        </>
      )}
    </div>
  );
}
