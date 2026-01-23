/**
 * OCR Utilities for Receipt Processing
 * Uses Gemini API for text recognition
 */

import * as crypto from 'crypto';

// Configuration
export const OCR_CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: 'gemini-2.0-flash-exp',
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB for Gemini
  TIMEOUT_MS: 30000,
  RETRY_COUNT: 2,
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
 * Build OCR prompt for receipt processing
 */
function buildReceiptOcrPrompt(): string {
  return `あなたはレシート・領収書のOCR専門家です。
この画像から以下の情報を抽出してJSON形式で返してください：

{
  "merchant": "店舗名・会社名",
  "date": "日付 (YYYY-MM-DD形式)",
  "amount_total": 合計金額 (数字のみ、通貨記号なし),
  "confidence": 信頼度 (0.0-1.0)
}

重要：
- 金額は数字のみ（円記号やカンマは除去）
- 日付はYYYY-MM-DD形式に変換
- 読み取れない項目はnullにする
- JSONのみを返す（説明文不要）
- 複数の金額がある場合は「合計」「計」「Total」に近いものを選択`;
}

/**
 * Extract JSON from Gemini response text
 */
function extractJsonFromResponse(text: string): OcrResult {
  // Try to extract JSON from markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return parseOcrJson(JSON.parse(jsonMatch[1]));
    } catch {
      // Continue to next method
    }
  }

  // Try to find raw JSON object
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start !== -1 && end > start) {
      return parseOcrJson(JSON.parse(text.slice(start, end)));
    }
  } catch {
    // Continue to fallback
  }

  // Fallback: return empty result
  return {
    amount_total: null,
    date: null,
    merchant: null,
    confidence: null,
    raw: { raw_text: text },
  };
}

/**
 * Parse and validate OCR JSON response
 */
function parseOcrJson(data: Record<string, unknown>): OcrResult {
  let amount: number | null = null;
  let date: string | null = null;
  let merchant: string | null = null;
  let confidence: number | null = null;

  // Parse amount
  const rawAmount = data.amount_total ?? data.total ?? data.amount ?? data['合計'];
  if (rawAmount !== null && rawAmount !== undefined) {
    const amountStr = String(rawAmount).replace(/[¥￥,\s円]/g, '');
    const parsed = parseFloat(amountStr);
    if (!isNaN(parsed) && parsed > 0) {
      amount = Math.round(parsed);
    }
  }

  // Parse date
  const rawDate = data.date ?? data['日付'];
  if (rawDate) {
    const dateStr = String(rawDate)
      .replace(/年/g, '-')
      .replace(/月/g, '-')
      .replace(/日/g, '');
    // Validate YYYY-MM-DD format
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  // Parse merchant
  const rawMerchant = data.merchant ?? data.store ?? data['店舗名'] ?? data['会社名'];
  if (rawMerchant && typeof rawMerchant === 'string') {
    merchant = rawMerchant.trim();
  }

  // Parse confidence
  const rawConfidence = data.confidence ?? data.score;
  if (rawConfidence !== null && rawConfidence !== undefined) {
    const conf = parseFloat(String(rawConfidence));
    if (!isNaN(conf) && conf >= 0 && conf <= 1) {
      confidence = conf;
    }
  }

  return {
    amount_total: amount,
    date,
    merchant,
    confidence: confidence ?? (amount !== null ? 0.8 : 0.3),
  };
}

/**
 * Call Gemini API for OCR processing
 */
export async function callOcrService(imageBuffer: Buffer): Promise<OcrResult> {
  const { GEMINI_API_KEY, GEMINI_MODEL, TIMEOUT_MS, RETRY_COUNT } = OCR_CONFIG;

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Convert image to base64
  const b64Data = imageBuffer.toString('base64');

  // Detect mime type from buffer
  let mimeType = 'image/jpeg';
  if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
    mimeType = 'image/png';
  } else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) {
    mimeType = 'image/gif';
  } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) {
    mimeType = 'image/webp';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = buildReceiptOcrPrompt();

  const payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: b64Data } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
    }
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        // Rate limited - wait and retry
        const waitTime = (attempt + 1) * 5000;
        console.warn(`[OCR] Rate limited (429), waiting ${waitTime}ms before retry ${attempt + 1}/${RETRY_COUNT}`);
        await new Promise(r => setTimeout(r, waitTime));
        lastError = new Error('Rate limit exceeded');
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const candidates = result.candidates || [];

      if (!candidates.length) {
        throw new Error('No response from Gemini');
      }

      const content = candidates[0].content || {};
      const parts = content.parts || [];

      if (!parts.length) {
        throw new Error('Empty response from Gemini');
      }

      const rawText = parts[0].text || '';
      return extractJsonFromResponse(rawText);

    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      if (lastError.name === 'AbortError') {
        lastError = new Error('Request timeout');
      }

      if (attempt < RETRY_COUNT) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  throw lastError || new Error('OCR failed');
}

/**
 * @deprecated Use callOcrService directly
 */
export function parseOcrResponse(ocrResponse: unknown): OcrResult {
  if (typeof ocrResponse === 'object' && ocrResponse !== null) {
    return parseOcrJson(ocrResponse as Record<string, unknown>);
  }
  return {
    amount_total: null,
    date: null,
    merchant: null,
    confidence: null,
    raw: ocrResponse,
  };
}

// Legacy extraction functions (kept for compatibility but not used with Gemini)
export function extractAmount(lines: OcrTextLine[]): { amount: number | null; confidence: number } {
  // Not used with Gemini - kept for API compatibility
  return { amount: null, confidence: 0 };
}

export function extractDate(lines: OcrTextLine[]): string | null {
  // Not used with Gemini - kept for API compatibility
  return null;
}

export function extractMerchant(lines: OcrTextLine[]): string | null {
  // Not used with Gemini - kept for API compatibility
  return null;
}
