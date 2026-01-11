'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Users, Coffee, CheckCircle, XCircle, RefreshCw,
  LayoutGrid, DoorOpen, Receipt, MoreHorizontal,
} from 'lucide-react';
import { useTables, useUpdateTable, type FloorInfo, type TableInfo } from '@/hooks/use-pos';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { BottomActionBar, type BottomAction } from '@/components/ui/bottom-action-bar';

export default function TablesPage() {
  const t = useTranslations();
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [updatingTable, setUpdatingTable] = useState<number | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useTables();
  const updateMutation = useUpdateTable();

  const handleToggleTable = async (table: TableInfo) => {
    setUpdatingTable(table.id);
    try {
      await updateMutation.mutateAsync({
        table_id: table.id,
        action: table.isOccupied ? 'close' : 'open',
      });
    } catch (err) {
      const message = (err as Error).message || t('common.error');
      alert(message);
    } finally {
      setUpdatingTable(null);
    }
  };

  const floors = data?.floors || [];
  const stats = data?.stats || { total: 0, occupied: 0, available: 0 };
  const moduleNotInstalled = data?.moduleNotInstalled;
  const posUrl = data?.posUrl;

  // Show QR code link for table
  const handleShowQRLink = (table: TableInfo) => {
    const qrUrl = `${window.location.origin}/order/${table.id}`;
    // Copy to clipboard
    navigator.clipboard.writeText(qrUrl).then(() => {
      alert(`${t('pos.qrLinkCopied') || 'QR码链接已复制'}\n${qrUrl}`);
    }).catch(() => {
      alert(`${t('pos.qrLink') || 'QR码链接'}:\n${qrUrl}`);
    });
  };

  // Filter floors if one is selected
  const displayFloors = selectedFloor
    ? floors.filter((f) => f.id === selectedFloor)
    : floors;

  // Bottom action bar actions
  const bottomActions: BottomAction[] = [
    {
      key: 'all',
      icon: LayoutGrid,
      label: t('common.all'),
      onClick: () => setSelectedFloor(null),
      active: selectedFloor === null,
    },
    {
      key: 'open',
      icon: DoorOpen,
      label: t('pos.openTable'),
      variant: 'primary',
      onClick: () => {
        // Scroll to first available table or show toast
        const firstAvailable = displayFloors
          .flatMap((f) => f.tables)
          .find((t) => !t.isOccupied);
        if (firstAvailable) {
          document.getElementById(`table-${firstAvailable.id}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      },
    },
    {
      key: 'checkout',
      icon: Receipt,
      label: t('pos.checkout'),
      variant: 'danger',
      onClick: () => {
        // Scroll to first occupied table
        const firstOccupied = displayFloors
          .flatMap((f) => f.tables)
          .find((t) => t.isOccupied);
        if (firstOccupied) {
          document.getElementById(`table-${firstOccupied.id}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      },
    },
    {
      key: 'more',
      icon: MoreHorizontal,
      label: t('common.more'),
      onClick: () => {
        // Future: show more options
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="pb-20">
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-lg">
        {t('common.error')}: {error.message}
      </div>
    );
  }

  return (
    <div className="section-gap pb-[calc(var(--height-bottom-bar)+var(--safe-area-bottom)+var(--space-4))]">
      {/* Header */}
      <div className="flex-between">
        <h1 className="page-title">{t('pos.tables')}</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn btn-sm btn-ghost"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="text-sub">{t('common.refresh')}</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-[var(--space-2)]">
        <KpiCard
          icon={Users}
          iconBg="bg-[var(--color-primary-bg)]"
          iconColor="text-[var(--color-primary)]"
          value={stats.total}
          label={t('pos.totalTables')}
        />
        <KpiCard
          icon={CheckCircle}
          iconBg="bg-[var(--color-success-bg)]"
          iconColor="text-[var(--color-success)]"
          value={stats.available}
          label={t('pos.qrEnabled')}
        />
        <KpiCard
          icon={XCircle}
          iconBg="bg-[var(--color-bg-muted)]"
          iconColor="text-[var(--color-text-tertiary)]"
          value={stats.occupied}
          label={t('pos.qrDisabled')}
        />
      </div>

      {/* Floor Tabs - Segmented Pills */}
      {floors.length > 1 && (
        <div className="flex gap-[var(--space-2)] overflow-x-auto scrollbar-hide -mx-4 px-4">
          <button
            onClick={() => setSelectedFloor(null)}
            className={`segment-pill ${
              selectedFloor === null ? 'segment-pill-active' : 'segment-pill-default'
            }`}
          >
            {t('common.all')} <span className="ml-1 tabular-nums">({stats.total})</span>
          </button>
          {floors.map((floor) => (
            <button
              key={floor.id}
              onClick={() => setSelectedFloor(floor.id)}
              className={`segment-pill ${
                selectedFloor === floor.id ? 'segment-pill-active' : 'segment-pill-default'
              }`}
            >
              {floor.name} <span className="ml-1 tabular-nums">({floor.stats.occupied}/{floor.stats.total})</span>
            </button>
          ))}
        </div>
      )}

      {/* Floors and Tables */}
      {moduleNotInstalled ? (
        <div className="card p-6 text-center">
          <div className="text-gray-400 mb-3">
            <Users className="w-12 h-12 mx-auto" />
          </div>
          <h3 className="text-base font-medium text-gray-900 mb-1">{t('pos.restaurantModuleNotInstalled')}</h3>
          <p className="text-sm text-gray-500">{t('pos.restaurantModuleNotInstalledDesc')}</p>
        </div>
      ) : displayFloors.length === 0 ? (
        <EmptyState
          title={t('pos.noTables')}
          description={t('pos.noTablesDesc')}
        />
      ) : (
        <div className="space-y-4">
          {displayFloors.map((floor) => (
            <FloorSection
              key={floor.id}
              floor={floor}
              onToggleTable={handleToggleTable}
              onShowQRLink={handleShowQRLink}
              updatingTable={updatingTable}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Bottom Action Bar */}
      <BottomActionBar actions={bottomActions} />
    </div>
  );
}

// Compact KPI Card Component
interface KpiCardProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  value: number;
  label: string;
}

function KpiCard({ icon: Icon, iconBg, iconColor, value, label }: KpiCardProps) {
  return (
    <div className="card kpi-card">
      <div className={`p-2 rounded-[var(--radius-md)] flex-shrink-0 ${iconBg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="kpi-value">{value}</p>
        <p className="kpi-title text-truncate">{label}</p>
      </div>
    </div>
  );
}

interface FloorSectionProps {
  floor: FloorInfo;
  onToggleTable: (table: TableInfo) => void;
  onShowQRLink: (table: TableInfo) => void;
  updatingTable: number | null;
  t: ReturnType<typeof useTranslations>;
}

function FloorSection({ floor, onToggleTable, onShowQRLink, updatingTable, t }: FloorSectionProps) {
  return (
    <div className="card overflow-hidden">
      {/* Floor header */}
      <div className="px-[var(--space-3)] py-[var(--space-2)] bg-[var(--color-bg-muted)] border-b border-[var(--color-border-light)] flex-between">
        <h2 className="section-title">{floor.name}</h2>
        <div className="flex items-center gap-[var(--space-3)] text-sub">
          <span className="icon-text" title={t('pos.qrEnabled')}>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
            <span className="tabular-nums">{floor.stats.available}</span>
          </span>
          <span className="icon-text" title={t('pos.qrDisabled')}>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)]" />
            <span className="tabular-nums">{floor.stats.occupied}</span>
          </span>
        </div>
      </div>

      {/* Tables grid - Compact */}
      <div className="p-3">
        {floor.tables.length === 0 ? (
          <p className="text-gray-500 text-center text-sm py-6">{t('pos.noTablesInFloor')}</p>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {floor.tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                onToggle={() => onToggleTable(table)}
                onShowQRLink={() => onShowQRLink(table)}
                isUpdating={updatingTable === table.id}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TableCardProps {
  table: TableInfo;
  onToggle: () => void;
  onShowQRLink: () => void;
  isUpdating: boolean;
  t: ReturnType<typeof useTranslations>;
}

function TableCard({ table, onToggle, onShowQRLink, isUpdating, t }: TableCardProps) {
  // New logic: isOccupied means QR is DISABLED (has draft order to block it)
  // Default (no order) = QR is ENABLED
  const isQREnabled = !table.isOccupied;

  // Click card to show QR link
  const handleCardClick = () => {
    onShowQRLink();
  };

  return (
    <div
      id={`table-${table.id}`}
      onClick={handleCardClick}
      className={`rounded-[var(--radius-md)] p-[var(--space-2)] transition-all border text-center flex flex-col cursor-pointer ${
        isQREnabled
          ? 'bg-[var(--color-success-bg)] border-[var(--color-success)]/20 hover:bg-[var(--color-success)]/10'
          : 'bg-[var(--color-bg-muted)] border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)]'
      }`}
      style={{ minHeight: '100px' }}
    >
      {/* Table name */}
      <div className="text-body font-bold tabular-nums">{table.name}</div>

      {/* Seats */}
      <div className="text-micro">
        {table.seats}{t('pos.seats')}
      </div>

      {/* Status badge */}
      <div
        className={`text-micro font-medium px-[var(--space-2)] py-0.5 rounded-full inline-block mt-1 ${
          isQREnabled
            ? 'bg-[var(--color-success)]/20 text-[var(--color-success-text)]'
            : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'
        }`}
      >
        {isQREnabled ? t('pos.qrEnabled') : t('pos.qrDisabled')}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        disabled={isUpdating}
        className={`w-full rounded-[var(--radius-sm)] text-micro font-medium py-1 mt-1 transition-colors flex-center gap-0.5 ${
          isQREnabled
            ? 'bg-[var(--color-text-secondary)] text-white hover:bg-[var(--color-text-primary)]'
            : 'bg-[var(--color-success)] text-white hover:bg-[var(--color-success-hover)]'
        } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isUpdating ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : isQREnabled ? (
          <>
            <XCircle className="w-3 h-3" />
            <span>{t('pos.disableQR')}</span>
          </>
        ) : (
          <>
            <CheckCircle className="w-3 h-3" />
            <span>{t('pos.enableQR')}</span>
          </>
        )}
      </button>
    </div>
  );
}
