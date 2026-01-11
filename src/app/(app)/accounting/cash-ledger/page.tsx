'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Calendar, FileText, Camera,
  TrendingUp, TrendingDown, ChevronDown, ChevronUp, AlertCircle, Settings, RefreshCw, Trash2, X,
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import { IN_CATEGORIES, OUT_CATEGORIES, type CashCategory } from '@/lib/cash-ledger';
import Link from 'next/link';

type EntryMode = 'in' | 'out';

interface Attachment {
  file: File;
  thumbnail?: string;
}

interface SubmissionResult {
  createdCount: number;
  createdMoveIds: number[];
  errors?: string[];
}

interface ApiError {
  code: string;
  message: string;
  suggestion?: string;
}

// Number of "common" categories to show by default (requirement: max 6)
const COMMON_CATEGORY_COUNT = 6;

// Success modal after submission
function SuccessModal({
  createdCount,
  onClose,
  t,
}: {
  createdCount: number;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          {t('expenses.submitSuccessTitle')}
        </h3>
        <p className="text-gray-600">
          {t('expenses.submitSuccessDesc', { count: createdCount })}
        </p>
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          {t('common.confirm')}
        </button>
      </div>
    </div>
  );
}

export default function CashLedgerPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Get entry mode from URL param (default to 'in')
  const tabParam = searchParams.get('tab');
  const entryMode: EntryMode = tabParam === 'out' ? 'out' : 'in';
  const isIncomeMode = entryMode === 'in';
  const categories = isIncomeMode ? IN_CATEGORIES : OUT_CATEGORIES;

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSubmitResult, setLastSubmitResult] = useState<SubmissionResult | null>(null);
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [autoSetupAttempted, setAutoSetupAttempted] = useState(false);
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);

  // Entry state
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [inputDisplayValues, setInputDisplayValues] = useState<Record<string, string>>({});

  // Fetch settings
  const settingsQuery = useQuery({
    queryKey: ['cash-ledger-settings'],
    queryFn: async () => {
      const res = await fetch('/api/cash-ledger/settings');
      const data = await res.json();
      if (!data.success) {
        const error = data.error as ApiError;
        throw new Error(error.message || 'Failed to fetch settings');
      }
      return data.data;
    },
    retry: (failureCount, error) => {
      if (error.message.includes('expired') || error.message.includes('session')) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Auto-setup mutation
  const autoSetupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/cash-ledger/auto-setup', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        const error = data.error as ApiError;
        const err = new Error(error.message || 'Auto-setup failed');
        (err as any).code = error.code;
        (err as any).suggestion = error.suggestion;
        throw err;
      }
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-ledger-settings'] });
    },
  });

  // Auto-setup effect
  useEffect(() => {
    if (
      settingsQuery.data &&
      !settingsQuery.data.isConfigured &&
      !autoSetupAttempted &&
      !autoSetupMutation.isPending
    ) {
      setAutoSetupAttempted(true);
      autoSetupMutation.mutate();
    }
  }, [settingsQuery.data, autoSetupAttempted, autoSetupMutation.isPending]);

  // Fetch today's draft status
  const todayStatusQuery = useQuery({
    queryKey: ['cash-ledger-today', entryDate],
    queryFn: async () => {
      const res = await fetch(`/api/cash-ledger/summary?date_from=${entryDate}&date_to=${entryDate}`);
      const data = await res.json();
      if (!data.success) return { hasDrafts: false, draftCount: 0 };
      return {
        hasDrafts: (data.data?.kpi?.draftCount || 0) > 0,
        draftCount: data.data?.kpi?.draftCount || 0,
      };
    },
  });

  // Configuration status
  const isConfigured = settingsQuery.data?.isConfigured === true;
  const isSessionExpired = settingsQuery.error?.message?.includes('expired') ||
                           settingsQuery.error?.message?.includes('session') ||
                           autoSetupMutation.error?.message?.includes('expired');

  // Draft status
  const hasDrafts = todayStatusQuery.data?.hasDrafts ?? false;
  const draftCount = todayStatusQuery.data?.draftCount ?? 0;

  // File upload handler
  const handleFileUpload = (categoryCode: string, files: File[]) => {
    const newAttachments: Attachment[] = [];
    let processed = 0;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newAttachments.push({ file, thumbnail: e.target?.result as string });
        processed++;
        if (processed === files.length) {
          setAttachments(prev => ({
            ...prev,
            [categoryCode]: [...(prev[categoryCode] || []), ...newAttachments],
          }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(amounts)
        .filter(([, amount]) => amount > 0)
        .map(([categoryCode, amount]) => ({ categoryCode, amount, attachments: [] }));

      if (entries.length === 0) {
        throw new Error('No entries to submit');
      }

      const inEntries = isIncomeMode ? entries : [];
      const outEntries = isIncomeMode ? [] : entries;

      const res = await fetch('/api/cash-ledger/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: entryDate, openingBalance: 0, inEntries, outEntries }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Submit failed');
      return data.data as SubmissionResult;
    },
    onSuccess: (result) => {
      setLastSubmitResult(result);
      setShowSuccessModal(true);
      queryClient.invalidateQueries({ queryKey: ['cash-ledger-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-ledger-today'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-stats'] });
    },
    onError: (error) => {
      console.error('Submit error:', error);
      alert(error instanceof Error ? error.message : 'Submit failed');
    },
  });

  const handleSuccessContinue = () => {
    setShowSuccessModal(false);
    setAmounts({});
    setAttachments({});
    setInputDisplayValues({});
    window.location.href = '/accounting';
  };

  const handleReLogin = () => {
    router.push('/login');
  };

  const handleRetryAutoSetup = () => {
    setAutoSetupAttempted(false);
    autoSetupMutation.reset();
    queryClient.invalidateQueries({ queryKey: ['cash-ledger-settings'] });
  };

  // Clear all entries
  const handleClearAll = () => {
    setAmounts({});
    setAttachments({});
    setInputDisplayValues({});
  };

  // Clear single row
  const handleClearRow = (categoryCode: string) => {
    setAmounts(prev => {
      const next = { ...prev };
      delete next[categoryCode];
      return next;
    });
    setAttachments(prev => {
      const next = { ...prev };
      delete next[categoryCode];
      return next;
    });
    setInputDisplayValues(prev => {
      const next = { ...prev };
      delete next[categoryCode];
      return next;
    });
  };

  const getCategoryName = (cat: CashCategory) => {
    switch (locale) {
      case 'ja': return cat.nameJa;
      case 'zh': return cat.nameZh;
      default: return cat.nameEn;
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(price);

  const formatAmountDisplay = (value: number | string): string => {
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num) || num === 0) return '';
    return new Intl.NumberFormat('ja-JP').format(Math.round(num));
  };

  const parseAmountInput = (displayValue: string): number => {
    const cleaned = displayValue.replace(/[^\d]/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
  };

  // Calculate totals
  const totalAmount = Object.values(amounts).reduce((sum, v) => {
    const val = typeof v === 'number' && !isNaN(v) ? v : 0;
    return sum + val;
  }, 0);

  const hasAttachments = Object.values(attachments).some(arr => arr.length > 0);
  const hasAnyInput = totalAmount > 0 || hasAttachments;
  const entryCount = Object.values(amounts).filter(v => v > 0).length;

  // Get entries with amounts for summary popup
  const getEntriesWithAmounts = () => {
    return Object.entries(amounts)
      .filter(([, amount]) => amount > 0)
      .map(([code, amount]) => {
        const cat = categories.find(c => c.code === code);
        return {
          code,
          name: cat ? getCategoryName(cat) : code,
          amount,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  };

  // Button state logic (requirement D)
  const getButtonState = () => {
    if (submitMutation.isPending) {
      return { disabled: true, text: t('expenses.processing') };
    }
    if (isSessionExpired) {
      return { disabled: true, text: t('expenses.sessionExpired') };
    }
    if (!isConfigured) {
      return { disabled: true, text: t('expenses.notConfigured') };
    }
    if (!hasAnyInput) {
      return { disabled: true, text: t('expenses.enterAmountOrReceipt') };
    }
    // Has input - check if drafts exist
    if (hasDrafts) {
      return { disabled: false, text: t('expenses.updateDraft') };
    }
    return { disabled: false, text: t('expenses.createDraft') };
  };

  const buttonState = getButtonState();

  const handleAmountChange = (categoryCode: string, value: string) => {
    setInputDisplayValues(prev => ({ ...prev, [categoryCode]: value }));
    const numValue = parseAmountInput(value);
    setAmounts(prev => ({ ...prev, [categoryCode]: numValue }));
  };

  const handleAmountBlur = (categoryCode: string) => {
    const numValue = amounts[categoryCode] || 0;
    if (numValue > 0) {
      setInputDisplayValues(prev => ({ ...prev, [categoryCode]: formatAmountDisplay(numValue) }));
    } else {
      setInputDisplayValues(prev => ({ ...prev, [categoryCode]: '' }));
    }
  };

  const handleAmountFocus = (categoryCode: string) => {
    const numValue = amounts[categoryCode] || 0;
    if (numValue > 0) {
      setInputDisplayValues(prev => ({ ...prev, [categoryCode]: String(numValue) }));
    }
  };

  // Category row component - more compact layout
  const renderCategoryRow = (cat: CashCategory) => {
    const catAttachments = attachments[cat.code] || [];
    const hasPhotos = catAttachments.length > 0;
    const amount = amounts[cat.code] || 0;
    const hasAmount = amount > 0;
    const displayValue = inputDisplayValues[cat.code] ?? (hasAmount ? formatAmountDisplay(amount) : '');
    const showReceiptHint = hasPhotos && !hasAmount;
    const isRowActive = hasAmount || hasPhotos;

    return (
      <div
        key={cat.code}
        className={`flex items-center gap-2 py-2.5 px-1 rounded-lg transition-colors ${
          isRowActive ? (isIncomeMode ? 'bg-green-50' : 'bg-red-50') : ''
        }`}
      >
        {/* Category name - flex-1 to take remaining space */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm truncate ${isRowActive ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
              {getCategoryName(cat)}
            </span>
            {cat.type === 'TRANSFER' && (
              <span className="text-[10px] bg-gray-200 text-gray-600 px-1 py-0.5 rounded flex-shrink-0">
                {t('expenses.transfer')}
              </span>
            )}
          </div>
          {showReceiptHint && (
            <span className="text-[10px] text-amber-600">{t('expenses.receiptNoAmount')}</span>
          )}
        </div>

        {/* Amount input - compact width */}
        <div className="relative flex-shrink-0">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">¥</span>
          <input
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={(e) => handleAmountChange(cat.code, e.target.value)}
            onBlur={() => handleAmountBlur(cat.code)}
            onFocus={() => handleAmountFocus(cat.code)}
            className={`w-24 text-right pl-5 pr-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 transition
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
              ${isRowActive
                ? isIncomeMode
                  ? 'border-green-300 focus:ring-green-200 bg-white'
                  : 'border-red-300 focus:ring-red-200 bg-white'
                : 'border-gray-200 focus:ring-blue-200 bg-gray-50'
              }`}
            placeholder=""
            disabled={!isConfigured || isSessionExpired}
          />
        </div>

        {/* Receipt button with badge */}
        <button
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.onchange = (e) => {
              const files = Array.from((e.target as HTMLInputElement).files || []);
              if (files.length > 0) handleFileUpload(cat.code, files);
            };
            input.click();
          }}
          disabled={!isConfigured || isSessionExpired}
          className={`p-1.5 rounded-lg transition flex-shrink-0 relative ${
            hasPhotos
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-50'
          }`}
        >
          <Camera className="w-4 h-4" />
          {hasPhotos && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-600 text-white text-[10px] rounded-full flex items-center justify-center font-medium">
              {catAttachments.length}
            </span>
          )}
        </button>

        {/* Clear row button - only show when row has data */}
        {isRowActive && (
          <button
            onClick={() => handleClearRow(cat.code)}
            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  const commonCategories = categories.slice(0, COMMON_CATEGORY_COUNT);
  const moreCategories = categories.slice(COMMON_CATEGORY_COUNT);

  const pageTitle = isIncomeMode ? t('expenses.cashIncome') : t('expenses.cashExpense');
  const ThemeIcon = isIncomeMode ? TrendingUp : TrendingDown;

  // Loading state
  if (settingsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  // Error state - session expired
  if (isSessionExpired) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('expenses.sessionExpired')}</h2>
        <p className="text-sm text-gray-600 mb-6">{t('expenses.sessionExpiredDesc')}</p>
        <button
          onClick={handleReLogin}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {t('common.reLogin')}
        </button>
      </div>
    );
  }

  // Error state - other errors
  if (settingsQuery.isError && !isSessionExpired) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('common.error')}</h2>
        <p className="text-sm text-gray-600 mb-6">{settingsQuery.error?.message}</p>
        <button
          onClick={() => settingsQuery.refetch()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className={`bg-white border-b sticky top-0 z-10 ${isIncomeMode ? 'border-green-200' : 'border-red-200'}`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/accounting" className="p-1 -ml-1">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className={`p-2 rounded-lg ${isIncomeMode ? 'bg-green-100' : 'bg-red-100'}`}>
            <ThemeIcon className={`w-5 h-5 ${isIncomeMode ? 'text-green-600' : 'text-red-600'}`} />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 flex-1">{pageTitle}</h1>

          {/* Clear all button - only show when has input */}
          {hasAnyInput && (
            <button
              onClick={handleClearAll}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
              title={t('expenses.clearAll')}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Date Picker + Status */}
      <div className="bg-white border-b px-4 py-2.5 sticky top-[60px] z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="border-none bg-transparent text-sm font-medium p-0 focus:ring-0"
            />
          </div>
          {/* Status pill - requirement A: 未提出 / 草稿あり（X件） */}
          <div className={`text-xs px-2 py-0.5 rounded-full ${
            hasDrafts
              ? 'bg-amber-100 text-amber-700'
              : 'bg-gray-200 text-gray-600'
          }`}>
            {hasDrafts
              ? t('expenses.hasDrafts', { count: draftCount })
              : t('expenses.noDrafts')}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-36 md:pb-28">
        {/* Auto-setup in progress */}
        {autoSetupMutation.isPending && (
          <div className="mx-4 mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <Loading text="" />
            <div>
              <p className="text-sm font-medium text-blue-800">{t('expenses.autoSetupInProgress')}</p>
              <p className="text-xs text-blue-600">{t('expenses.autoSetupDesc')}</p>
            </div>
          </div>
        )}

        {/* Auto-setup failed */}
        {autoSetupMutation.isError && !isConfigured && (
          <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">{t('expenses.autoSetupFailed')}</p>
                <p className="text-xs text-amber-600 mt-1">
                  {(autoSetupMutation.error as any)?.suggestion || autoSetupMutation.error?.message}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleRetryAutoSetup}
                    className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded hover:bg-amber-200 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t('common.retry')}
                  </button>
                  <Link
                    href="/accounting/cash-ledger/settings"
                    className="px-3 py-1.5 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center gap-1"
                  >
                    <Settings className="w-3 h-3" />
                    {t('expenses.goToSettings')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Common Categories - requirement B: 常用（6个） */}
        <div className="bg-white mx-3 mt-3 rounded-lg shadow-sm">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {t('expenses.commonCategories')}
            </span>
          </div>
          <div className="px-2 py-1 space-y-0.5">
            {commonCategories.map(cat => renderCategoryRow(cat))}
          </div>
        </div>

        {/* More Categories - requirement B: 更多（折叠） */}
        {moreCategories.length > 0 && (
          <div className="bg-white mx-3 mt-3 rounded-lg shadow-sm">
            <button
              onClick={() => setShowMoreCategories(!showMoreCategories)}
              className="w-full px-3 py-2.5 flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 transition"
            >
              <span className="font-medium">
                {showMoreCategories ? t('expenses.hideMore') : t('expenses.showMore', { count: moreCategories.length })}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showMoreCategories ? 'rotate-180' : ''}`} />
            </button>

            {showMoreCategories && (
              <div className="px-2 py-1 border-t border-gray-100 space-y-0.5">
                {moreCategories.map(cat => renderCategoryRow(cat))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Fixed Bar - requirement D: two layers only */}
      <div className="fixed bottom-14 md:bottom-0 left-0 right-0 bg-white border-t shadow-lg z-20">
        {/* Summary Popup - shows when clicking total */}
        {showSummaryPopup && entryCount > 0 && (
          <div className="border-b bg-gray-50 max-h-48 overflow-y-auto">
            <div className="px-4 py-2 space-y-1.5">
              {getEntriesWithAmounts().map((entry) => (
                <div key={entry.code} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate flex-1 mr-2">{entry.name}</span>
                  <span className={`font-medium tabular-nums ${isIncomeMode ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPrice(entry.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Layer 1: Total + Draft count - clickable */}
        <button
          onClick={() => entryCount > 0 && setShowSummaryPopup(!showSummaryPopup)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors"
          disabled={entryCount === 0}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {isIncomeMode ? t('expenses.totalIn') : t('expenses.totalOut')}
            </span>
            <span className={`text-xl font-bold ${isIncomeMode ? 'text-green-600' : 'text-red-600'}`}>
              {formatPrice(totalAmount)}
            </span>
            {entryCount > 0 && (
              showSummaryPopup
                ? <ChevronDown className="w-4 h-4 text-gray-400" />
                : <ChevronUp className="w-4 h-4 text-gray-400" />
            )}
          </div>
          {entryCount > 0 && (
            <span className="text-xs text-gray-500">
              {t('expenses.entryCount', { count: entryCount })}
            </span>
          )}
        </button>

        {/* Layer 2: Main button */}
        <div className="px-4 pb-3">
          <button
            onClick={() => submitMutation.mutate()}
            disabled={buttonState.disabled}
            className={`w-full py-3 flex items-center justify-center gap-2 rounded-lg font-medium transition ${
              !buttonState.disabled
                ? isIncomeMode
                  ? 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
                  : 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitMutation.isPending ? (
              <Loading text="" />
            ) : (
              <>
                <FileText className="w-4 h-4" />
                {buttonState.text}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && lastSubmitResult && (
        <SuccessModal
          createdCount={lastSubmitResult.createdCount}
          onClose={handleSuccessContinue}
          t={t}
        />
      )}
    </div>
  );
}
