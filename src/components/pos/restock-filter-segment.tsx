'use client';

export type FilterStatus = 'all' | 'critical' | 'warning' | 'handled';

interface FilterOption {
  value: FilterStatus;
  label: string;
  count: number;
}

interface RestockFilterSegmentProps {
  value: FilterStatus;
  onChange: (value: FilterStatus) => void;
  counts: {
    all: number;
    critical: number;
    warning: number;
    handled: number;
  };
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}

export function RestockFilterSegment({
  value,
  onChange,
  counts,
  t,
}: RestockFilterSegmentProps) {
  const options: FilterOption[] = [
    { value: 'all', label: t('all'), count: counts.all },
    { value: 'critical', label: t('critical'), count: counts.critical },
    { value: 'warning', label: t('warning'), count: counts.warning },
    { value: 'handled', label: t('handled'), count: counts.handled },
  ];

  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            value === option.value
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {option.label}
          <span
            className={`ml-1 ${
              value === option.value ? 'text-blue-100' : 'text-gray-400'
            }`}
          >
            ({option.count})
          </span>
        </button>
      ))}
    </div>
  );
}
