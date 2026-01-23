# -*- coding: utf-8 -*-
# Post-migration script for vendor_ops_core 19.0.2.0.0
# Handles merge from vendor_ops_intake_notion

import logging
from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    """
    Post-migration script for vendor_ops_core 19.0.2.0.0.

    This migration:
    1. Adds new fields to vendor_ops_intake_batch if they don't exist
    2. Aligns tenant sequence number_next to prevent restart from 1
    3. Cleans up vendor_ops_intake_notion references if module was installed
    """
    _logger.info("Starting vendor_ops_core 19.0.2.0.0 post-migration")

    # 1. Add new fields to vendor_ops_intake_batch if missing
    _add_missing_batch_fields(cr)

    # 2. Align tenant sequence
    _align_tenant_sequence(cr)

    # 3. Cleanup old module references (if vendor_ops_intake_notion was installed)
    _cleanup_old_module_references(cr)

    _logger.info("Completed vendor_ops_core 19.0.2.0.0 post-migration")


def _add_missing_batch_fields(cr):
    """Add new fields to vendor_ops_intake_batch table if they don't exist."""
    fields_to_add = [
        ('notion_page_urls', 'TEXT', None),
        ('last_pull_at', 'TIMESTAMP', None),
        ('last_pull_summary', 'TEXT', None),
        ('last_error', 'TEXT', None),
        ('bridge_trace_id', 'VARCHAR(255)', None),
    ]

    for field_name, field_type, default in fields_to_add:
        # Check if column exists
        cr.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'vendor_ops_intake_batch'
            AND column_name = %s
        """, (field_name,))

        if not cr.fetchone():
            _logger.info(f"Adding column {field_name} to vendor_ops_intake_batch")
            sql = f"ALTER TABLE vendor_ops_intake_batch ADD COLUMN {field_name} {field_type}"
            if default is not None:
                sql += f" DEFAULT {default}"
            cr.execute(sql)
        else:
            _logger.info(f"Column {field_name} already exists in vendor_ops_intake_batch")


def _align_tenant_sequence(cr):
    """
    Align tenant sequence number_next to max(tenant.code) + 1.
    Critical for preventing sequence restart from 1 after module upgrade.

    Note: Odoo 19 uses 'number_next' column (not 'number_next_actual' as in older versions).
    """
    # Find the tenant sequence (Odoo 19 uses number_next)
    cr.execute("""
        SELECT id, number_next
        FROM ir_sequence
        WHERE code = 'vendor_ops.tenant'
        LIMIT 1
    """)
    seq_row = cr.fetchone()

    if not seq_row:
        _logger.warning("Tenant sequence 'vendor_ops.tenant' not found, skipping alignment")
        return

    seq_id, current_next = seq_row

    # Get max tenant code from database
    cr.execute("""
        SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER))
        FROM vendor_ops_tenant
        WHERE code ~ '^TEN-[0-9]+$'
    """)
    result = cr.fetchone()
    max_code_num = result[0] if result and result[0] else 0

    # Calculate required next number
    required_next = max_code_num + 1

    if required_next > current_next:
        _logger.info(
            f"Aligning tenant sequence: current={current_next}, max_code={max_code_num}, setting to {required_next}"
        )
        cr.execute("""
            UPDATE ir_sequence
            SET number_next = %s
            WHERE id = %s
        """, (required_next, seq_id))
        _logger.info(f"Tenant sequence aligned to {required_next}")
    else:
        _logger.info(
            f"Tenant sequence OK: current={current_next} >= required={required_next}"
        )


def _cleanup_old_module_references(cr):
    """
    Clean up vendor_ops_intake_notion module references if it was installed.
    This prevents orphaned records in ir_model_data.
    """
    # Check if vendor_ops_intake_notion was ever installed
    cr.execute("""
        SELECT id FROM ir_module_module
        WHERE name = 'vendor_ops_intake_notion'
    """)

    if not cr.fetchone():
        _logger.info("vendor_ops_intake_notion was never installed, skipping cleanup")
        return

    _logger.info("Cleaning up vendor_ops_intake_notion references")

    # Delete orphaned ir_model_data records
    cr.execute("""
        DELETE FROM ir_model_data
        WHERE module = 'vendor_ops_intake_notion'
    """)
    deleted_count = cr.rowcount
    _logger.info(f"Deleted {deleted_count} ir_model_data records for vendor_ops_intake_notion")

    # Mark module as uninstalled if present
    cr.execute("""
        UPDATE ir_module_module
        SET state = 'uninstalled'
        WHERE name = 'vendor_ops_intake_notion'
        AND state != 'uninstalled'
    """)
    if cr.rowcount:
        _logger.info("Marked vendor_ops_intake_notion as uninstalled")
