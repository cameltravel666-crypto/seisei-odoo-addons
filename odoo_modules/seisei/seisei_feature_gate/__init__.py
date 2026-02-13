# -*- coding: utf-8 -*-

from . import models

from odoo import fields


def _post_init_hook(env):
    """Set install_date on first install so trial period starts now."""
    ICP = env['ir.config_parameter'].sudo()
    if not ICP.get_param('seisei_feature_gate.install_date'):
        ICP.set_param(
            'seisei_feature_gate.install_date',
            fields.Datetime.now().isoformat(),
        )
