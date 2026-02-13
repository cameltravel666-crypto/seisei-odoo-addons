# -*- coding: utf-8 -*-

from odoo import models


class OcrFileTaskGate(models.Model):
    _inherit = 'ocr.file.task'

    def action_start_ocr(self):
        self.env['seisei.feature.gate'].check_access('module_ocr_file')
        return super().action_start_ocr()
