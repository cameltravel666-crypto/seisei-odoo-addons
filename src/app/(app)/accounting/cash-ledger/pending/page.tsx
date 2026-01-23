'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Trash2,
  Edit,
  TrendingUp,
  TrendingDown,
  Calendar,
  Loader2,
  X,
  Save,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import { getCategoryByCode, type CashCategory } from '@/lib/cash-ledger';

interface CashEntry {
  id: number;
  name: string;
  ref: string;
  date: string;
  state: string;
  amount: number;
  categoryCode: string | null;
  categoryName: string | null;
  direction: 'IN' | 'OUT' | null;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export default function CashLedgerPendingPage() {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>('');

  // Selection state for batch operations
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Fetch draft entries
  const { data, isLoading, error } = useQuery({
    queryKey: ['cash-ledger-pending'],
    queryFn: async () => {
      const res = await fetch('/api/cash-ledger/entries?state=draft&limit=100');
      const data: ApiResponse<{ items: CashEntry[] }> = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch entries');
      }
      return data.data?.items || [];
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ entryId, amount, date }: { entryId: number; amount: number; date?: string }) => {
      const res = await fetch('/api/cash-ledger/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, amount, date }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Update failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-ledger-pending'] });
      queryClient.invalidateQueries({ queryKey: ['cash-ledger-summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-stats'] });
      setEditingId(null);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const res = await fetch(`/api/cash-ledger/entries?id=${entryId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Delete failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-ledger-pending'] });
      queryClient.invalidateQueries({ queryKey: ['cash-ledger-summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-stats'] });
    },
  });

  // Confirm mutation
  const confirmMutation = useMutation({
    mutationFn: async (entryIds: number[]) => {
      const res = await fetch('/api/cash-ledger/entries/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Confirm failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-ledger-pending'] });
      queryClient.invalidateQueries({ queryKey: ['cash-ledger-summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-stats'] });
      setSelectedIds(new Set());
    },
  });

  const getCategoryName = (cat: CashCategory | null | undefined) => {
    if (!cat) return '-';
    switch (locale) {
      case 'ja': return cat.nameJa;
      case 'zh': return cat.nameZh;
      default: return cat.nameEn;
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(price);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ja-JP');

  const startEdit = (entry: CashEntry) => {
    setEditingId(entry.id);
    setEditAmount(entry.amount);
    setEditDate(entry.date);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = () => {
    if (editingId && editAmount > 0) {
      updateMutation.mutate({ entryId: editingId, amount: editAmount, date: editDate });
    }
  };

  const handleDelete = (entryId: number) => {
    if (confirm(t('expenses.confirmDelete'))) {
      deleteMutation.mutate(entryId);
    }
  };

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (data) {
      if (selectedIds.size === data.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(data.map(e => e.id)));
      }
    }
  };

  const confirmSelected = () => {
    if (selectedIds.size > 0) {
      confirmMutation.mutate(Array.from(selectedIds));
    }
  };

  // Separate entries by direction
  const inEntries = data?.filter(e => e.direction === 'IN') || [];
  const outEntries = data?.filter(e => e.direction === 'OUT') || [];
  const totalIn = inEntries.reduce((sum, e) => sum + e.amount, 0);
  const totalOut = outEntries.reduce((sum, e) => sum + e.amount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-gray-600">{error instanceof Error ? error.message : 'Error'}</p>
      </div>
    );
  }

  const entries = data || [];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/accounting" className="p-1 -ml-1">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 flex-1">
            {t('expenses.pendingEntries')}
          </h1>
          <span className="text-sm text-gray-500">
            {entries.length} {t('common.items')}
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-sm text-gray-600">{t('expenses.totalIn')}</span>
              <span className="font-semibold text-green-600">{formatPrice(totalIn)}</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-sm text-gray-600">{t('expenses.totalOut')}</span>
              <span className="font-semibold text-red-600">{formatPrice(totalOut)}</span>
            </div>
          </div>
          {entries.length > 0 && (
            <button
              onClick={selectAll}
              className="text-xs text-blue-600 hover:underline"
            >
              {selectedIds.size === entries.length ? t('common.deselectAll') : t('common.selectAll')}
            </button>
          )}
        </div>
      </div>

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto pb-24">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <CheckCircle2 className="w-12 h-12 mb-3" />
            <p className="text-sm">{t('expenses.noPendingEntries')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 bg-white">
            {entries.map((entry) => {
              const category = entry.categoryCode ? getCategoryByCode(entry.categoryCode) : null;
              const isEditing = editingId === entry.id;
              const isSelected = selectedIds.has(entry.id);
              const isIncome = entry.direction === 'IN';

              return (
                <div
                  key={entry.id}
                  className={`px-4 py-3 ${isSelected ? 'bg-blue-50' : ''} ${isEditing ? 'bg-yellow-50' : ''}`}
                >
                  {isEditing ? (
                    /* Edit Mode */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">
                          {getCategoryName(category)}
                        </span>
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                          isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {isIncome ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {isIncome ? t('expenses.income') : t('expenses.expense')}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{t('common.date')}</label>
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="input w-full py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{t('common.amount')}</label>
                          <input
                            type="number"
                            value={editAmount}
                            onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                            className="input w-full py-1.5 text-sm text-right"
                            min="1"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={cancelEdit}
                          className="flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                        >
                          <X className="w-4 h-4 inline mr-1" />
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={updateMutation.isPending}
                          className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {updateMutation.isPending ? (
                            <Loader2 className="w-4 h-4 inline animate-spin mr-1" />
                          ) : (
                            <Save className="w-4 h-4 inline mr-1" />
                          )}
                          {t('common.save')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelect(entry.id)}
                        className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>

                      {/* Entry Info */}
                      <div className="flex-1 min-w-0" onClick={() => toggleSelect(entry.id)}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {getCategoryName(category)}
                          </span>
                          <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs ${
                            isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {isIncome ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(entry.date)}</span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className={`font-semibold tabular-nums ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPrice(entry.amount)}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(entry)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fixed Bottom Bar */}
      {entries.length > 0 && (
        <div className="fixed bottom-14 md:bottom-0 left-0 right-0 bg-white border-t shadow-lg z-20">
          <div className="px-4 py-3">
            <button
              onClick={confirmSelected}
              disabled={selectedIds.size === 0 || confirmMutation.isPending}
              className={`w-full py-3 flex items-center justify-center gap-2 rounded-lg font-medium transition ${
                selectedIds.size > 0
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {confirmMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  {selectedIds.size > 0
                    ? t('expenses.confirmSelected', { count: selectedIds.size })
                    : t('expenses.selectToConfirm')}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
