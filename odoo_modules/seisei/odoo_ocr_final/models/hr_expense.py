import json
import logging
import base64
from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class HrExpense(models.Model):
    _inherit = 'hr.expense'

    # OCR fields
    ocr_status = fields.Selection([
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('done', 'Done'),
        ('failed', 'Failed'),
    ], string='AI Status', default='pending', tracking=True)
    ocr_raw_data = fields.Text(string='AI Raw Data')
    ocr_error_message = fields.Text(string='AI Error')
    ocr_processed_at = fields.Datetime(string='AI Processed At')

    def action_send_to_ocr(self):
        """Process attached receipt with LLM OCR"""
        self.ensure_one()

        # Find attached image/PDF
        attachments = self.env['ir.attachment'].search([
            ('res_model', '=', 'hr.expense'),
            ('res_id', '=', self.id),
        ], order='create_date desc', limit=1)

        if not attachments:
            raise UserError(_('Please attach a receipt image first!'))

        attachment = attachments[0]
        mimetype = attachment.mimetype or ''
        if not (mimetype.startswith('image') or mimetype == 'application/pdf'):
            raise UserError(_('Attachment must be an image or PDF!'))

        if self.ocr_status == 'processing':
            raise UserError(_('OCR is already processing.'))

        self.write({'ocr_status': 'processing', 'ocr_error_message': False})

        try:
            _logger.info('[Expense OCR] Processing expense %s: %s', self.id, attachment.name)

            file_data = base64.b64decode(attachment.datas)

            # Use LLM OCR to process document
            from . import llm_ocr
            result = llm_ocr.process_expense_document(file_data, mimetype)

            if not result.get('success'):
                raise UserError(f"OCR failed: {result.get('error', 'Unknown error')}")

            # Get results
            extracted = result.get('extracted', {})
            pages = result.get('pages', 1)

            # Update usage
            OcrUsage = self.env['ocr.usage']
            OcrUsage.increment_usage(pages=pages)

            update_vals = {
                'ocr_status': 'done',
                'ocr_raw_data': json.dumps(result, ensure_ascii=False, indent=2),
                'ocr_processed_at': fields.Datetime.now(),
                'ocr_error_message': False,
            }

            # Auto-fill expense fields from OCR
            self._apply_ocr_data(extracted, update_vals)

            self.write(update_vals)

            return {
                'success': True,
                'message': _('Receipt processed successfully'),
                'extracted': extracted,
            }

        except Exception as e:
            _logger.exception('[Expense OCR] Error processing expense %s', self.id)
            self.write({
                'ocr_status': 'failed',
                'ocr_error_message': str(e),
            })
            return {'success': False, 'error': str(e)}

    def _apply_ocr_data(self, extracted, update_vals):
        """Apply OCR extracted data to expense fields"""
        # Name/Description
        description = extracted.get('description') or extracted.get('vendor_name') or extracted.get('store_name')
        if description and not self.name:
            update_vals['name'] = description[:256]

        # Total amount (tax-inclusive)
        total = extracted.get('total_amount') or extracted.get('total')
        if total:
            try:
                amount = float(str(total).replace(',', '').replace('¥', '').replace('円', '').strip())
                if amount > 0:
                    update_vals['total_amount'] = amount
            except (ValueError, TypeError):
                pass

        # Date
        expense_date = extracted.get('date') or extracted.get('invoice_date') or extracted.get('receipt_date')
        if expense_date:
            try:
                from datetime import datetime
                # Try various date formats
                for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y年%m月%d日', '%d/%m/%Y', '%m/%d/%Y']:
                    try:
                        parsed = datetime.strptime(expense_date, fmt)
                        update_vals['date'] = parsed.date()
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        # Reference
        ref = extracted.get('invoice_number') or extracted.get('receipt_number') or extracted.get('reference')
        if ref and not self.reference:
            update_vals['reference'] = str(ref)[:64]

        # Try to find matching product
        product_name = extracted.get('product_name') or extracted.get('category')
        if product_name:
            product = self._find_expense_product(product_name)
            if product and not self.product_id:
                update_vals['product_id'] = product.id

    def _find_expense_product(self, name):
        """Find expense product by name"""
        Product = self.env['product.product']

        # Search for expense products
        product = Product.search([
            ('name', 'ilike', name),
            ('can_be_expensed', '=', True),
        ], limit=1)

        if product:
            return product

        # Try partial match
        words = name.split()
        for word in words:
            if len(word) >= 3:
                product = Product.search([
                    ('name', 'ilike', word),
                    ('can_be_expensed', '=', True),
                ], limit=1)
                if product:
                    return product

        return None

    def action_upload_and_ocr(self, image_data=None, filename=None, mimetype=None):
        """Upload image and run OCR - called from JavaScript"""
        self.ensure_one()

        if not image_data:
            raise UserError(_('No image data provided'))

        if self.ocr_status == 'processing':
            raise UserError(_('OCR is already processing'))

        try:
            # Create attachment
            attachment = self.env['ir.attachment'].create({
                'name': filename or 'receipt.jpg',
                'type': 'binary',
                'datas': image_data,
                'res_model': 'hr.expense',
                'res_id': self.id,
                'mimetype': mimetype or 'image/jpeg',
            })

            _logger.info('[Expense OCR] Created attachment %s for expense %s', attachment.id, self.id)

            # Run OCR
            return self.action_send_to_ocr()

        except Exception as e:
            _logger.exception('[Expense OCR] Upload error for expense %s', self.id)
            return {'success': False, 'error': str(e)}
