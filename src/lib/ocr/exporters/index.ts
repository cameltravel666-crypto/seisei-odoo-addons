/**
 * Exporters Index
 * Registry of all available exporters
 */

import type { Exporter, ExportTarget, ExportEncoding, CanonicalJournal, ValidationResult } from '../types';
import { freeeExporter } from './freee';
import { moneyforwardExporter } from './moneyforward';
import { yayoiExporter } from './yayoi';
import { buildCSVContent } from './base';

// ============================================
// Exporter Registry
// ============================================

const exporters: Record<ExportTarget, Exporter> = {
  FREEE: freeeExporter,
  MONEYFORWARD: moneyforwardExporter,
  YAYOI: yayoiExporter,
};

/**
 * Get exporter by target
 */
export function getExporter(target: ExportTarget): Exporter {
  const exporter = exporters[target];
  if (!exporter) {
    throw new Error(`Unknown export target: ${target}`);
  }
  return exporter;
}

/**
 * Get all available export targets
 */
export function getAvailableTargets(): ExportTarget[] {
  return Object.keys(exporters) as ExportTarget[];
}

// ============================================
// Export Functions
// ============================================

export interface PreviewResult {
  columns: string[];
  rows: string[][];
  warnings: string[];
}

/**
 * Generate preview for export
 */
export function generatePreview(
  journal: CanonicalJournal,
  documentId: string,
  target: ExportTarget
): PreviewResult {
  const exporter = getExporter(target);
  const validation = exporter.validate(journal);

  return {
    columns: exporter.columns(),
    rows: exporter.buildRows(journal, documentId),
    warnings: validation.warnings,
  };
}

export interface ExportResult {
  content: string;
  filename: string;
  encoding: ExportEncoding;
  contentType: string;
  validation: ValidationResult;
}

/**
 * Generate full export CSV content
 */
export function generateExport(
  journal: CanonicalJournal,
  documentId: string,
  target: ExportTarget,
  encoding?: ExportEncoding
): ExportResult {
  const exporter = getExporter(target);
  const validation = exporter.validate(journal);

  // Check for blocking errors
  if (!validation.valid) {
    return {
      content: '',
      filename: '',
      encoding: encoding || exporter.defaultEncoding(),
      contentType: 'text/csv; charset=utf-8',
      validation,
    };
  }

  const columns = exporter.columns();
  const rows = exporter.buildRows(journal, documentId);
  const finalEncoding = encoding || exporter.defaultEncoding();
  const content = buildCSVContent(columns, rows, finalEncoding);
  const filename = exporter.filename(journal, documentId);

  const contentType =
    finalEncoding === 'SHIFT_JIS'
      ? 'text/csv; charset=Shift_JIS'
      : 'text/csv; charset=utf-8';

  return {
    content,
    filename,
    encoding: finalEncoding,
    contentType,
    validation,
  };
}

// Re-export types
export * from './base';
export { freeeExporter } from './freee';
export { moneyforwardExporter } from './moneyforward';
export { yayoiExporter } from './yayoi';
