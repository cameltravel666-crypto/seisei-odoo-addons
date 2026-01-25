'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Download,
  Receipt,
  ChevronLeft,
  Calendar,
  CheckSquare,
} from 'lucide-react';
import { CreateEntryModal } from '@/components/billing';

/**
 * 経費精算リストページ
 * 経費申請・承認・精算の管理
 */
export default function BillingExpensePage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // TODO: Replace with real API data
  const items: Array<{
    id: string;
    docNo: string;
    employeeName: string;
    amount: number;
    date: string;
    category: string;
    status: string;
    statusTone: string;
  }> = [];

  const handleExportCSV = () => {
    // TODO: Implement CSV export
    console.log('CSV export - coming soon');
  };

  const handleExportExcel = () => {
    // TODO: Implement Excel export
    console.log('Excel export - coming soon');
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(item => item.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/billing" className="text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="page-title">経費精算</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            申請
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Date Range */}
          <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">
            <Calendar className="w-4 h-4 text-gray-500" />
            期間
          </button>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">すべてのステータス</option>
            <option value="draft">下書き</option>
            <option value="pending">承認待ち</option>
            <option value="approved">承認済</option>
            <option value="rejected">差戻し</option>
            <option value="paid">精算済</option>
          </select>

          {/* Export */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Download className="w-4 h-4 text-gray-500" />
              CSV
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Download className="w-4 h-4 text-gray-500" />
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b text-sm font-medium text-gray-600">
          <button onClick={toggleSelectAll} className="p-1">
            <CheckSquare className={`w-4 h-4 ${selectedIds.length === items.length && items.length > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
          </button>
          <div className="flex-1 grid grid-cols-5 gap-4">
            <span>申請番号</span>
            <span>申請者</span>
            <span className="text-right">金額</span>
            <span>日付</span>
            <span>ステータス</span>
          </div>
        </div>

        {/* Empty State */}
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">データがありません</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              最初の経費を申請
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
              >
                <button
                  onClick={() => toggleSelect(item.id)}
                  className="p-1"
                >
                  <CheckSquare className={`w-4 h-4 ${selectedIds.includes(item.id) ? 'text-blue-600' : 'text-gray-400'}`} />
                </button>
                <div className="flex-1 grid grid-cols-5 gap-4 items-center text-sm">
                  <span className="font-medium text-gray-900">{item.docNo}</span>
                  <span className="text-gray-600 truncate">{item.employeeName}</span>
                  <span className="text-right font-medium tabular-nums">¥{item.amount.toLocaleString()}</span>
                  <span className="text-gray-500">{item.date}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs w-fit ${item.statusTone}`}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-4">
          <span className="text-sm">{selectedIds.length}件選択中</span>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-white/20 rounded-lg text-sm hover:bg-white/30 transition"
          >
            一括エクスポート
          </button>
        </div>
      )}

      {/* Create Modal */}
      <CreateEntryModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        category="expense"
      />
    </div>
  );
}
