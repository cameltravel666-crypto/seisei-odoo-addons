'use client';

export type QueueType = 'to_confirm' | 'to_receive' | 'to_pay' | 'completed';

interface TabConfig {
  value: QueueType;
  label: string;
  count: number;
}

interface StatusTabsProps {
  tabs: TabConfig[];
  activeQueue: QueueType;
  onChange: (queue: QueueType) => void;
}

export function StatusTabs({ tabs, activeQueue, onChange }: StatusTabsProps) {
  const getBadgeVariant = (tab: QueueType, isActive: boolean) => {
    if (isActive) return 'status-tab-badge-active';
    switch (tab) {
      case 'to_confirm':
        return 'status-tab-badge-warning';
      case 'to_receive':
        return 'status-tab-badge-info';
      case 'to_pay':
        return 'status-tab-badge-danger';
      case 'completed':
        return 'status-tab-badge-success';
      default:
        return 'status-tab-badge-default';
    }
  };

  return (
    <div className="status-tabs">
      {tabs.map((tab) => {
        const isActive = activeQueue === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`status-tab ${isActive ? 'status-tab-active' : ''}`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`status-tab-badge ${getBadgeVariant(tab.value, isActive)}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
