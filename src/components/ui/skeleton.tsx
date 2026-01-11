'use client';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Skeleton - Base skeleton loading component
 * Uses CSS animation from globals.css
 */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={style}
    />
  );
}

/**
 * KpiCardSkeleton - Skeleton for KPI card
 * Height: 84px (--height-kpi-card)
 */
export function KpiCardSkeleton() {
  return (
    <div className="card kpi-card">
      <Skeleton className="w-9 h-9 flex-shrink-0" style={{ borderRadius: 'var(--radius-md)' }} />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-6 w-12" />
      </div>
    </div>
  );
}

/**
 * ListItemSkeleton - Skeleton for list item
 * Height: 64px (--height-list-item)
 */
export function ListItemSkeleton() {
  return (
    <div className="list-item gap-[var(--space-3)]">
      <Skeleton className="w-10 h-10 flex-shrink-0" style={{ borderRadius: 'var(--radius-md)' }} />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-16 flex-shrink-0" />
    </div>
  );
}

/**
 * ListSkeleton - Multiple list item skeletons
 */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="card overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * SummaryBarSkeleton - Skeleton for summary bar
 * Height: 48px (--height-summary-bar)
 */
export function SummaryBarSkeleton() {
  return (
    <div
      className="card-flat flex items-center justify-between px-[var(--space-4)]"
      style={{ height: 'var(--height-summary-bar)' }}
    >
      <div className="flex items-center gap-[var(--space-2)]">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-5 w-8" />
      </div>
      <div className="flex items-center gap-[var(--space-2)]">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex items-center gap-[var(--space-2)]">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

/**
 * TabsContentSkeleton - Skeleton for tab content area
 * Prevents layout shift when switching tabs
 */
export function TabsContentSkeleton({ minHeight = 200 }: { minHeight?: number }) {
  return (
    <div className="flex-center" style={{ minHeight }}>
      <div className="flex flex-col items-center gap-[var(--space-2)]">
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

/**
 * TableRowSkeleton - Skeleton for table row
 */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="list-item-sm gap-[var(--space-3)]">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="flex-1">
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * ProductCardSkeleton - Skeleton for product card
 * Matches the layout of product cards in Products page
 */
export function ProductCardSkeleton() {
  return (
    <div className="card p-[var(--space-3)]">
      <div className="flex gap-[var(--space-3)]">
        {/* Checkbox placeholder */}
        <div className="flex-shrink-0 pt-1">
          <Skeleton className="w-4 h-4" style={{ borderRadius: '4px' }} />
        </div>
        {/* Image placeholder */}
        <Skeleton
          className="flex-shrink-0"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-md)',
          }}
        />
        {/* Content placeholder */}
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <div className="flex gap-1 mt-2">
            <Skeleton className="h-5 w-12" style={{ borderRadius: 'var(--radius-full)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ProductGridSkeleton - Multiple product card skeletons in grid
 */
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-3)]">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * SearchBarSkeleton - Skeleton for search bar
 * Height: 44px (--height-input)
 */
export function SearchBarSkeleton() {
  return (
    <Skeleton
      className="w-full"
      style={{
        height: 'var(--height-input)',
        borderRadius: 'var(--radius-md)',
      }}
    />
  );
}

/**
 * PageHeaderSkeleton - Skeleton for page header
 * Height: 48px (--height-summary-bar)
 */
export function PageHeaderSkeleton() {
  return (
    <div
      className="flex items-center justify-between"
      style={{ height: 'var(--height-summary-bar)' }}
    >
      <Skeleton className="h-6 w-24" />
      <Skeleton
        className="w-32"
        style={{
          height: 'var(--height-button)',
          borderRadius: 'var(--radius-md)',
        }}
      />
    </div>
  );
}
