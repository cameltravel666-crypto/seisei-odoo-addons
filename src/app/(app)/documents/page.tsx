'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Image, File, FileSpreadsheet, FileCode } from 'lucide-react';
import { useDocuments } from '@/hooks/use-modules';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { SearchBar, FilterOption, FilterGroup } from '@/components/ui/search-bar';

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <Image className="w-5 h-5 text-green-600" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
  if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-red-600" />;
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('javascript')) return <FileCode className="w-5 h-5 text-yellow-600" />;
  return <File className="w-5 h-5 text-gray-600" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterOption[]>([]);

  const { data, isLoading, error } = useDocuments({
    page,
    limit: 20,
    search: searchQuery || undefined
  });

  const filterGroups: FilterGroup[] = useMemo(() => [
    {
      id: 'fileType',
      label: t('documents.fileType') || 'File Type',
      field: 'mimeType',
      options: [
        { value: '', label: t('common.all') },
        { value: 'pdf', label: 'PDF' },
        { value: 'image', label: t('documents.images') || 'Images' },
        { value: 'spreadsheet', label: t('documents.spreadsheets') || 'Spreadsheets' },
      ],
    },
  ], [t]);

  const handleFilterChange = (newFilters: FilterOption[]) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ja-JP');

  return (
    <div className="space-y-4">
      <h1 className="page-title">{t('nav.documents')}</h1>

      <SearchBar
        placeholder={t('common.search')}
        filterGroups={filterGroups}
        activeFilters={filters}
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
      />

      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState icon="file" title={t('documents.noItems')} />
      ) : (
        <>
          <div className="card divide-y divide-gray-100">
            {data.items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer">
                <div className="p-2 bg-gray-50 rounded-lg">
                  {getFileIcon(item.mimeType)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                  <p className="text-sm text-gray-500">{item.createdBy}</p>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>{formatFileSize(item.fileSize)}</p>
                  <p className="text-xs text-gray-400">{formatDate(item.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          <p className="text-center text-sm text-gray-500">{t('common.totalItems', { count: data.pagination.total })}</p>
        </>
      )}
    </div>
  );
}
