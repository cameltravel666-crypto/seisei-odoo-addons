/**
 * OCR Library - 極簡三モジュール
 * Main export point for all OCR-related functionality
 */

// Types
export * from './types';

// Canonical Journal
export {
  generateCanonicalJournal,
  validateCanonicalJournal,
} from './canonical-generator';

// Exporters
export {
  getExporter,
  getAvailableTargets,
  generatePreview,
  generateExport,
  freeeExporter,
  moneyforwardExporter,
  yayoiExporter,
} from './exporters';
