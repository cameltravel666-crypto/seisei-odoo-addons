# =============================================================================
# Seisei Odoo 18 Production - Immutable Image
# =============================================================================
# This Dockerfile builds an immutable image containing:
# - All custom addons from odoo_modules/
# - Production odoo.conf baked in
# - No runtime volume mounts for config/addons
#
# Build context must be repository root (not this directory)
# Build command: docker build -f infra/stacks/odoo18-prod/Dockerfile -t seisei-odoo18:latest .
# =============================================================================

FROM odoo:18.0

# Switch to root for installation
USER root

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies required by custom addons
# PyMuPDF (fitz): odoo_ocr_final, custom_ocr_finance (PDF processing)
# boto3: seisei_s3_attachment (S3 storage)
# qrcode: qr_ordering (QR code generation)
# openpyxl, xlsxwriter: accounting_report_xlsx, ocr_file, base_accounting_kit
# ofxparse, qifparse: base_accounting_kit (bank statement import)
# google-api-python-client, google-auth: seisei_gdoc_import
# Note: --break-system-packages required for Debian 12 (PEP 668)
RUN pip3 install --no-cache-dir --break-system-packages \
    PyMuPDF==1.24.0 \
    boto3 \
    qrcode \
    openpyxl \
    xlsxwriter \
    ofxparse \
    qifparse \
    google-api-python-client \
    google-auth \
    && python3 -c "import fitz; print('PyMuPDF version:', fitz.version)"

# Create addons directory structure
RUN mkdir -p /mnt/extra-addons && chown -R odoo:odoo /mnt/extra-addons

# Copy all custom addons from odoo_modules/
# This includes seisei_entitlements and all other custom modules
COPY --chown=odoo:odoo odoo_modules/ /mnt/extra-addons/

# Copy production odoo.conf
COPY --chown=odoo:odoo infra/stacks/odoo18-prod/config/odoo.conf /etc/odoo/odoo.conf

# Set correct permissions
RUN chmod 755 /mnt/extra-addons && \
    chmod 644 /etc/odoo/odoo.conf && \
    find /mnt/extra-addons -type d -exec chmod 755 {} \; && \
    find /mnt/extra-addons -type f -exec chmod 644 {} \;

# Switch back to odoo user for runtime
USER odoo

# Expose ports
EXPOSE 8069 8072

# Default command (inherited from base image, but explicit for clarity)
CMD ["odoo"]
