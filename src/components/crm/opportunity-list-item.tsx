'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { formatCompactAmount } from '@/lib/purchase-format';

interface OpportunityListItemProps {
  id: number;
  name: string;
  partnerName: string | null;
  email: string | null;
  expectedRevenue: number;
  probability: number;
  stageName: string;
  userName: string | null;
  createdAt: string;
  priority: string; // '0', '1', '2', '3'
  isOverdue: boolean;
  t: (key: string) => string;
}

// Stage tag colors based on stage name
function getStageTagStyle(stageName: string): string {
  const name = stageName.toLowerCase();
  if (name.includes('won')) return 'bg-green-100 text-green-700';
  if (name.includes('lost')) return 'bg-red-100 text-red-700';
  if (name.includes('new')) return 'bg-gray-100 text-gray-700';
  if (name.includes('qualified')) return 'bg-blue-100 text-blue-700';
  if (name.includes('proposition')) return 'bg-yellow-100 text-yellow-700';
  if (name.includes('negotiation')) return 'bg-orange-100 text-orange-700';
  return 'bg-indigo-100 text-indigo-700';
}

// Probability bar color
function getProbabilityColor(probability: number): string {
  if (probability >= 70) return 'bg-green-500';
  if (probability >= 40) return 'bg-yellow-500';
  return 'bg-gray-400';
}

// Format date relative or absolute
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (diffDays < 7) return `${diffDays}日前`;

  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

/**
 * Opportunity List Item - Clean hierarchy
 * Row 1: Title + Amount
 * Row 2: Stage tag + Probability bar + Star
 * Row 3: Contact + Date + Owner
 */
export function OpportunityListItem({
  id,
  name,
  partnerName,
  email,
  expectedRevenue,
  probability,
  stageName,
  userName,
  createdAt,
  priority,
  isOverdue,
}: OpportunityListItemProps) {
  const priorityNum = parseInt(priority) || 0;
  const hasHighPriority = priorityNum >= 2;

  // Display name: prefer partner name, fallback to email without domain
  const displayContact = partnerName || (email ? email.split('@')[0] : null);

  return (
    <Link
      href={`/crm/${id}`}
      className="block px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0"
      style={{ minHeight: 'var(--height-list-item-min)' }}
    >
      {/* Row 1: Title + Amount */}
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h3 className="font-medium text-gray-900 text-sm line-clamp-1 flex-1">
          {name}
        </h3>
        <span className="font-semibold text-gray-900 tabular-nums whitespace-nowrap">
          {formatCompactAmount(expectedRevenue)}
        </span>
      </div>

      {/* Row 2: Stage tag + Probability bar + Star */}
      <div className="flex items-center gap-2 mb-1.5">
        {/* Stage Tag */}
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStageTagStyle(stageName)}`}>
          {stageName}
        </span>

        {/* Probability Bar */}
        <div className="flex items-center gap-1.5 flex-1">
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${getProbabilityColor(probability)}`}
              style={{ width: `${probability}%` }}
            />
          </div>
          <span className={`text-xs tabular-nums ${probability >= 50 ? 'text-green-600' : 'text-gray-500'}`}>
            {probability}%
          </span>
        </div>

        {/* Overdue badge */}
        {isOverdue && (
          <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">
            !
          </span>
        )}

        {/* Star (only show if high priority) */}
        {hasHighPriority && (
          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
        )}
      </div>

      {/* Row 3: Contact + Date + Owner */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2 min-w-0">
          {displayContact && (
            <span className="truncate max-w-[150px]">{displayContact}</span>
          )}
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span>{formatDate(createdAt)}</span>
          {userName && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400">{userName}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
