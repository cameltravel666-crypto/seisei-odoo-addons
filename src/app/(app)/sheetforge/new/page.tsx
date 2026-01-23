'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  X,
  Loader2,
} from 'lucide-react';

export default function NewSheetForgeTaskPage() {
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [templateFile, setTemplateFile] = useState<File | null>(null);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('name', name);
      if (templateFile) {
        formData.append('template', templateFile);
      }

      const res = await fetch('/api/sheetforge/tasks', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Create failed');
      return json.data;
    },
    onSuccess: (data) => {
      router.push(`/sheetforge/${data.id}`);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
      ];
      if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert(t('sheetforge.invalidTemplateType'));
        return;
      }
      setTemplateFile(file);
      // Auto-fill name if empty
      if (!name) {
        const baseName = file.name.replace(/\.(xlsx|xls)$/i, '');
        setName(baseName);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  };

  const isValid = name.trim().length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/sheetforge" className="p-1 -ml-1">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 flex-1">
            {t('sheetforge.createTask')}
          </h1>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {/* Task Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('sheetforge.taskName')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('sheetforge.taskNamePlaceholder')}
            className="input w-full"
            required
          />
        </div>

        {/* Template Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('sheetforge.templateFile')}
          </label>
          <p className="text-sm text-gray-500 mb-3">
            {t('sheetforge.templateDescription')}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />

          {templateFile ? (
            <div className="flex items-center gap-3 p-4 bg-white border rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{templateFile.name}</p>
                <p className="text-sm text-gray-500">
                  {(templateFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTemplateFile(null)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition"
            >
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <Upload className="w-6 h-6 text-gray-500" />
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-700">{t('sheetforge.uploadTemplate')}</p>
                <p className="text-sm text-gray-500">{t('sheetforge.supportedFormats')}</p>
              </div>
            </button>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={!isValid || createMutation.isPending}
            className={`w-full py-3 flex items-center justify-center gap-2 rounded-lg font-medium transition ${
              isValid && !createMutation.isPending
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('common.creating')}
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-5 h-5" />
                {t('sheetforge.createAndContinue')}
              </>
            )}
          </button>
        </div>

        {createMutation.isError && (
          <p className="text-center text-red-600">
            {(createMutation.error as Error).message}
          </p>
        )}
      </form>
    </div>
  );
}
