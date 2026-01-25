'use client';

import { useState } from 'react';
import { AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import type { ExportWarning } from '@/types/export';

export interface ExportPreviewColumn {
  key: string;
  label: string;
  labelJa?: string;
  width?: string;
}

export interface ExportPreviewTableProps {
  columns: ExportPreviewColumn[];
  rows: Record<string, string | number>[];
  warnings?: ExportWarning[];
  maxVisibleRows?: number;
  targetName?: string;
  encoding?: string;
  fileFormat?: string;
  fileName?: string;
}

/**
 * ExportPreviewTable - Preview export data before download
 */
export function ExportPreviewTable({
  columns,
  rows,
  warnings = [],
  maxVisibleRows = 5,
  targetName,
  encoding,
  fileFormat,
  fileName,
}: ExportPreviewTableProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, maxVisibleRows);
  const hasMore = rows.length > maxVisibleRows;

  const errorWarnings = warnings.filter(w => w.severity === 'error');
  const infoWarnings = warnings.filter(w => w.severity === 'warning' || w.severity === 'info');

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900">エクスポートプレビュー</h3>
          {targetName && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
              {targetName}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-3">
          {encoding && <span>文字コード: {encoding.toUpperCase()}</span>}
          {fileFormat && <span>形式: {fileFormat.toUpperCase()}</span>}
          {rows.length > 0 && <span>{rows.length}行</span>}
        </div>
      </div>

      {/* Warnings */}
      {errorWarnings.length > 0 && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-100">
          {errorWarnings.map((warning, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-medium">{warning.messageJa || warning.message}</span>
                {warning.suggestion && (
                  <p className="text-xs text-red-600 mt-0.5">{warning.suggestion}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {infoWarnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
          {infoWarnings.map((warning, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm text-amber-700">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{warning.messageJa || warning.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col.key}
                  className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap"
                  style={{ width: col.width }}
                >
                  {col.labelJa || col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-3 py-2 text-gray-900 whitespace-nowrap"
                  >
                    {formatCellValue(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more/less button */}
      {hasMore && (
        <div className="border-t">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2 text-sm text-blue-600 hover:bg-gray-50 flex items-center justify-center gap-1"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                折りたたむ
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                すべて表示 ({rows.length}行)
              </>
            )}
          </button>
        </div>
      )}

      {/* File info footer */}
      {fileName && (
        <div className="bg-gray-50 px-4 py-2 border-t text-xs text-gray-500">
          ファイル名: {fileName}
        </div>
      )}
    </div>
  );
}

/**
 * Format cell value for display
 */
function formatCellValue(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') {
    return '-';
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return String(value);
}
