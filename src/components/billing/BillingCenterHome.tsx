'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Receipt,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Wallet,
  ClipboardList,
} from 'lucide-react';
import { KpiCard, KpiCardGrid, KpiCardSkeleton } from '@/components/ui/kpi-card';
import { CreateEntryModal } from './CreateEntryModal';
import { LoginCTARequestModal } from './LoginCTARequestModal';

// Types
export interface BillingKpis {
  arOpenCount: number;        // 未回収（売上側）件数
  arOverdueCount: number;     // 売上側 期限超過件数
  arBalance: number;          // 売掛残高
  apOpenCount: number;        // 未払（仕入側）件数
  apOverdueCount: number;     // 仕入側 期限超過件数
  apBalance: number;          // 買掛残高
  expensePendingCount: number;// 未精算（件数）
  expenseApprovalCount: number;// 承認待ち（件数）
}

export interface RecentItem {
  id: string;
  category: 'sales' | 'purchase' | 'expense';
  docNo: string;              // INV/2026/xxxxx 等
  partnerName?: string;
  amount: number;
  date: string;               // YYYY-MM-DD
  statusLabel: string;        // 例: 延滞 / 未払 / 承認待ち
  statusTone: 'danger' | 'warning' | 'neutral' | 'success';
}

export interface BillingCenterHomeProps {
  mode: 'landing' | 'app';
  kpis: BillingKpis;
  recentItems: RecentItem[];
  isLoading?: boolean;
  onCreateClick?: () => void;
  onNavigate?: (category: 'sales' | 'purchase' | 'expense') => void;
  onRecentClick?: (item: RecentItem) => void;
  onOverdueClick?: () => void;
}

/**
 * BillingCenterHome - 統一された請求・支払センターのホームページコンポーネント
 * /billing と /try-ocr の両方で使用
 */
export function BillingCenterHome({
  mode,
  kpis,
  recentItems,
  isLoading = false,
  onCreateClick,
  onNavigate,
  onRecentClick,
  onOverdueClick,
}: BillingCenterHomeProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // 三入口カードの定義
  const entryCards = [
    {
      category: 'sales' as const,
      icon: FileText,
      label: '売上（販売）',
      subtitle: '見積・受注・請求・入金',
      color: 'blue',
    },
    {
      category: 'purchase' as const,
      icon: Receipt,
      label: '仕入（購買・支払）',
      subtitle: '発注・受領請求・支払',
      color: 'purple',
    },
    {
      category: 'expense' as const,
      icon: CreditCard,
      label: '経費精算',
      subtitle: '領収書・交通費の申請/承認',
      color: 'amber',
    },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  const statusToneMap: Record<string, string> = {
    danger: 'bg-red-100 text-red-700',
    warning: 'bg-orange-100 text-orange-700',
    neutral: 'bg-gray-100 text-gray-600',
    success: 'bg-green-100 text-green-700',
  };

  const handleCreateClick = () => {
    if (mode === 'landing') {
      setShowLoginModal(true);
    } else {
      setShowCreateModal(true);
      onCreateClick?.();
    }
  };

  const handleNavigate = (category: 'sales' | 'purchase' | 'expense') => {
    if (mode === 'landing') {
      setShowLoginModal(true);
    } else {
      onNavigate?.(category);
    }
  };

  const handleRecentClick = (item: RecentItem) => {
    if (mode === 'landing') {
      setShowLoginModal(true);
    } else {
      onRecentClick?.(item);
    }
  };

  const handleOverdueClick = () => {
    if (mode === 'landing') {
      setShowLoginModal(true);
    } else {
      onOverdueClick?.();
    }
  };

  const handleViewAllClick = () => {
    if (mode === 'landing') {
      setShowLoginModal(true);
    } else {
      onNavigate?.('sales'); // デフォルトで売上リストへ
    }
  };

  const totalOverdue = kpis.arOverdueCount + kpis.apOverdueCount;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title flex items-center justify-between">
          <h1 className="page-title">請求・支払センター</h1>
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            登録
          </button>
        </div>
      </div>

      {/* KPI Cards - 6枚 */}
      <KpiCardGrid columns={2} className="gap-3">
        {isLoading ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : (
          <>
            <KpiCard
              title="未回収請求書（売上）"
              value={kpis.arOpenCount}
              icon={Clock}
              tone="warning"
            />
            <KpiCard
              title="期限超過（売上）"
              value={kpis.arOverdueCount}
              icon={AlertCircle}
              tone="danger"
            />
            <KpiCard
              title="売掛残高"
              value={`¥${kpis.arBalance.toLocaleString()}`}
              icon={TrendingUp}
              tone="success"
            />
            <KpiCard
              title="未払請求書（仕入）"
              value={kpis.apOpenCount}
              icon={Clock}
              tone="warning"
            />
            <KpiCard
              title="期限超過（仕入）"
              value={kpis.apOverdueCount}
              icon={AlertCircle}
              tone="danger"
            />
            <KpiCard
              title="買掛残高"
              value={`¥${kpis.apBalance.toLocaleString()}`}
              icon={TrendingDown}
              tone="default"
            />
          </>
        )}
      </KpiCardGrid>

      {/* 経費KPI - 横並び小カード */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">未精算経費</p>
            <p className="text-lg font-semibold text-gray-900">{kpis.expensePendingCount}件</p>
          </div>
        </div>
        <div className="card p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">承認待ち</p>
            <p className="text-lg font-semibold text-gray-900">{kpis.expenseApprovalCount}件</p>
          </div>
        </div>
      </div>

      {/* 三入口カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {entryCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.category}
              onClick={() => handleNavigate(card.category)}
              className="card p-4 hover:shadow-md transition-shadow flex flex-col items-center text-center group text-left w-full"
            >
              <div className={`w-12 h-12 rounded-xl ${colorMap[card.color]} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-sm font-medium text-gray-900">{card.label}</span>
              <span className="text-xs text-gray-500 mt-1">{card.subtitle}</span>
            </button>
          );
        })}
      </div>

      {/* 期限超過警告条 */}
      {totalOverdue > 0 && (
        <div className="card-flat flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              期限超過の請求書があります
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              追加料金を避けるために早急に対応してください
            </p>
          </div>
          <button
            onClick={handleOverdueClick}
            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
          >
            表示
          </button>
        </div>
      )}

      {/* 最近の処理 */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">最近の処理</h2>
          <button
            onClick={handleViewAllClick}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            すべて表示
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            読み込み中...
          </div>
        ) : recentItems.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">データがありません</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleRecentClick(item)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors w-full text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  {item.category === 'sales' ? (
                    <ArrowUpRight className="w-4 h-4 text-green-500" />
                  ) : item.category === 'purchase' ? (
                    <ArrowDownLeft className="w-4 h-4 text-blue-500" />
                  ) : (
                    <CreditCard className="w-4 h-4 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-900 truncate">{item.docNo}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${statusToneMap[item.statusTone]}`}>
                      {item.statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{item.partnerName || '-'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    ¥{item.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">{item.date}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CreateEntryModal - app mode only */}
      {mode === 'app' && (
        <CreateEntryModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* LoginCTARequestModal - landing mode only */}
      {mode === 'landing' && (
        <LoginCTARequestModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </div>
  );
}
