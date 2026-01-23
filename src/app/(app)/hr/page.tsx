'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { User, Mail, Phone, Briefcase, Calendar, Wallet, FileText, UserCog, Calculator, Clock, Shield, BarChart3, FileCheck, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { ModuleGate } from '@/components/module-gate';

// HR Module Features for upgrade page
const HR_FEATURES = [
  {
    icon: Users,
    titleZh: '员工档案',
    titleJa: '従業員情報',
    titleEn: 'Employee Records',
    descZh: '完整的员工信息管理，包括个人资料、合同、证件',
    descJa: '個人情報、契約、資格を含む完全な従業員情報管理',
    descEn: 'Complete employee information including personal data, contracts, and credentials',
  },
  {
    icon: Calculator,
    titleZh: '工资计算',
    titleJa: '給与計算',
    titleEn: 'Payroll Calculation',
    descZh: '自动计算工资，支持多种薪资结构和税务规则',
    descJa: '複数の給与体系と税規則に対応した自動給与計算',
    descEn: 'Automatic payroll with multiple pay structures and tax rules',
  },
  {
    icon: FileText,
    titleZh: '工资单管理',
    titleJa: '給与明細管理',
    titleEn: 'Payslip Management',
    descZh: '生成和管理工资单，支持在线查看和下载',
    descJa: '給与明細の作成・管理、オンライン閲覧とダウンロード対応',
    descEn: 'Generate and manage payslips with online viewing and download',
  },
  {
    icon: Clock,
    titleZh: '考勤管理',
    titleJa: '勤怠管理',
    titleEn: 'Attendance Tracking',
    descZh: '追踪员工出勤、加班、请假记录',
    descJa: '出勤、残業、休暇記録を追跡',
    descEn: 'Track attendance, overtime, and leave records',
  },
  {
    icon: Calendar,
    titleZh: '假期管理',
    titleJa: '休暇管理',
    titleEn: 'Leave Management',
    descZh: '管理年假、病假、特殊假期申请和审批',
    descJa: '年次休暇、病気休暇、特別休暇の申請と承認を管理',
    descEn: 'Manage annual, sick, and special leave requests and approvals',
  },
  {
    icon: Shield,
    titleZh: '社保管理',
    titleJa: '社会保険管理',
    titleEn: 'Benefits Management',
    descZh: '管理社保、公积金等员工福利',
    descJa: '社会保険、積立金などの従業員福利厚生を管理',
    descEn: 'Manage social insurance and employee benefits',
  },
  {
    icon: BarChart3,
    titleZh: '人事报表',
    titleJa: 'HRレポート',
    titleEn: 'HR Reports',
    descZh: '生成人事分析报表，了解人力资源状况',
    descJa: '人事分析レポートを生成し、人材リソースの状況を把握',
    descEn: 'Generate HR analytics reports for workforce insights',
  },
  {
    icon: FileCheck,
    titleZh: '合规管理',
    titleJa: 'コンプライアンス',
    titleEn: 'Compliance',
    descZh: '确保薪资发放符合当地法规要求',
    descJa: '給与支払いが現地の法規制に準拠していることを確認',
    descEn: 'Ensure payroll complies with local regulations',
  },
];

const HR_COMPARISON = [
  { feature: '员工信息管理', basic: '-', premium: '✓' },
  { feature: '工资单生成', basic: '-', premium: '✓' },
  { feature: '自动工资计算', basic: '-', premium: '✓' },
  { feature: '考勤记录', basic: '-', premium: '✓' },
  { feature: '假期管理', basic: '-', premium: '✓' },
  { feature: '社保管理', basic: '-', premium: '✓' },
  { feature: '人事报表', basic: '-', premium: '✓' },
];

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
    <ModuleGate
      moduleCode="HR"
      moduleNameZh="工资与人事管理"
      moduleNameJa="給与・人事管理"
      descriptionZh="全面的员工管理和薪资计算系统，简化人事工作流程。"
      descriptionJa="包括従業員管理と給与計算を簡素化する包括的なHRシステム。"
      priceMonthly={6800}
      features={HR_FEATURES}
      comparisonItems={HR_COMPARISON}
      heroGradient="from-purple-600 via-pink-600 to-rose-600"
      moduleIcon={UserCog}
    >
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
    </ModuleGate>
  );
}
