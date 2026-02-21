from odoo import models, fields, api


class OcrDataWizard(models.TransientModel):
    _name = 'ocr.data.wizard'
    _description = 'AI Data Viewer'

    ocr_extracted_texts = fields.Text(string='AI Raw Text', readonly=True)
    ocr_line_items = fields.Text(string='Extracted Items (JSON)', readonly=True)
    ocr_confidence = fields.Float(string='Confidence', readonly=True)
    ocr_status = fields.Char(string='Status', readonly=True)

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        active_id = self.env.context.get('active_id')
        active_model = self.env.context.get('active_model')

        if active_model == 'purchase.order' and active_id:
            order = self.env['purchase.order'].browse(active_id)
            res.update({
                'ocr_extracted_texts': order.ocr_extracted_texts or '',
                'ocr_line_items': order.ocr_line_items or '',
                'ocr_confidence': order.ocr_confidence or 0,
                'ocr_status': order.ocr_status or 'pending',
            })
        return res
