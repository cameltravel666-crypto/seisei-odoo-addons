'use client';

export interface StatusTab {
  key: string;
  label: string;
  count?: number;
}

interface StatusTabsProps {
  tabs: StatusTab[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * StatusTabs - Fixed height status filter tabs
 * Height: 44px (--height-tab-bar)
 * Used for filtering lists by status
 */
export function StatusTabs({ tabs, value, onChange, className = '' }: StatusTabsProps) {
  return (
    <div className={`tabs-container ${className}`}>
      {tabs.map((tab) => {
        const isActive = value === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`tab-item gap-1.5 ${isActive ? 'tab-item-active' : ''}`}
          >
            <span className="text-truncate">{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`tabular-nums ${
                isActive
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-text-tertiary)]'
              }`}>
                ({tab.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * SegmentTabs - Pill-style segment tabs (like floor tabs)
 * Height: 40px (--height-segment)
 */
export interface SegmentTab {
  key: string;
  label: string;
  count?: number;
}

interface SegmentTabsProps {
  tabs: SegmentTab[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export function SegmentTabs({ tabs, value, onChange, className = '' }: SegmentTabsProps) {
  return (
    <div
      className={`flex gap-[var(--space-2)] overflow-x-auto scrollbar-hide ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = value === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`segment-pill ${
              isActive ? 'segment-pill-active' : 'segment-pill-default'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="ml-1 tabular-nums">({tab.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
