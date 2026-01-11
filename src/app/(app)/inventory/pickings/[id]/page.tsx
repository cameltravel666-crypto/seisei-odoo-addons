'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Truck,
  Package,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import type { ApiResponse } from '@/types';

interface StockMove {
  id: number;
  productId: number | null;
  productName: string;
  demandQty: number;
  doneQty: number;
  uom: string;
  state: string;
}

interface PickingDetail {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string | null;
  scheduledDate: string;
  dateDone: string | null;
  origin: string | null;
  state: string;
  pickingTypeId: number | null;
  pickingTypeName: string | null;
  pickingTypeCode: string;
  locationId: number | null;
  locationName: string | null;
  locationDestId: number | null;
  locationDestName: string | null;
  note: string | null;
  moves: StockMove[];
}

const stateColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  waiting: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  assigned: 'bg-indigo-100 text-indigo-800',
  done: 'bg-green-100 text-green-800',
  cancel: 'bg-red-100 text-red-800',
};

export default function PickingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [picking, setPicking] = useState<PickingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showMoves, setShowMoves] = useState(true);

  // Fetch picking details
  useEffect(() => {
    const fetchPicking = async () => {
      try {
        const res = await fetch(`/api/inventory/pickings/${id}`);
        const data: ApiResponse<PickingDetail> = await res.json();
        if (data.success && data.data) {
          setPicking(data.data);
        } else {
          setError(data.error?.message || 'Failed to load picking');
        }
      } catch {
        setError('Failed to load picking');
      } finally {
        setIsLoading(false);
      }
    };
    fetchPicking();
  }, [id]);

  const getStateLabel = (state: string) => {
    const labels: Record<string, string> = {
      draft: t('inventory.stateDraft'),
      waiting: t('inventory.stateWaiting'),
      confirmed: t('inventory.stateConfirmed'),
      assigned: t('inventory.stateReady'),
      done: t('inventory.stateDone'),
      cancel: t('status.cancelled'),
    };
    return labels[state] || state;
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ja-JP');

  // Validate picking
  const handleValidate = async () => {
    if (!picking || picking.state === 'done' || picking.state === 'cancel') return;

    setIsValidating(true);
    try {
      const res = await fetch(`/api/inventory/pickings/${id}/validate`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPicking((prev) => prev ? { ...prev, state: 'done' } : null);
        queryClient.invalidateQueries({ queryKey: ['pickings'] });
      } else {
        alert(data.error?.message || 'Failed to validate picking');
      }
    } catch {
      alert('Failed to validate picking');
    } finally {
      setIsValidating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  if (error || !picking) {
    return (
      <div className="p-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 mb-4">
          <ArrowLeft className="w-5 h-5" />
          {t('common.back')}
        </button>
        <div className="card p-6 text-center text-red-600">{error || 'Picking not found'}</div>
      </div>
    );
  }

  const canValidate = picking.state === 'assigned' || picking.state === 'confirmed';
  const isIncoming = picking.pickingTypeCode === 'incoming';
  const isOutgoing = picking.pickingTypeCode === 'outgoing';

  return (
    <div className="pb-32 md:pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{picking.name}</h1>
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${stateColors[picking.state] || 'bg-gray-100'}`}>
              {getStateLabel(picking.state)}
            </span>
          </div>
        </div>
      </div>

      {/* Picking Info Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-3 rounded-lg ${
            picking.state === 'done' ? 'bg-green-50' :
            picking.state === 'assigned' ? 'bg-indigo-50' :
            'bg-yellow-50'
          }`}>
            {picking.state === 'done' ? (
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            ) : (
              <Truck className={`w-6 h-6 ${
                picking.state === 'assigned' ? 'text-indigo-600' : 'text-yellow-600'
              }`} />
            )}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">{picking.pickingTypeName}</div>
            <div className="text-xs text-gray-500">
              {isIncoming ? t('inventory.receiptType') : isOutgoing ? t('inventory.deliveryType') : t('inventory.transferType')}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {picking.partnerName && (
            <div>
              <div className="text-xs text-gray-500">{t('inventory.partner')}</div>
              <div className="font-medium text-gray-900">{picking.partnerName}</div>
            </div>
          )}
          {picking.origin && (
            <div>
              <div className="text-xs text-gray-500">{t('inventory.sourceDocument')}</div>
              <div className="font-medium text-gray-900">{picking.origin}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-500">{t('inventory.scheduledDate')}</div>
            <div className="font-medium text-gray-900 flex items-center gap-1">
              <Clock className="w-3 h-3 text-gray-400" />
              {formatDate(picking.scheduledDate)}
            </div>
          </div>
          {picking.dateDone && (
            <div>
              <div className="text-xs text-gray-500">{t('inventory.doneDate')}</div>
              <div className="font-medium text-gray-900">{formatDate(picking.dateDone)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Locations Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="text-xs text-gray-500">{t('inventory.sourceLocation')}</div>
            <div className="font-medium text-gray-900 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-gray-400" />
              {picking.locationName}
            </div>
          </div>
          <div className="text-gray-300">→</div>
          <div className="flex-1">
            <div className="text-xs text-gray-500">{t('inventory.destLocation')}</div>
            <div className="font-medium text-gray-900 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-gray-400" />
              {picking.locationDestName}
            </div>
          </div>
        </div>
      </div>

      {/* Stock Moves */}
      <div className="bg-white rounded-lg border border-gray-200 mb-3">
        <button
          onClick={() => setShowMoves(!showMoves)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="font-medium text-gray-900">{t('inventory.products')} ({picking.moves.length})</span>
          {showMoves ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {showMoves && (
          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {picking.moves.map((move) => (
              <div key={move.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg mt-0.5">
                    <Package className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{move.productName}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t('inventory.demand')}: {move.demandQty} {move.uom}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${
                      move.doneQty >= move.demandQty ? 'text-green-600' :
                      move.doneQty > 0 ? 'text-yellow-600' : 'text-gray-400'
                    }`}>
                      {move.doneQty} / {move.demandQty}
                    </div>
                    <div className="text-xs text-gray-500">{move.uom}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      {picking.note && (
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 mb-3">
          <div className="text-xs text-yellow-700 mb-1">{t('order.note')}</div>
          <div className="text-sm text-yellow-900 whitespace-pre-wrap">{picking.note}</div>
        </div>
      )}

      {/* Sticky Bottom Bar */}
      {canValidate && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 bg-white border-t border-gray-200 z-40">
          <div className="px-4 py-3">
            <button
              onClick={handleValidate}
              disabled={isValidating}
              className="w-full btn btn-primary py-3 flex items-center justify-center gap-2"
            >
              {isValidating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  {isIncoming ? t('inventory.validateReceipt') : isOutgoing ? t('inventory.validateDelivery') : t('inventory.validate')}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Completed state */}
      {picking.state === 'done' && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 bg-green-50 border-t border-green-200 z-40">
          <div className="px-4 py-3 flex items-center justify-center gap-2 text-green-700">
            <CheckCircle2 className="w-5 h-5" />
            {t('inventory.validated')}
          </div>
        </div>
      )}
    </div>
  );
}
