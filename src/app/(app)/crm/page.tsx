'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Search, Users, Target, Mail, Phone, Calendar, BarChart3, Workflow, Bell } from 'lucide-react';
import { EmptyState, Pagination, SummaryBarSkeleton, ListSkeleton } from '@/components/ui';
import { CrmSummaryBar } from '@/components/crm/summary-bar';
import { PipelineChips } from '@/components/crm/pipeline-chips';
import { CrmFilterBar, type SortOption } from '@/components/crm/filter-bar';
import { OpportunityListItem } from '@/components/crm/opportunity-list-item';
import { ModuleGate } from '@/components/module-gate';
import type { ApiResponse } from '@/types';

// CRM Module Features for upgrade page
const CRM_FEATURES = [
  {
    icon: Users,
    titleZh: '客户管理',
    titleJa: '顧客管理',
    titleEn: 'Customer Management',
    descZh: '完整的客户信息管理，包括联系人、交易历史、沟通记录',
    descJa: '連絡先、取引履歴、コミュニケーション履歴を含む完全な顧客情報管理',
    descEn: 'Complete customer information including contacts, transactions, and communications',
  },
  {
    icon: Target,
    titleZh: '销售漏斗',
    titleJa: 'セールスファネル',
    titleEn: 'Sales Pipeline',
    descZh: '可视化销售流程，追踪商机从线索到成交的全过程',
    descJa: '見込み客から成約までの全プロセスを可視化し追跡',
    descEn: 'Visualize and track opportunities from lead to close',
  },
  {
    icon: Mail,
    titleZh: '邮件集成',
    titleJa: 'メール連携',
    titleEn: 'Email Integration',
    descZh: '自动同步客户邮件，追踪沟通历史',
    descJa: 'メールを自動同期し、コミュニケーション履歴を追跡',
    descEn: 'Automatically sync emails and track communication history',
  },
  {
    icon: Calendar,
    titleZh: '活动管理',
    titleJa: 'アクティビティ管理',
    titleEn: 'Activity Management',
    descZh: '计划和追踪销售活动，包括电话、会议、任务',
    descJa: '電話、会議、タスクを含む販売活動を計画・追跡',
    descEn: 'Plan and track sales activities including calls, meetings, and tasks',
  },
  {
    icon: BarChart3,
    titleZh: '销售分析',
    titleJa: '販売分析',
    titleEn: 'Sales Analytics',
    descZh: '深入分析销售数据，预测收入趋势',
    descJa: '販売データを詳細分析し、収益トレンドを予測',
    descEn: 'In-depth sales analysis and revenue forecasting',
  },
  {
    icon: Workflow,
    titleZh: '自动化工作流',
    titleJa: '自動化ワークフロー',
    titleEn: 'Automation',
    descZh: '自动分配线索、发送提醒、更新状态',
    descJa: 'リードの自動割当、リマインダー送信、ステータス更新',
    descEn: 'Automatically assign leads, send reminders, update status',
  },
  {
    icon: Phone,
    titleZh: '通话记录',
    titleJa: '通話記録',
    titleEn: 'Call Logging',
    descZh: '记录和追踪所有客户通话',
    descJa: 'すべての顧客通話を記録・追跡',
    descEn: 'Log and track all customer calls',
  },
  {
    icon: Bell,
    titleZh: '智能提醒',
    titleJa: 'スマートリマインダー',
    titleEn: 'Smart Reminders',
    descZh: '不错过任何跟进机会，智能提醒即将到期的商机',
    descJa: 'フォローアップを逃さない、期限が近い商談をスマートにリマインド',
    descEn: 'Never miss follow-ups with smart deadline reminders',
  },
];

const CRM_COMPARISON = [
  { feature: '客户联系人管理', basic: '-', premium: '✓' },
  { feature: '销售漏斗追踪', basic: '-', premium: '✓' },
  { feature: '商机管理', basic: '-', premium: '✓' },
  { feature: '活动日程', basic: '-', premium: '✓' },
  { feature: '邮件集成', basic: '-', premium: '✓' },
  { feature: '销售报表', basic: '-', premium: '✓' },
  { feature: '自动化工作流', basic: '-', premium: '✓' },
];

// Types
interface StageStats {
  id: number;
  name: string;
  sequence: number;
  count: number;
  expectedRevenue: number;
  isWon: boolean;
}

interface CrmItem {
  id: number;
  name: string;
  partnerName: string | null;
  email: string | null;
  phone: string | null;
  expectedRevenue: number;
  probability: number;
  stageId: number | null;
  stageName: string;
  userName: string | null;
  createdAt: string;
  deadline: string | null;
  activityDeadline: string | null;
  isOverdue: boolean;
  priority: string;
  type: string;
}

interface CrmData {
  kpi: {
    totalLeads: number;
    totalRevenue: number;
    wonRevenue: number;
    wonCount: number;
    newThisMonth: number;
    avgProbability: number;
  };
  stages: StageStats[];
  items: CrmItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// Map new sort options to API sort params
function mapSortToApi(sort: SortOption): string {
  const mapping: Record<SortOption, string> = {
    updated: 'date', // API uses 'date' for most recent
    revenue_desc: 'revenue',
    revenue_asc: 'revenue_asc',
    probability: 'probability',
    date: 'date',
  };
  return mapping[sort];
}

export default function CrmPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('updated');

  const { data, isLoading, error } = useQuery({
    queryKey: ['crm', page, search, activeStage, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      params.set('sort', mapSortToApi(sortBy));
      if (search) params.set('search', search);
      if (activeStage) params.set('stage_id', activeStage.toString());

      const res = await fetch(`/api/crm?${params}`);
      const json: ApiResponse<CrmData> = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data!;
    },
  });

  const kpi = data?.kpi || {
    totalLeads: 0,
    totalRevenue: 0,
    wonRevenue: 0,
    wonCount: 0,
    newThisMonth: 0,
    avgProbability: 0,
  };
  const stages = data?.stages || [];

  const handleStageChange = (stageId: number | null) => {
    setActiveStage(stageId);
    setPage(1);
  };

  const handleSortChange = (sort: SortOption) => {
    setSortBy(sort);
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleClearFilters = () => {
    setActiveStage(null);
    setSearch('');
    setSearchInput('');
    setPage(1);
  };

  const hasFilters = activeStage !== null || search !== '';

  return (
    <ModuleGate
      moduleCode="CRM"
      moduleNameZh="CRM 客户关系管理"
      moduleNameJa="CRM 顧客関係管理"
      descriptionZh="全面管理客户关系，追踪销售机会，提升转化率和客户满意度。"
      descriptionJa="顧客関係を包括的に管理し、販売機会を追跡、コンバージョン率と顧客満足度を向上。"
      priceMonthly={9800}
      features={CRM_FEATURES}
      comparisonItems={CRM_COMPARISON}
      heroGradient="from-sky-600 via-blue-600 to-indigo-700"
      moduleIcon={Users}
    >
    <div className="space-y-3">
      {/* Header - Title + Search + New Button */}
      <div className="flex items-center gap-3">
        <h1 className="page-title flex-shrink-0">{t('nav.crm')}</h1>

        {/* Compact Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xs">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('crm.searchPlaceholder')}
              className="input pl-9 h-9"
            />
          </div>
        </form>

        {/* New Opportunity Button */}
        <button className="btn btn-primary btn-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('crm.newOpportunity')}</span>
        </button>
      </div>

      {/* Summary Bar - Compact KPI */}
      <CrmSummaryBar
        totalLeads={kpi.totalLeads}
        expectedRevenue={kpi.totalRevenue}
        wonRevenue={kpi.wonRevenue}
        newThisMonth={kpi.newThisMonth}
        t={t}
      />

      {/* Pipeline Chips */}
      <PipelineChips
        stages={stages}
        totalCount={kpi.totalLeads}
        activeStage={activeStage}
        onStageChange={handleStageChange}
        t={t}
      />

      {/* Filter Bar */}
      <div className="flex items-center justify-between">
        <CrmFilterBar
          sortBy={sortBy}
          onSortChange={handleSortChange}
          t={t}
        />

        {/* Results count */}
        {data && (
          <span className="text-xs text-gray-500 tabular-nums">
            {data.pagination.total} {t('crm.deals')}
          </span>
        )}
      </div>

      {/* List Content */}
      {isLoading ? (
        <ListSkeleton count={5} />
      ) : error ? (
        <div className="bg-white rounded-lg border border-red-200 p-6 text-center text-red-600">
          {(error as Error).message}
        </div>
      ) : !data?.items.length ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <EmptyState
            icon="file"
            title={hasFilters ? t('crm.noFilterResults') : t('crm.noItems')}
            description={hasFilters ? t('crm.clearFiltersHint') : undefined}
          />
          {hasFilters && (
            <div className="text-center mt-4">
              <button
                onClick={handleClearFilters}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {t('crm.clearFilters')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200">
            {data.items.map((item) => (
              <OpportunityListItem
                key={item.id}
                id={item.id}
                name={item.name}
                partnerName={item.partnerName}
                email={item.email}
                expectedRevenue={item.expectedRevenue}
                probability={item.probability}
                stageName={item.stageName}
                userName={item.userName}
                createdAt={item.createdAt}
                priority={item.priority}
                isOverdue={item.isOverdue}
                t={t}
              />
            ))}
          </div>

          {data.pagination.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={data.pagination.totalPages}
              onPageChange={setPage}
            />
          )}

          <p className="text-center text-xs text-gray-500">
            {t('common.totalItems', { count: data.pagination.total })}
          </p>
        </>
      )}
    </div>
    </ModuleGate>
  );
}
