'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QrCode, Clock, UtensilsCrossed } from 'lucide-react';

interface TableStatus {
  isOpen: boolean;
  tableName: string;
  posUrl?: string;
}

export default function QROrderPage() {
  const params = useParams();
  const tableId = params.tableId as string;
  const [status, setStatus] = useState<TableStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkTableStatus() {
      try {
        const res = await fetch(`/api/order/table-status?table_id=${tableId}`);
        const data = await res.json();

        if (!data.success) {
          setError(data.error?.message || '无法获取桌台状态');
          return;
        }

        setStatus(data.data);
      } catch (err) {
        setError('网络错误，请稍后重试');
      } finally {
        setLoading(false);
      }
    }

    checkTableStatus();
  }, [tableId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">正在检查桌台状态...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">出错了</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // Table is closed - show reserved message
  if (status && !status.isOpen) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {status.tableName}
          </h1>
          <div className="bg-orange-50 rounded-xl p-4 mb-6">
            <p className="text-orange-700 font-medium text-lg">
              此桌已预定，暂时不能点餐
            </p>
          </div>
          <p className="text-gray-500 text-sm">
            请联系服务员开启桌台后再扫码点餐
          </p>
        </div>
      </div>
    );
  }

  // Table is open - show welcome message and ordering available
  if (status && status.isOpen) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <UtensilsCrossed className="w-10 h-10 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {status.tableName}
          </h1>
          <div className="bg-emerald-50 rounded-xl p-4 mb-6">
            <p className="text-emerald-700 font-medium text-lg">
              欢迎光临
            </p>
            <p className="text-emerald-600 text-sm mt-2">
              请稍候，服务员将为您提供菜单
            </p>
          </div>
          {status.posUrl && (
            <a
              href={status.posUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-emerald-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-emerald-600 transition-colors"
            >
              开始点餐
            </a>
          )}
        </div>
      </div>
    );
  }

  return null;
}
