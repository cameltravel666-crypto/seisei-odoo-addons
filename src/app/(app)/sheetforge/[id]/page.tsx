'use client';

import { useState, useRef, use } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  FileText,
  X,
  Loader2,
  PlayCircle,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import type { ApiResponse } from '@/types';

interface TaskSource {
  id: number;
  name: string;
  filename: string | null;
  state: 'pending' | 'processing' | 'done' | 'failed';
  errorMessage: string | null;
  createDate: string;
}

interface TaskDetail {
  id: number;
  name: string;
  createDate: string;
  writeDate: string;
  state: 'draft' | 'processing' | 'done' | 'failed';
  templateFilename: string | null;
  outputFilename: string | null;
  resultData: unknown;
  errorMessage: string | null;
  sources: TaskSource[];
}

// Source state badge
function SourceStateBadge({ state }: { state: TaskSource['state'] }) {
  const config = {
    pending: { icon: Clock, color: 'bg-gray-100 text-gray-600' },
    processing: { icon: Loader2, color: 'bg-blue-100 text-blue-600' },
    done: { icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
    failed: { icon: AlertCircle, color: 'bg-red-100 text-red-600' },
  };

  const { icon: Icon, color } = config[state] || config.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>
      <Icon className={`w-3 h-3 ${state === 'processing' ? 'animate-spin' : ''}`} />
    </span>
  );
}

// Task state badge (larger)
function TaskStateBadge({ state, t }: { state: TaskDetail['state']; t: (key: string) => string }) {
  const config = {
    draft: { icon: Clock, color: 'bg-gray-100 text-gray-700', labelKey: 'sheetforge.stateDraft' },
    processing: { icon: Loader2, color: 'bg-blue-100 text-blue-700', labelKey: 'sheetforge.stateProcessing' },
    done: { icon: CheckCircle2, color: 'bg-green-100 text-green-700', labelKey: 'sheetforge.stateDone' },
    failed: { icon: AlertCircle, color: 'bg-red-100 text-red-700', labelKey: 'sheetforge.stateFailed' },
  };

  const { icon: Icon, color, labelKey } = config[state] || config.draft;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full ${color}`}>
      <Icon className={`w-4 h-4 ${state === 'processing' ? 'animate-spin' : ''}`} />
      {t(labelKey)}
    </span>
  );
}

export default function SheetForgeTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Fetch task detail
  const { data: task, isLoading, error, refetch } = useQuery({
    queryKey: ['sheetforge-task', id],
    queryFn: async () => {
      const res = await fetch(`/api/sheetforge/tasks/${id}`);
      const json: ApiResponse<TaskDetail> = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data!;
    },
    refetchInterval: (query) => {
      // Auto-refresh while processing
      const task = query.state.data;
      if (task?.state === 'processing') {
        return 3000;
      }
      return false;
    },
  });

  // Upload sources mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const res = await fetch(`/api/sheetforge/tasks/${id}/sources`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Upload failed');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetforge-task', id] });
      setUploadingFiles(false);
    },
    onError: () => {
      setUploadingFiles(false);
    },
  });

  // Delete source mutation
  const deleteSourceMutation = useMutation({
    mutationFn: async (sourceId: number) => {
      const res = await fetch(`/api/sheetforge/tasks/${id}/sources?sourceId=${sourceId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Delete failed');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetforge-task', id] });
    },
  });

  // Start OCR mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sheetforge/tasks/${id}/start`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Start failed');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetforge-task', id] });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    uploadMutation.mutate(Array.from(files));

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    window.open(`/api/sheetforge/tasks/${id}/download`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-gray-600 mb-4">{(error as Error)?.message || t('sheetforge.taskNotFound')}</p>
        <Link href="/sheetforge" className="text-blue-600 hover:underline">
          {t('common.back')}
        </Link>
      </div>
    );
  }

  const canStart = task.state === 'draft' && task.sources.length > 0;
  const isProcessing = task.state === 'processing' || startMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/sheetforge" className="p-1 -ml-1">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">{task.name}</h1>
            <p className="text-xs text-gray-500">
              {t('sheetforge.created')}: {new Date(task.createDate).toLocaleString('ja-JP')}
            </p>
          </div>
          <TaskStateBadge state={task.state} t={t} />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Template Info */}
        <div className="card p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">{t('sheetforge.templateFile')}</h2>
          {task.templateFilename ? (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{task.templateFilename}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t('sheetforge.noTemplate')}</p>
          )}
        </div>

        {/* Source Files */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">
              {t('sheetforge.sourceFiles')} ({task.sources.length})
            </h2>
            {task.state === 'draft' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFiles}
                className="flex items-center gap-1 text-sm text-blue-600 hover:underline disabled:opacity-50"
              >
                {uploadingFiles ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {t('sheetforge.addFiles')}
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {task.sources.length === 0 ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={task.state !== 'draft' || uploadingFiles}
              className="w-full flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-gray-500" />
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-700">{t('sheetforge.uploadSources')}</p>
                <p className="text-sm text-gray-500">{t('sheetforge.sourceFormats')}</p>
              </div>
            </button>
          ) : (
            <div className="space-y-2">
              {task.sources.map((source) => (
                <div key={source.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {source.filename || source.name}
                    </p>
                    {source.state === 'failed' && source.errorMessage && (
                      <p className="text-xs text-red-600 truncate">{source.errorMessage}</p>
                    )}
                  </div>
                  <SourceStateBadge state={source.state} />
                  {task.state === 'draft' && (
                    <button
                      onClick={() => {
                        if (confirm(t('common.confirmDelete'))) {
                          deleteSourceMutation.mutate(source.id);
                        }
                      }}
                      disabled={deleteSourceMutation.isPending}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error Message */}
        {task.state === 'failed' && task.errorMessage && (
          <div className="card p-4 bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-red-800">{t('sheetforge.processingFailed')}</h3>
                <p className="text-sm text-red-700 mt-1">{task.errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Output File */}
        {task.state === 'done' && task.outputFilename && (
          <div className="card p-4 bg-green-50 border-green-200">
            <h2 className="text-sm font-medium text-green-800 mb-3">{t('sheetforge.outputFile')}</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-200 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-green-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-green-900 truncate">{task.outputFilename}</p>
                <p className="text-sm text-green-700">{t('sheetforge.readyToDownload')}</p>
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <Download className="w-4 h-4" />
                {t('sheetforge.download')}
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 pt-4">
          {task.state === 'draft' && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={!canStart || isProcessing}
              className={`w-full py-3 flex items-center justify-center gap-2 rounded-lg font-medium transition ${
                canStart && !isProcessing
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('sheetforge.starting')}
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5" />
                  {t('sheetforge.startOcr')}
                </>
              )}
            </button>
          )}

          {task.state === 'processing' && (
            <div className="flex items-center justify-center gap-2 py-4 text-blue-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('sheetforge.processingInProgress')}</span>
            </div>
          )}

          {task.state === 'done' && (
            <button
              onClick={handleDownload}
              className="w-full py-3 flex items-center justify-center gap-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition"
            >
              <Download className="w-5 h-5" />
              {t('sheetforge.downloadResult')}
            </button>
          )}

          {task.state === 'failed' && (
            <button
              onClick={() => refetch()}
              className="w-full py-3 flex items-center justify-center gap-2 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
            >
              <RefreshCw className="w-5 h-5" />
              {t('common.refresh')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
