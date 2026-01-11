'use client';

import { formatCompactAmount } from '@/lib/purchase-format';

interface StageStats {
  id: number;
  name: string;
  sequence: number;
  count: number;
  expectedRevenue: number;
  isWon: boolean;
}

interface PipelineChipsProps {
  stages: StageStats[];
  totalCount: number;
  activeStage: number | null;
  onStageChange: (stageId: number | null) => void;
  t: (key: string) => string;
}

// Stage colors - subtle backgrounds
const STAGE_COLORS: Record<string, { bg: string; activeBg: string; dot: string }> = {
  new: { bg: 'bg-gray-100', activeBg: 'bg-gray-200', dot: 'bg-gray-400' },
  qualified: { bg: 'bg-blue-50', activeBg: 'bg-blue-100', dot: 'bg-blue-400' },
  proposition: { bg: 'bg-yellow-50', activeBg: 'bg-yellow-100', dot: 'bg-yellow-400' },
  negotiation: { bg: 'bg-orange-50', activeBg: 'bg-orange-100', dot: 'bg-orange-400' },
  won: { bg: 'bg-green-50', activeBg: 'bg-green-100', dot: 'bg-green-500' },
  lost: { bg: 'bg-red-50', activeBg: 'bg-red-100', dot: 'bg-red-400' },
};

function getStageColor(stageName: string, isWon: boolean, index: number) {
  const nameKey = stageName.toLowerCase();
  if (STAGE_COLORS[nameKey]) {
    return STAGE_COLORS[nameKey];
  }
  if (isWon) {
    return STAGE_COLORS.won;
  }
  // Default colors by index
  const defaults = ['gray', 'blue', 'yellow', 'orange', 'purple'];
  const key = defaults[index % defaults.length];
  return {
    bg: `bg-${key}-50`,
    activeBg: `bg-${key}-100`,
    dot: `bg-${key}-400`,
  };
}

/**
 * Pipeline Chips - Horizontal scrollable stage filter
 * Shows stage distribution with counts and revenue
 */
export function PipelineChips({
  stages,
  totalCount,
  activeStage,
  onStageChange,
  t,
}: PipelineChipsProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {/* All chip */}
      <button
        onClick={() => onStageChange(null)}
        className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center ${
          activeStage === null
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
        style={{ height: 'var(--height-button-sm)', minHeight: 'var(--height-button-sm)' }}
      >
        <span>{t('common.all')}</span>
        <span className={`ml-1.5 tabular-nums ${activeStage === null ? 'text-blue-100' : 'text-gray-500'}`}>
          ({totalCount})
        </span>
      </button>

      {/* Stage chips */}
      {stages.map((stage, index) => {
        const isActive = activeStage === stage.id;
        const colors = getStageColor(stage.name, stage.isWon, index);

        return (
          <button
            key={stage.id}
            onClick={() => onStageChange(stage.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isActive
                ? 'ring-2 ring-blue-500 ring-offset-1'
                : ''
            } ${stage.isWon ? 'bg-green-50' : colors.bg}`}
            style={{ minHeight: 'var(--height-button-sm)' }}
          >
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${stage.isWon ? 'bg-green-500' : colors.dot}`} />
              <span className={`font-medium ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                {stage.name}
              </span>
              <span className="text-gray-500 tabular-nums">({stage.count})</span>
            </div>
            {stage.expectedRevenue > 0 && (
              <div className="text-xs text-gray-400 mt-0.5 tabular-nums">
                {formatCompactAmount(stage.expectedRevenue)}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
