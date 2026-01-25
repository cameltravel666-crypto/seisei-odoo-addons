'use client';

import { useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import type { ExportTarget } from '@/types/export';

export interface ExportTargetInfo {
  name: string;
  nameJa: string;
  description: string;
  descriptionJa: string;
  helpUrl?: string;
}

export interface ExportTargetSelectorProps {
  targets: Record<ExportTarget, ExportTargetInfo>;
  selected: ExportTarget | null;
  onSelect: (target: ExportTarget) => void;
  disabled?: boolean;
  availableTargets?: ExportTarget[];
}

// Target logos/icons
const TARGET_ICONS: Record<ExportTarget, string> = {
  freee: '🟢',
  moneyforward: '🔵',
  yayoi: '🟡',
};

/**
 * ExportTargetSelector - Select accounting software export target
 */
export function ExportTargetSelector({
  targets,
  selected,
  onSelect,
  disabled = false,
  availableTargets,
}: ExportTargetSelectorProps) {
  const targetList = Object.entries(targets) as [ExportTarget, ExportTargetInfo][];

  const isAvailable = (target: ExportTarget) => {
    return !availableTargets || availableTargets.includes(target);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {targetList.map(([id, info]) => {
        const isSelected = selected === id;
        const available = isAvailable(id);
        const isDisabled = disabled || !available;

        return (
          <button
            key={id}
            type="button"
            onClick={() => !isDisabled && onSelect(id)}
            disabled={isDisabled}
            className={`
              relative p-4 rounded-xl border-2 text-left transition-all
              ${isSelected
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300 bg-white'
              }
              ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {/* Selected indicator */}
            {isSelected && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}

            {/* Target icon */}
            <div className="text-2xl mb-2">{TARGET_ICONS[id]}</div>

            {/* Target name */}
            <h3 className={`font-semibold ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
              {info.nameJa}
            </h3>

            {/* Description */}
            <p className={`text-xs mt-1 ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
              {info.descriptionJa}
            </p>

            {/* Help link */}
            {info.helpUrl && (
              <a
                href={info.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-2"
              >
                インポート手順
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {/* Unavailable badge */}
            {!available && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl">
                <span className="text-xs text-gray-500">利用不可</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
