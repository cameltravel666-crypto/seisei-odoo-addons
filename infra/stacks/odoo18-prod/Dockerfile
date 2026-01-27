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

# Install curl for healthcheck (may already exist, but ensure it)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

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
