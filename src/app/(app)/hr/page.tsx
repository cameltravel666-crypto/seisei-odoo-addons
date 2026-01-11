'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { User, Mail, Phone, Briefcase, Calendar, Wallet, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';

type ViewType = 'employees' | 'payslips';

interface Employee {
  id: number;
  name: string;
  jobTitle: string | null;
  departmentName: string | null;
  email: string | null;
  phone: string | null;
}

interface Payslip {
  id: number;
  name: string;
  reference: string;
  employeeName: string;
  employeeId: number;
  dateFrom: string;
  dateTo: string;
  state: string;
  companyName: string | null;
  netWage: number;
  basicWage: number;
  grossWage: number;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(price);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStateLabel(state: string, t: ReturnType<typeof useTranslations>) {
  const stateMap: Record<string, { label: string; color: string }> = {
    draft: { label: t('status.draft'), color: 'bg-gray-100 text-gray-700' },
    verify: { label: t('hr.toVerify'), color: 'bg-yellow-100 text-yellow-700' },
    done: { label: t('status.done'), color: 'bg-green-100 text-green-700' },
    cancel: { label: t('status.cancelled'), color: 'bg-red-100 text-red-700' },
  };
  return stateMap[state] || { label: state, color: 'bg-gray-100 text-gray-700' };
}

export default function HrPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<ViewType>('employees');

  const { data, isLoading, error } = useQuery({
    queryKey: ['hr', view, page, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        view,
      });
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/hr?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('nav.hr')}</h1>

      {/* View Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => { setView('employees'); setPage(1); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
            view === 'employees'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            {t('hr.employees')}
          </div>
        </button>
        <button
          onClick={() => { setView('payslips'); setPage(1); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
            view === 'payslips'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {t('hr.payslips')}
          </div>
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('common.search')}
          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </form>

      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState icon="file" title={view === 'employees' ? t('hr.noEmployees') : t('hr.noPayslips')} />
      ) : view === 'employees' ? (
        // Employees Grid
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data.items as Employee[]).map((item) => (
              <div key={item.id} className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                    {item.jobTitle && <p className="text-sm text-gray-500 truncate">{item.jobTitle}</p>}
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {item.departmentName && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Briefcase className="w-4 h-4" />
                      <span>{item.departmentName}</span>
                    </div>
                  )}
                  {item.email && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{item.email}</span>
                    </div>
                  )}
                  {item.phone && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Phone className="w-4 h-4" />
                      <span>{item.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          <p className="text-center text-sm text-gray-500">{t('common.totalItems', { count: data.pagination.total })}</p>
        </>
      ) : (
        // Payslips List
        <>
          <div className="space-y-3">
            {(data.items as Payslip[]).map((item) => {
              const stateInfo = getStateLabel(item.state, t);
              return (
                <div key={item.id} className="card p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{item.employeeName}</h3>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-500 font-mono">{item.reference}</p>
                          {item.companyName && (
                            <span className="text-xs text-gray-400">· {item.companyName}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${stateInfo.color}`}>
                      {stateInfo.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(item.dateFrom)} ~ {formatDate(item.dateTo)}</span>
                    </div>
                    <div className="text-right">
                      {item.netWage > 0 ? (
                        <>
                          <p className="text-lg font-bold text-green-600">{formatPrice(item.netWage)}</p>
                          <p className="text-xs text-gray-500">{t('hr.netWage')}</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400">{t('hr.pendingCalculation')}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          <p className="text-center text-sm text-gray-500">{t('common.totalItems', { count: data.pagination.total })}</p>
        </>
      )}
    </div>
  );
}
