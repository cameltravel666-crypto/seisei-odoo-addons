/**
 * Shared Document Components
 *
 * This module exports unified components for document detail pages
 * (Purchase Orders, Sales Orders, Invoices).
 *
 * These components provide:
 * - Consistent UI/UX across document types
 * - iOS WebView support (safe-area, keyboard handling)
 * - Touch-friendly controls (44x44 minimum targets)
 * - Minimal layout shift between view/edit modes
 */

// Header and Title
export { DocumentHeaderBar, createDocumentActions } from './DocumentHeaderBar';
export { DocumentNameEditor, DocumentTitle } from './DocumentNameEditor';

// Summary and Content
export { DocumentSummaryCard, DocumentStatusIndicators, type SummaryFieldConfig } from './DocumentSummaryCard';
export { DocumentLineItems, ProductSearchInput, ProductSearchDropdown } from './DocumentLineItems';
export { DocumentTotals, DocumentNotes } from './DocumentTotals';

// Line Item Editing
export { LineItemEditor } from './LineItemEditor';

// Sticky Action Bar with keyboard handling
export { StickyActionBar, StickyActionBarContent, useStickyActionBarPadding } from './StickyActionBar';
