/**
 * Image Compression Utility for Receipt OCR
 * Compresses images to ≤100KB for OCR processing
 */

export const COMPRESS_CONFIG = {
  MAX_SIZE_KB: 100,
  TARGET_SHORT_EDGE: 1080, // Configurable 900-1200
  MIN_QUALITY: 0.45,
  MAX_QUALITY: 0.95,
  OUTPUT_TYPE: 'image/jpeg',
};

export interface CompressResult {
  blob: Blob;
  sizeKB: number;
  width: number;
  height: number;
  quality: number;
}

/**
 * Load image from File
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Resize image to target dimensions
 */
function resizeImage(
  img: HTMLImageElement,
  targetShortEdge: number
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const { width, height } = img;
  const shortEdge = Math.min(width, height);

  let newWidth: number;
  let newHeight: number;

  if (shortEdge <= targetShortEdge) {
    // No resize needed
    newWidth = width;
    newHeight = height;
  } else {
    const scale = targetShortEdge / shortEdge;
    newWidth = Math.round(width * scale);
    newHeight = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  // Use better quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, newWidth, newHeight);

  return { canvas, width: newWidth, height: newHeight };
}

/**
 * Convert canvas to blob with specified quality
 */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      COMPRESS_CONFIG.OUTPUT_TYPE,
      quality
    );
  });
}

/**
 * Binary search for optimal quality that produces ≤100KB
 */
async function findOptimalQuality(
  canvas: HTMLCanvasElement,
  maxSizeBytes: number
): Promise<{ blob: Blob; quality: number }> {
  let low = COMPRESS_CONFIG.MIN_QUALITY;
  let high = COMPRESS_CONFIG.MAX_QUALITY;
  let bestBlob: Blob | null = null;
  let bestQuality = low;

  // Try max quality first
  const maxBlob = await canvasToBlob(canvas, high);
  if (maxBlob.size <= maxSizeBytes) {
    return { blob: maxBlob, quality: high };
  }

  // Try min quality
  const minBlob = await canvasToBlob(canvas, low);
  if (minBlob.size > maxSizeBytes) {
    // Even min quality is too large
    return { blob: minBlob, quality: low };
  }

  bestBlob = minBlob;
  bestQuality = low;

  // Binary search for optimal quality
  while (high - low > 0.05) {
    const mid = (low + high) / 2;
    const blob = await canvasToBlob(canvas, mid);

    if (blob.size <= maxSizeBytes) {
      bestBlob = blob;
      bestQuality = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  return { blob: bestBlob!, quality: bestQuality };
}

/**
 * Compress image file to ≤100KB
 * Returns compressed blob and metadata
 */
export async function compressImage(
  file: File,
  options: { targetShortEdge?: number; maxSizeKB?: number } = {}
): Promise<CompressResult> {
  const targetShortEdge = options.targetShortEdge || COMPRESS_CONFIG.TARGET_SHORT_EDGE;
  const maxSizeKB = options.maxSizeKB || COMPRESS_CONFIG.MAX_SIZE_KB;
  const maxSizeBytes = maxSizeKB * 1024;

  // Load image
  const img = await loadImage(file);

  // Resize
  const { canvas, width, height } = resizeImage(img, targetShortEdge);

  // Find optimal quality
  const { blob, quality } = await findOptimalQuality(canvas, maxSizeBytes);
  const sizeKB = Math.round(blob.size / 1024);

  // Check if quality is too low (image might be too blurry)
  if (quality <= COMPRESS_CONFIG.MIN_QUALITY && blob.size > maxSizeBytes) {
    throw new Error('IMAGE_TOO_COMPLEX');
  }

  // Clean up
  URL.revokeObjectURL(img.src);

  return {
    blob,
    sizeKB,
    width,
    height,
    quality,
  };
}

/**
 * Create thumbnail for preview
 */
export async function createThumbnail(
  file: File,
  maxSize: number = 200
): Promise<string> {
  const img = await loadImage(file);

  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  ctx.drawImage(img, 0, 0, width, height);

  URL.revokeObjectURL(img.src);

  return canvas.toDataURL('image/jpeg', 0.7);
}

/**
 * Check if compression is needed
 */
export function needsCompression(file: File): boolean {
  return file.size > COMPRESS_CONFIG.MAX_SIZE_KB * 1024;
}
