'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  FileSpreadsheet,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Download,
  PlayCircle,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { EmptyState, Pagination, ListSkeleton, FAB } from '@/components/ui';
import type { ApiResponse } from '@/types';

type TaskState = 'draft' | 'processing' | 'done' | 'failed' | 'all';

interface SheetForgeTask {
  id: number;
  name: string;
  createDate: string;
  writeDate: string;
  state: TaskState;
  templateFilename: string | null;
  sourceCount: number;
  outputFilename: string | null;
  errorMessage: string | null;
}

interface TasksData {
  items: SheetForgeTask[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// Status badge component
function StateBadge({ state }: { state: TaskState }) {
  const config = {
    draft: { icon: Clock, color: 'bg-gray-100 text-gray-600', label: 'Draft' },
    processing: { icon: Loader2, color: 'bg-blue-100 text-blue-600', label: 'Processing' },
    done: { icon: CheckCircle2, color: 'bg-green-100 text-green-600', label: 'Done' },
    failed: { icon: AlertCircle, color: 'bg-red-100 text-red-600', label: 'Failed' },
    all: { icon: FileSpreadsheet, color: 'bg-gray-100 text-gray-600', label: 'All' },
  };

  const { icon: Icon, color, label } = config[state] || config.draft;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>
      <Icon className={`w-3 h-3 ${state === 'processing' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

// Task list item component
function TaskListItem({
  task,
  onDelete,
  onDownload,
  t,
}: {
  task: SheetForgeTask;
  onDelete: (id: number) => void;
  onDownload: (id: number) => void;
  t: (key: string) => string;
}) {
  const router = useRouter();

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
      onClick={() => router.push(`/sheetforge/${task.id}`)}
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
        <FileSpreadsheet className="w-5 h-5 text-blue-600" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">{task.name}</span>
          <StateBadge state={task.state} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          {task.templateFilename && (
            <span className="flex items-center gap-1 truncate max-w-[150px]">
              <FileText className="w-3 h-3" />
              {task.templateFilename}
            </span>
          )}
          <span>{task.sourceCount} {t('sheetforge.sources')}</span>
          <span>{new Date(task.createDate).toLocaleDateString('ja-JP')}</span>
        </div>
        {task.state === 'failed' && task.errorMessage && (
          <p className="mt-1 text-xs text-red-600 truncate">{task.errorMessage}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {task.state === 'done' && task.outputFilename && (
          <button
            onClick={() => onDownload(task.id)}
            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
            title={t('sheetforge.download')}
          >
            <Download className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => {
            if (confirm(t('common.confirmDelete'))) {
              onDelete(task.id);
            }
          }}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
          title={t('common.delete')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
}

// Status tabs component
function StatusTabs({
  activeState,
  onChange,
  counts,
  t,
}: {
  activeState: TaskState;
  onChange: (state: TaskState) => void;
  counts: Record<TaskState, number>;
  t: (key: string) => string;
}) {
  const tabs: { value: TaskState; labelKey: string }[] = [
    { value: 'all', labelKey: 'sheetforge.stateAll' },
    { value: 'draft', labelKey: 'sheetforge.stateDraft' },
    { value: 'processing', labelKey: 'sheetforge.stateProcessing' },
    { value: 'done', labelKey: 'sheetforge.stateDone' },
    { value: 'failed', labelKey: 'sheetforge.stateFailed' },
  ];

  return (
    <div
      className="flex border-b border-gray-200 overflow-x-auto"
      style={{ height: 'var(--height-tab)', minHeight: 'var(--height-tab)' }}
    >
      {tabs.map((tab) => {
        const isActive = activeState === tab.value;
        const count = counts[tab.value] || 0;

        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`flex items-center gap-2 px-4 text-body-sm font-medium border-b-2 transition whitespace-nowrap ${
              isActive
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            style={{ height: 'var(--height-tab)' }}
          >
            {t(tab.labelKey)}
            {count > 0 && tab.value !== 'all' && (
              <span className={`min-w-[20px] h-5 px-1.5 text-caption font-medium rounded-full inline-flex items-center justify-center tabular-nums ${
                isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function SheetForgePage() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [activeState, setActiveState] = useState<TaskState>('all');

  // Fetch tasks
  const { data, isLoading, error } = useQuery({
    queryKey: ['sheetforge-tasks', activeState, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeState !== 'all') {
        params.set('state', activeState);
      }
      params.set('page', page.toString());
      params.set('limit', '20');

      const res = await fetch(`/api/sheetforge/tasks?${params}`);
      const json: ApiResponse<TasksData> = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data!;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const res = await fetch(`/api/sheetforge/tasks/${taskId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Delete failed');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetforge-tasks'] });
    },
  });

  // Download handler
  const handleDownload = async (taskId: number) => {
    window.open(`/api/sheetforge/tasks/${taskId}/download`, '_blank');
  };

  // Count tasks by state (mock for now, would need API enhancement)
  const stateCounts: Record<TaskState, number> = {
    all: data?.pagination.total || 0,
    draft: 0,
    processing: 0,
    done: 0,
    failed: 0,
  };

  // Count from current items (limited accuracy)
  if (data?.items) {
    data.items.forEach((task) => {
      if (task.state in stateCounts) {
        stateCounts[task.state as TaskState]++;
      }
    });
  }

  const handleStateChange = (state: TaskState) => {
    setActiveState(state);
    setPage(1);
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Header */}
      <div className="page-header-sticky">
        <div className="page-header-title">
          <h1 className="page-title">{t('nav.sheetforge')}</h1>
        </div>
        <p className="text-sm text-gray-500 px-4 pb-2">
          {t('sheetforge.description')}
        </p>
      </div>

      {/* Status Tabs */}
      <StatusTabs
        activeState={activeState}
        onChange={handleStateChange}
        counts={stateCounts}
        t={t}
      />

      {/* Task List */}
      {isLoading ? (
        <ListSkeleton count={5} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState
          icon="file"
          title={t('sheetforge.noTasks')}
          description={t('sheetforge.noTasksDescription')}
          action={
            <button
              onClick={() => router.push('/sheetforge/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              {t('sheetforge.createTask')}
            </button>
          }
        />
      ) : (
        <>
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {data.items.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                onDelete={deleteMutation.mutate}
                onDownload={handleDownload}
                t={t}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          <p className="text-center text-xs text-gray-400">
            {t('common.totalItems', { count: data.pagination.total })}
          </p>
        </>
      )}

      {/* FAB - Create Task */}
      <FAB href="/sheetforge/new" label={t('sheetforge.createTask')} />
    </div>
  );
}
