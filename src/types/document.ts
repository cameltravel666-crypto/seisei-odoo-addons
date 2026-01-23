/**
 * Unified Document Types
 *
 * This module provides a generic "Document" abstraction that can represent
 * Purchase Orders, Sales Orders, and Invoices with a consistent interface
 * for the shared UI components.
 */

export type DocumentType = 'purchase' | 'sales' | 'invoice';

export type DocumentState =
  | 'draft'
  | 'sent'
  | 'to_approve'
  | 'confirmed'
  | 'sale'
  | 'purchase'
  | 'posted'
  | 'done'
  | 'paid'
  | 'cancel';

/**
 * Unified line item representation
 */
export interface DocumentLine {
  id: number;
  productId: number | null;
  productName: string;
  /** User-editable name/label for the line item */
  name: string;
  description: string;
  quantity: number;
  priceUnit: number;
  subtotal: number;
  uom: string;
  // Type-specific fields (optional)
  qtyReceived?: number; // Purchase
  qtyDelivered?: number; // Sales
  qtyInvoiced?: number; // Sales/Invoice
}

/**
 * Summary field for display in the summary card
 */
export interface SummaryField {
  key: string;
  label: string;
  value: string | number | null;
  type?: 'text' | 'date' | 'currency' | 'user';
  editable?: boolean;
}

/**
 * Unified document representation
 */
export interface UnifiedDocument {
  id: number;
  /** Document type for UI logic */
  type: DocumentType;
  /** System-generated document number (e.g., P00001, S00001, INV/2024/00001) */
  numberCode: string;
  /** User-editable document name/title */
  name: string | null;
  /** Current document state */
  state: DocumentState;
  /** Counterparty (supplier/customer/vendor) */
  partnerId: number | null;
  partnerName: string;
  /** Main date (order date / invoice date) */
  date: string;
  /** Secondary date (approve date / due date) */
  secondaryDate: string | null;
  /** Responsible user */
  userId: number | null;
  userName: string;
  /** Notes/memo */
  notes: string | null;
  /** Currency code */
  currency: string;
  /** Financial totals */
  totals: {
    untaxed: number;
    tax: number;
    total: number;
    residual?: number; // For invoices - remaining amount
  };
  /** Line items */
  lines: DocumentLine[];
  /** Type-specific summary fields for the info card */
  summaryFields: SummaryField[];
  /** Type-specific status indicators */
  statusIndicators?: {
    label: string;
    value: string;
    icon?: string;
  }[];
  /** Can this document be edited? */
  canEdit: boolean;
  /** Can this document be confirmed? */
  canConfirm: boolean;
  /** Can email be sent for this document? */
  canEmail: boolean;
  /** Can PDF be generated/shared? */
  canSharePdf: boolean;
}

/**
 * Configuration for document type-specific behavior
 */
export interface DocumentConfig {
  type: DocumentType;
  /** API base path */
  apiPath: string;
  /** Partner field label (e.g., "Supplier", "Customer", "Vendor") */
  partnerLabel: string;
  /** Date field label */
  dateLabel: string;
  /** State labels mapping */
  stateLabels: Record<string, string>;
  /** State colors mapping */
  stateColors: Record<string, string>;
  /** Actions available for each state */
  stateActions: Record<string, string[]>;
}

/**
 * Document edit payload
 */
export interface DocumentEditPayload {
  name?: string;
  partnerId?: number;
  date?: string;
  notes?: string;
  lines?: {
    id?: number;
    productId: number | null;
    name?: string;
    quantity: number;
    priceUnit: number;
  }[];
}

/**
 * Line item edit payload
 */
export interface LineEditPayload {
  name?: string;
  quantity?: number;
  priceUnit?: number;
}
