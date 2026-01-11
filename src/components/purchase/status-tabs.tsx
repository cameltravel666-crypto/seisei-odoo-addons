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
  const getTabColor = (tab: QueueType, isActive: boolean) => {
    if (isActive) {
      return 'border-blue-600 text-blue-600 bg-blue-50';
    }
    return 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50';
  };

  const getBadgeColor = (tab: QueueType, isActive: boolean) => {
    if (isActive) {
      return 'bg-blue-600 text-white';
    }
    switch (tab) {
      case 'to_confirm':
        return 'bg-yellow-100 text-yellow-700';
      case 'to_receive':
        return 'bg-blue-100 text-blue-700';
      case 'to_pay':
        return 'bg-orange-100 text-orange-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div
      className="flex border-b border-gray-200 overflow-x-auto"
      style={{ height: 'var(--height-tab)', minHeight: 'var(--height-tab)' }}
    >
      {tabs.map((tab) => {
        const isActive = activeQueue === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`flex items-center gap-2 px-4 text-body-sm font-medium border-b-2 transition whitespace-nowrap ${getTabColor(
              tab.value,
              isActive
            )}`}
            style={{ height: 'var(--height-tab)' }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`min-w-[20px] h-5 px-1.5 text-caption font-medium rounded-full inline-flex items-center justify-center tabular-nums ${getBadgeColor(
                  tab.value,
                  isActive
                )}`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
