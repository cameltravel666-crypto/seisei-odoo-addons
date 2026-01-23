'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Search, ChevronDown, ChevronRight, Building2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ListSkeleton, EmptyState } from '@/components/ui';

interface Account {
  id: number;
  name: string;
  code: string;
  accountType: string;
  accountTypeLabel: string;
  reconcile: boolean;
  deprecated: boolean;
  currency: string | null;
  groupName: string | null;
  balance: number;
}

// Account Type Group
function AccountTypeGroup({
  type,
  label,
  accounts,
  isExpanded,
  onToggle,
  t,
}: {
  type: string;
  label: string;
  accounts: Account[];
  isExpanded: boolean;
  onToggle: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  // Calculate total balance for the group
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  // Determine color based on account type
  const getTypeColor = () => {
    if (type.startsWith('asset')) return 'text-blue-600 bg-blue-50';
    if (type.startsWith('liability')) return 'text-orange-600 bg-orange-50';
    if (type.startsWith('equity')) return 'text-purple-600 bg-purple-50';
    if (type.startsWith('income')) return 'text-green-600 bg-green-50';
    if (type.startsWith('expense')) return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition ${getTypeColor()}`}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold">{label}</h3>
          <p className="text-xs opacity-75">{accounts.length} {t('accounting.accountsCount') || '个科目'}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold tabular-nums">¥{totalBalance.toLocaleString()}</p>
        </div>
      </button>

      {isExpanded && (
        <div className="divide-y divide-[var(--color-border-light)]">
          {accounts.map(account => (
            <div
              key={account.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
            >
              <div className="w-20 flex-shrink-0">
                <span className="text-sm font-mono text-gray-600">{account.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-medium text-truncate">{account.name}</p>
                {account.groupName && (
                  <p className="text-micro text-[var(--color-text-tertiary)]">{account.groupName}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-body tabular-nums ${account.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                  ¥{account.balance.toLocaleString()}
                </p>
              </div>
              {account.reconcile && (
                <span className="text-micro px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                  {t('accounting.reconcilable') || '可对账'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const t = useTranslations();
  const [search, setSearch] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  // Fetch accounts
  const { data, isLoading, error } = useQuery({
    queryKey: ['accounting-accounts', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);

      const res = await fetch(`/api/accounting/accounts?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data as {
        items: Account[];
        typeLabels: Record<string, string>;
        total: number;
      };
    },
  });

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Group accounts by type
  const groupedAccounts: Record<string, Account[]> = {};
  if (data?.items) {
    data.items.forEach(account => {
      if (!groupedAccounts[account.accountType]) {
        groupedAccounts[account.accountType] = [];
      }
      groupedAccounts[account.accountType].push(account);
    });
  }

  // Sort account types in logical order
  const typeOrder = [
    'asset_receivable', 'asset_cash', 'asset_current', 'asset_non_current',
    'asset_prepayments', 'asset_fixed',
    'liability_payable', 'liability_credit_card', 'liability_current', 'liability_non_current',
    'equity', 'equity_unaffected',
    'income', 'income_other',
    'expense', 'expense_depreciation', 'expense_direct_cost',
    'off_balance'
  ];

  const sortedTypes = Object.keys(groupedAccounts).sort((a, b) => {
    const indexA = typeOrder.indexOf(a);
    const indexB = typeOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return (
    <div className="section-gap pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title">
          <h1 className="page-title">{t('accounting.chartOfAccounts') || '会计科目'}</h1>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('accounting.searchAccounts') || '搜索科目...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Building2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-lg font-bold">{data.total}</p>
            <p className="text-xs text-gray-500">{t('accounting.totalAccounts') || '总科目数'}</p>
          </div>
        </div>
      )}

      {/* Account List */}
      {isLoading ? (
        <ListSkeleton count={5} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState
          icon="folder"
          title={t('accounting.noAccounts') || '暂无科目'}
          description={t('accounting.noAccountsDesc') || '没有找到会计科目'}
        />
      ) : (
        <div className="space-y-3">
          {sortedTypes.map(type => (
            <AccountTypeGroup
              key={type}
              type={type}
              label={data.typeLabels[type] || type}
              accounts={groupedAccounts[type]}
              isExpanded={expandedTypes.has(type)}
              onToggle={() => toggleType(type)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
