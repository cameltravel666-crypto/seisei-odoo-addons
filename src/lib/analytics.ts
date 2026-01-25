/**
 * GA4 Analytics Tracking Utility
 * Provides cross-domain tracking between seisei.tokyo and biznexus.seisei.tokyo
 */

// GA4 Measurement ID - should be set in environment
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';

// Declare gtag on window
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Initialize GA4 tracking
 * Call this in the root layout or a client component
 */
export function initGA4() {
  if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) return;

  // Skip if already initialized
  if (window.gtag) return;

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];

  // Define gtag function
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    // Enable cross-domain tracking
    linker: {
      domains: ['seisei.tokyo', 'biznexus.seisei.tokyo'],
      accept_incoming: true,
    },
  });
}

/**
 * Track a custom event
 * @param eventName - The event name (e.g., 'save_success')
 * @param params - Event parameters
 */
export function track(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.gtag) {
    console.debug('[Analytics] Event (not sent - gtag not available):', eventName, params);
    return;
  }

  window.gtag('event', eventName, {
    ...params,
    // Add timestamp for debugging
    event_timestamp: Date.now(),
  });

  console.debug('[Analytics] Event sent:', eventName, params);
}

// ============================================
// Event Types for Landing Page (seisei.tokyo)
// ============================================

/**
 * Track CTA click on landing page
 */
export function trackCtaClick(params: {
  cta_id: string;
  dest_type: string;
  doc_type: string;
}) {
  track('cta_click', params);
}

// ============================================
// Event Types for Public OCR (biznexus)
// ============================================

/**
 * Track public session start
 */
export function trackPublicSessionStart(params: {
  doc_type: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}) {
  track('public_session_start', params);
}

/**
 * Track OCR start
 */
export function trackOcrStart(params: { doc_type: string }) {
  track('ocr_start', params);
}

/**
 * Track file upload success
 */
export function trackUploadSuccess(params: {
  file_type: string;
  file_size_kb: number;
  num_pages?: number;
}) {
  track('upload_success', params);
}

/**
 * Track OCR parse success
 */
export function trackOcrParseSuccess(params: {
  processing_time_ms: number;
  confidence?: number;
}) {
  track('ocr_parse_success', params);
}

/**
 * Track voucher generation success
 */
export function trackVoucherGenerateSuccess(params: {
  latency_ms: number;
  has_tax_split?: boolean;
}) {
  track('voucher_generate_success', params);
}

/**
 * Track save button click
 */
export function trackSaveClick(params: { target: string }) {
  track('save_click', params);
}

/**
 * Track auth start
 */
export function trackAuthStart(params: { method: 'google' | 'password' }) {
  track('auth_start', params);
}

/**
 * Track auth success
 */
export function trackAuthSuccess(params: { method: 'google' | 'password' }) {
  track('auth_success', params);
}

/**
 * Track claim success
 */
export function trackClaimSuccess(params: { target: string }) {
  track('claim_success', params);
}

/**
 * Track save success - This is the main conversion event
 */
export function trackSaveSuccess(params: { target: string }) {
  track('save_success', {
    ...params,
    // Mark as conversion event
    conversion: true,
  });
}

// ============================================
// Event Types for Export Feature
// ============================================

/**
 * Track export target selection
 */
export function trackExportTargetSelect(params: {
  target: 'freee' | 'moneyforward' | 'yayoi';
  doc_type?: string;
}) {
  track('export_target_select', params);
}

/**
 * Track export preview generation
 */
export function trackExportPreviewGenerate(params: {
  target: 'freee' | 'moneyforward' | 'yayoi';
  rows_count: number;
  has_warnings: boolean;
}) {
  track('export_preview_generate', params);
}

/**
 * Track export download click
 */
export function trackExportDownloadClick(params: {
  target: 'freee' | 'moneyforward' | 'yayoi';
  is_authenticated: boolean;
}) {
  track('export_download_click', params);
}

/**
 * Track export download success - Conversion event
 */
export function trackExportDownloadSuccess(params: {
  target: 'freee' | 'moneyforward' | 'yayoi';
  file_format: string;
  file_size_kb?: number;
}) {
  track('export_download_success', {
    ...params,
    conversion: true,
  });
}

/**
 * Track auth gate shown (export flow)
 */
export function trackExportAuthGateShow(params: {
  target: 'freee' | 'moneyforward' | 'yayoi';
}) {
  track('export_auth_gate_show', params);
}

/**
 * Track paywall gate shown (export flow)
 */
export function trackExportPaywallShow(params: {
  target: 'freee' | 'moneyforward' | 'yayoi';
  reason: 'no_subscription' | 'quota_exceeded';
}) {
  track('export_paywall_show', params);
}
