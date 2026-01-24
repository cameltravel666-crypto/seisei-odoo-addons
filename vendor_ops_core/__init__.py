# -*- coding: utf-8 -*-

from . import models
from . import wizard
from . import services
from . import controllers


def _post_init_align_sequences(env):
    """
    Post-init hook: Align tenant sequence number_next to max(tenant.code) + 1.
    This ensures the sequence doesn't restart from 1 after module upgrade.

    Critical for baseline-tenant-code-ok-20260104-052905 constraint.

    Note: Odoo 19 uses 'number_next' (not 'number_next_actual' as in older versions).
    """
    import logging
    _logger = logging.getLogger(__name__)

    try:
        # Find the tenant sequence
        seq = env['ir.sequence'].search([('code', '=', 'vendor_ops.tenant')], limit=1)
        if not seq:
            _logger.warning("Tenant sequence 'vendor_ops.tenant' not found, skipping alignment")
            return

        # Get max tenant code from database
        env.cr.execute("""
            SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER))
            FROM vendor_ops_tenant
            WHERE code ~ '^TEN-[0-9]+$'
        """)
        result = env.cr.fetchone()
        max_code_num = result[0] if result and result[0] else 0

        # Calculate required next number
        required_next = max_code_num + 1
        # Odoo 19 uses number_next instead of number_next_actual
        current_next = seq.number_next

        if required_next > current_next:
            _logger.info(
                f"Aligning tenant sequence: current={current_next}, max_code={max_code_num}, setting to {required_next}"
            )
            seq.sudo().write({'number_next': required_next})
            _logger.info(f"Tenant sequence aligned to {required_next}")
        else:
            _logger.info(
                f"Tenant sequence OK: current={current_next} >= required={required_next}"
            )
    except Exception as e:
        _logger.exception(f"Error aligning tenant sequence: {e}")
        # Don't block module install/upgrade
