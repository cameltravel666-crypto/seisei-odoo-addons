import base64
import io
import logging

from PIL import Image

_logger = logging.getLogger(__name__)

# Target ~100KB after compression
TARGET_SIZE_KB = 100


def compress_image(b64_data, filename='', target_kb=TARGET_SIZE_KB):
    """Compress image to approximately target_kb size.

    Returns base64-encoded JPEG data.  PDF files are returned as-is.
    """
    if not b64_data:
        return b64_data

    ext = filename.lower().rsplit('.', 1)[-1] if '.' in filename else ''
    if ext == 'pdf':
        return b64_data

    raw = base64.b64decode(b64_data) if isinstance(b64_data, (str, bytes)) else b64_data
    original_kb = len(raw) / 1024

    if original_kb <= target_kb * 1.2:
        return base64.b64encode(raw) if isinstance(b64_data, (str, bytes)) else b64_data

    try:
        img = Image.open(io.BytesIO(raw))
    except Exception:
        return b64_data

    if img.mode in ('RGBA', 'P', 'LA'):
        img = img.convert('RGB')

    # Scale down large images (long edge > 2000px)
    max_dim = 2000
    if max(img.size) > max_dim:
        ratio = max_dim / max(img.size)
        new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
        img = img.resize(new_size, Image.LANCZOS)

    # Binary search for JPEG quality that hits target size
    lo, hi = 20, 85
    best_buf = None
    for _ in range(6):
        q = (lo + hi) // 2
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=q, optimize=True)
        size_kb = buf.tell() / 1024
        best_buf = buf
        if size_kb > target_kb:
            hi = q - 1
        else:
            lo = q + 1

    _logger.info('Image %s compressed: %.0fKB → %.0fKB', filename, original_kb, best_buf.tell() / 1024)
    return base64.b64encode(best_buf.getvalue())
