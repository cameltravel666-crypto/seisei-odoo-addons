/**
 * OCR Service Client
 * Calls the centralized OCR service managed by Odoo
 */

// Configuration from environment
// OCR_SERVICE_URL should be base URL like http://ocr-service:8080/api/v1
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://ocr-service:8080/api/v1';
const OCR_SERVICE_KEY = process.env.OCR_SERVICE_KEY || '';

export interface OcrServiceRequest {
  imageData: string; // base64
  mimeType?: string;
  tenantId?: string;
}

export interface OcrServiceResult {
  success: boolean;
  extracted?: {
    merchant?: string;
    date?: string;
    amount_total?: number;
    confidence?: number;
    [key: string]: unknown;
  };
  rawResponse?: string;
  errorCode?: string;
  usage?: {
    image_count: number;
    free_remaining: number;
    billable_count: number;
    total_cost: number;
  };
}

/**
 * Call the centralized OCR service
 */
export async function callCentralOcrService(
  request: OcrServiceRequest
): Promise<OcrServiceResult> {
  // OCR_SERVICE_URL already includes /api/v1
  const url = `${OCR_SERVICE_URL}/ocr/process`;

  if (!OCR_SERVICE_KEY) {
    console.error('[OCR Client] OCR_SERVICE_KEY not configured');
    return {
      success: false,
      errorCode: 'SERVICE_NOT_CONFIGURED',
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': OCR_SERVICE_KEY,
      },
      body: JSON.stringify({
        image_data: request.imageData,
        mime_type: request.mimeType || 'image/jpeg',
        tenant_id: request.tenantId || 'public',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OCR Client] Service error: ${response.status} - ${errorText}`);
      return {
        success: false,
        errorCode: `HTTP_${response.status}`,
      };
    }

    const result = await response.json();

    return {
      success: result.success,
      extracted: result.extracted,
      rawResponse: result.raw_response,
      errorCode: result.error_code,
      usage: result.usage,
    };
  } catch (error) {
    console.error('[OCR Client] Request failed:', error);
    return {
      success: false,
      errorCode: 'REQUEST_FAILED',
    };
  }
}

/**
 * Get usage statistics for a tenant
 */
export async function getOcrUsage(tenantId: string, yearMonth?: string): Promise<{
  imageCount: number;
  freeRemaining: number;
  billableCount: number;
  totalCost: number;
} | null> {
  // OCR_SERVICE_URL already includes /api/v1
  const url = new URL(`${OCR_SERVICE_URL}/usage/${tenantId}`);
  if (yearMonth) {
    url.searchParams.set('year_month', yearMonth);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'X-Service-Key': OCR_SERVICE_KEY,
      },
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    return {
      imageCount: result.image_count,
      freeRemaining: result.free_remaining,
      billableCount: result.billable_count,
      totalCost: result.total_cost,
    };
  } catch {
    return null;
  }
}
