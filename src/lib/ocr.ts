/**
 * OCR Utilities for Receipt Processing
 * Integrates with PaddleOCR service
 */

import crypto from 'crypto';

// Configuration
export const OCR_CONFIG = {
  BASE_URL: process.env.OCR_BASE_URL || 'http://127.0.0.1:8868',
  ENDPOINT: process.env.OCR_ENDPOINT || '/ocr/receipt',
  MAX_FILE_SIZE: 100 * 1024, // 100KB
  TIMEOUT_MS: 5000,
  RETRY_COUNT: 1,
  CACHE_TTL_HOURS: 24,
  RATE_LIMIT_PER_DAY: 100,
  RATE_LIMIT_PER_SECOND: 2,
  // Billing config
  FREE_QUOTA_PER_MONTH: 30,
  UNIT_PRICE_JPY: 10,
};

// Usage data returned with each OCR response
export interface OcrUsage {
  month_key: string;
  free_quota: number;
  used_count: number;
  remaining_free: number;
  is_billable: boolean;
  unit_price_jpy: number;
  billable_count: number;
  billable_amount_jpy: number;
  is_first_overage_this_month: boolean;
}

/**
 * Get current month key in JST (YYYY-MM)
 */
export function getJstMonthKey(): string {
  const now = new Date();
  // Convert to JST (UTC+9)
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstDate = new Date(now.getTime() + jstOffset);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export interface OcrResult {
  amount_total: number | null;
  date: string | null;
  merchant: string | null;
  confidence: number | null;
  raw?: unknown;
}

export interface OcrTextLine {
  text: string;
  confidence: number;
  bbox?: number[];
}

/**
 * Calculate SHA256 hash of image data
 */
export function calculateImageHash(imageBuffer: Buffer): string {
  return crypto.createHash('sha256').update(imageBuffer).digest('hex');
}

/**
 * Extract amount from OCR text lines
 * Priority: Keywords near amount > Maximum amount
 */
export function extractAmount(lines: OcrTextLine[]): { amount: number | null; confidence: number } {
  const amountKeywords = [
    '合計', '合计', '総計', 'TOTAL', 'お会計', '請求額', '小計', '小计',
    'お支払', '支払', '税込', '計', 'Amount', 'Total',
  ];

  // Find amounts in text
  const amountPattern = /[¥￥]?\s*[\d,]+(?:\.\d{1,2})?/g;
  const candidates: { amount: number; confidence: number; hasKeyword: boolean; lineIndex: number }[] = [];

  lines.forEach((line, index) => {
    const text = line.text;
    const matches = text.match(amountPattern);

    if (matches) {
      const hasKeyword = amountKeywords.some(kw =>
        text.toUpperCase().includes(kw.toUpperCase())
      );

      matches.forEach(match => {
        // Normalize: remove currency symbols, commas, spaces
        const normalized = match.replace(/[¥￥,\s]/g, '');
        const amount = parseFloat(normalized);

        if (!isNaN(amount) && amount > 0 && amount < 10000000) {
          candidates.push({
            amount: Math.round(amount), // JPY integer
            confidence: line.confidence,
            hasKeyword,
            lineIndex: index,
          });
        }
      });
    }
  });

  if (candidates.length === 0) {
    return { amount: null, confidence: 0 };
  }

  // Priority: keyword matches first, then largest amount
  const keywordMatches = candidates.filter(c => c.hasKeyword);
  if (keywordMatches.length > 0) {
    // Get the largest amount near keywords
    const best = keywordMatches.reduce((a, b) => a.amount > b.amount ? a : b);
    return { amount: best.amount, confidence: best.confidence };
  }

  // Fallback: largest amount
  const best = candidates.reduce((a, b) => a.amount > b.amount ? a : b);
  return { amount: best.amount, confidence: best.confidence * 0.7 }; // Lower confidence without keyword
}

/**
 * Extract date from OCR text lines
 * Supports: YYYY/MM/DD, YYYY-MM-DD, YY/MM/DD, YYYY年M月D日
 */
export function extractDate(lines: OcrTextLine[]): string | null {
  const datePatterns = [
    // YYYY/MM/DD or YYYY-MM-DD
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    // YY/MM/DD
    /(\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    // YYYY年M月D日
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    // 令和X年
    /令和(\d{1,2})年(\d{1,2})月(\d{1,2})日/,
  ];

  for (const line of lines) {
    const text = line.text;

    for (let i = 0; i < datePatterns.length; i++) {
      const match = text.match(datePatterns[i]);
      if (match) {
        let year = parseInt(match[1]);
        const month = parseInt(match[2]);
        const day = parseInt(match[3]);

        // Handle 2-digit year
        if (year < 100) {
          year += year > 50 ? 1900 : 2000;
        }

        // Handle 令和 (Reiwa era, started 2019)
        if (i === 3) {
          year = 2018 + year;
        }

        // Validate
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return dateStr;
        }
      }
    }
  }

  return null;
}

/**
 * Extract merchant name from OCR text lines
 * Priority: Top 1-3 lines that are not numbers/dates
 */
export function extractMerchant(lines: OcrTextLine[]): string | null {
  const skipPatterns = [
    /^\d+$/, // Pure numbers
    /^\d{4}[\/\-]/, // Dates
    /^[¥￥]/, // Currency
    /^tel|fax|電話/i,
    /^〒\d/, // Postal code
    /^\d{2,4}:\d{2}/, // Time
  ];

  const merchantLines: string[] = [];

  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const text = lines[i].text.trim();

    // Skip if matches skip patterns
    if (skipPatterns.some(p => p.test(text))) continue;

    // Skip very short or very long lines
    if (text.length < 2 || text.length > 50) continue;

    // Skip lines with too many numbers
    const numCount = (text.match(/\d/g) || []).length;
    if (numCount / text.length > 0.5) continue;

    merchantLines.push(text);

    if (merchantLines.length >= 2) break;
  }

  return merchantLines.length > 0 ? merchantLines.join(' ') : null;
}

/**
 * Parse PaddleOCR response and extract fields
 */
export function parseOcrResponse(ocrResponse: unknown): OcrResult {
  // Handle different PaddleOCR response formats
  let lines: OcrTextLine[] = [];

  if (Array.isArray(ocrResponse)) {
    // Format: [[text, confidence], ...]
    lines = ocrResponse.map((item: unknown) => {
      if (Array.isArray(item) && item.length >= 2) {
        return {
          text: String(item[0]),
          confidence: Number(item[1]) || 0.5,
        };
      }
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        return {
          text: String(obj.text || obj.words || ''),
          confidence: Number(obj.confidence || obj.score || 0.5),
        };
      }
      return { text: String(item), confidence: 0.5 };
    });
  } else if (typeof ocrResponse === 'object' && ocrResponse !== null) {
    const obj = ocrResponse as Record<string, unknown>;
    // Format: { results: [...], texts: [...], data: [...] }
    const results = obj.results || obj.texts || obj.data || obj.ocr_results;
    if (Array.isArray(results)) {
      return parseOcrResponse(results);
    }
  }

  if (lines.length === 0) {
    return {
      amount_total: null,
      date: null,
      merchant: null,
      confidence: null,
      raw: ocrResponse,
    };
  }

  const { amount, confidence } = extractAmount(lines);
  const date = extractDate(lines);
  const merchant = extractMerchant(lines);

  return {
    amount_total: amount,
    date,
    merchant,
    confidence,
    raw: process.env.OCR_DEBUG === 'true' ? ocrResponse : undefined,
  };
}

/**
 * Call PaddleOCR service with retry
 */
export async function callOcrService(imageBuffer: Buffer): Promise<OcrResult> {
  const { BASE_URL, ENDPOINT, TIMEOUT_MS, RETRY_COUNT } = OCR_CONFIG;

  // Health check first
  try {
    const healthRes = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!healthRes.ok) {
      throw new Error('OCR service unhealthy');
    }
  } catch (e) {
    throw new Error('OCR service unavailable');
  }

  // Prepare form data
  const formData = new FormData();
  formData.append('image', new Blob([new Uint8Array(imageBuffer)]), 'receipt.jpg');

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}${ENDPOINT}`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`OCR service error: ${response.status}`);
      }

      const data = await response.json();
      return parseOcrResponse(data);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < RETRY_COUNT) {
        await new Promise(r => setTimeout(r, 500)); // Wait before retry
      }
    }
  }

  throw lastError || new Error('OCR failed');
}
