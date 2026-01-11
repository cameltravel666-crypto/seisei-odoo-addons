'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Mail,
  Phone,
  Star,
  Calendar,
  User,
  Building,
  MapPin,
  Globe,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Edit3,
  Check,
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import { formatCompactAmount } from '@/lib/purchase-format';
import type { ApiResponse } from '@/types';

interface Stage {
  id: number;
  name: string;
  sequence: number;
  isWon: boolean;
}

interface Activity {
  id: number;
  type: string;
  summary: string;
  note: string | null;
  deadline: string;
  state: string;
  userName: string | null;
  createdAt: string;
}

interface LeadDetail {
  id: number;
  name: string;
  partnerId: number | null;
  partnerName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  expectedRevenue: number;
  probability: number;
  stageId: number | null;
  stageName: string;
  userId: number | null;
  userName: string | null;
  teamId: number | null;
  teamName: string | null;
  createdAt: string;
  updatedAt: string;
  deadline: string | null;
  activityDeadline: string | null;
  isOverdue: boolean;
  priority: string;
  type: string;
  active: boolean;
  description: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  stateName: string | null;
  zip: string | null;
  countryName: string | null;
  website: string | null;
  jobPosition: string | null;
  sourceName: string | null;
  mediumName: string | null;
  campaignName: string | null;
  referred: string | null;
  lostReasonName: string | null;
  tagIds: number[];
  activities: Activity[];
  stages: Stage[];
}

// Stage colors
function getStageColor(stageName: string, isWon: boolean): string {
  if (isWon) return 'bg-green-500';
  const name = stageName.toLowerCase();
  if (name.includes('lost')) return 'bg-red-500';
  if (name.includes('new')) return 'bg-gray-400';
  if (name.includes('qualified')) return 'bg-blue-500';
  if (name.includes('proposition')) return 'bg-yellow-500';
  if (name.includes('negotiation')) return 'bg-orange-500';
  return 'bg-indigo-500';
}

// Probability color
function getProbabilityColor(probability: number): string {
  if (probability >= 70) return 'bg-green-500';
  if (probability >= 40) return 'bg-yellow-500';
  return 'bg-gray-400';
}

// Format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format relative date
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (diffDays < 7) return `${diffDays}日前`;
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

export default function CrmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);
  const [showActivities, setShowActivities] = useState(true);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(null);

  // Fetch lead details
  useEffect(() => {
    const fetchLead = async () => {
      try {
        const res = await fetch(`/api/crm/${id}`);
        const data: ApiResponse<LeadDetail> = await res.json();
        if (data.success && data.data) {
          setLead(data.data);
          setSelectedStageId(data.data.stageId);
        } else {
          setError(data.error?.message || 'Failed to load lead');
        }
      } catch {
        setError('Failed to load lead');
      } finally {
        setIsLoading(false);
      }
    };
    fetchLead();
  }, [id]);

  // Update stage
  const handleStageChange = async (stageId: number) => {
    if (!lead || stageId === lead.stageId) return;

    setIsUpdatingStage(true);
    setSelectedStageId(stageId);

    try {
      const res = await fetch(`/api/crm/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });
      const data = await res.json();

      if (data.success) {
        const newStage = lead.stages.find(s => s.id === stageId);
        setLead(prev => prev ? {
          ...prev,
          stageId,
          stageName: newStage?.name || '',
        } : null);
        queryClient.invalidateQueries({ queryKey: ['crm'] });
      } else {
        setSelectedStageId(lead.stageId);
        alert(data.error?.message || 'Failed to update stage');
      }
    } catch {
      setSelectedStageId(lead.stageId);
      alert('Failed to update stage');
    } finally {
      setIsUpdatingStage(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="p-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 mb-4">
          <ArrowLeft className="w-5 h-5" />
          {t('common.back')}
        </button>
        <div className="card p-6 text-center text-red-600">{error || 'Lead not found'}</div>
      </div>
    );
  }

  const priorityNum = parseInt(lead.priority) || 0;
  const hasHighPriority = priorityNum >= 2;
  const displayContact = lead.partnerName || lead.contactName;

  // Build address string
  const addressParts = [lead.street, lead.street2, lead.city, lead.stateName, lead.zip, lead.countryName]
    .filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

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
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900 truncate">{lead.name}</h1>
              {hasHighPriority && (
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full text-white ${getStageColor(lead.stageName, lead.stages.find(s => s.id === lead.stageId)?.isWon || false)}`}
              >
                {lead.stageName}
              </span>
              {lead.isOverdue && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                  {t('crm.overdue')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stage Pipeline */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="text-xs text-gray-500 mb-2">{t('crm.pipeline')}</div>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {lead.stages.map((stage) => (
            <button
              key={stage.id}
              onClick={() => handleStageChange(stage.id)}
              disabled={isUpdatingStage}
              className={`flex-1 min-w-[60px] py-2 px-2 text-xs font-medium rounded transition-all ${
                selectedStageId === stage.id
                  ? `${getStageColor(stage.name, stage.isWon)} text-white`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${isUpdatingStage ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {isUpdatingStage && selectedStageId === stage.id ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                <span className="truncate block">{stage.name}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue & Probability */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">{t('crm.expectedRevenue')}</div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">
              {formatCompactAmount(lead.expectedRevenue)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">{t('crm.probability')}</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${getProbabilityColor(lead.probability)}`}
                  style={{ width: `${lead.probability}%` }}
                />
              </div>
              <span className={`text-sm font-medium tabular-nums ${
                lead.probability >= 50 ? 'text-green-600' : 'text-gray-600'
              }`}>
                {lead.probability}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="text-xs text-gray-500 mb-3">連絡先</div>
        <div className="space-y-3">
          {displayContact && (
            <div className="flex items-center gap-3">
              <Building className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-900">{displayContact}</span>
            </div>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-3 text-blue-600 hover:text-blue-700"
            >
              <Mail className="w-4 h-4" />
              <span className="text-sm">{lead.email}</span>
            </a>
          )}
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="flex items-center gap-3 text-blue-600 hover:text-blue-700"
            >
              <Phone className="w-4 h-4" />
              <span className="text-sm">{lead.phone}</span>
            </a>
          )}
          {lead.mobile && lead.mobile !== lead.phone && (
            <a
              href={`tel:${lead.mobile}`}
              className="flex items-center gap-3 text-blue-600 hover:text-blue-700"
            >
              <Phone className="w-4 h-4" />
              <span className="text-sm">{lead.mobile} (携帯)</span>
            </a>
          )}
          {lead.website && (
            <a
              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-blue-600 hover:text-blue-700"
            >
              <Globe className="w-4 h-4" />
              <span className="text-sm truncate">{lead.website}</span>
            </a>
          )}
          {fullAddress && (
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
              <span className="text-sm text-gray-900">{fullAddress}</span>
            </div>
          )}
        </div>
      </div>

      {/* Assignment & Dates */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="grid grid-cols-2 gap-4">
          {lead.userName && (
            <div>
              <div className="text-xs text-gray-500">担当者</div>
              <div className="flex items-center gap-2 mt-1">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-900">{lead.userName}</span>
              </div>
            </div>
          )}
          {lead.teamName && (
            <div>
              <div className="text-xs text-gray-500">チーム</div>
              <div className="text-sm text-gray-900 mt-1">{lead.teamName}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-500">{t('crm.createdAt')}</div>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-900">{formatDate(lead.createdAt)}</span>
            </div>
          </div>
          {lead.deadline && (
            <div>
              <div className="text-xs text-gray-500">期限</div>
              <div className={`flex items-center gap-2 mt-1 ${lead.isOverdue ? 'text-red-600' : ''}`}>
                <Clock className="w-4 h-4" />
                <span className="text-sm">{formatDate(lead.deadline)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Marketing Info */}
      {(lead.sourceName || lead.mediumName || lead.campaignName || lead.referred) && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
          <div className="text-xs text-gray-500 mb-3">マーケティング情報</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {lead.sourceName && (
              <div>
                <span className="text-gray-500">ソース:</span>{' '}
                <span className="text-gray-900">{lead.sourceName}</span>
              </div>
            )}
            {lead.mediumName && (
              <div>
                <span className="text-gray-500">媒体:</span>{' '}
                <span className="text-gray-900">{lead.mediumName}</span>
              </div>
            )}
            {lead.campaignName && (
              <div>
                <span className="text-gray-500">キャンペーン:</span>{' '}
                <span className="text-gray-900">{lead.campaignName}</span>
              </div>
            )}
            {lead.referred && (
              <div>
                <span className="text-gray-500">紹介元:</span>{' '}
                <span className="text-gray-900">{lead.referred}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activities */}
      {lead.activities.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 mb-3">
          <button
            onClick={() => setShowActivities(!showActivities)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className="font-medium text-gray-900">
              アクティビティ ({lead.activities.length})
            </span>
            {showActivities ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showActivities && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {lead.activities.map((activity) => (
                <div key={activity.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      {activity.type}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      activity.state === 'overdue'
                        ? 'bg-red-100 text-red-700'
                        : activity.state === 'today'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {formatDate(activity.deadline)}
                    </span>
                  </div>
                  {activity.summary && (
                    <div className="text-sm text-gray-600">{activity.summary}</div>
                  )}
                  {activity.userName && (
                    <div className="text-xs text-gray-400 mt-1">
                      担当: {activity.userName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {lead.description && (
        <div className="bg-white rounded-lg border border-gray-200 mb-3">
          <button
            onClick={() => setShowDescription(!showDescription)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className="font-medium text-gray-900">メモ</span>
            {showDescription ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showDescription && (
            <div className="border-t border-gray-100 px-4 py-3">
              <div className="text-sm text-gray-700 whitespace-pre-wrap">
                {lead.description}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lost Reason */}
      {lead.lostReasonName && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-4 mb-3">
          <div className="text-xs text-red-600 mb-1">失注理由</div>
          <div className="text-sm text-red-800">{lead.lostReasonName}</div>
        </div>
      )}

      {/* Last Updated */}
      <div className="text-center text-xs text-gray-400 mb-4">
        最終更新: {formatRelativeDate(lead.updatedAt)}
      </div>
    </div>
  );
}
