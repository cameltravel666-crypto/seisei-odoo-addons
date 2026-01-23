import json
import logging
import requests
import base64
import os
from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

OCR_SERVICE_URL = os.getenv('OCR_SERVICE_URL', 'http://seisei-project-ocr:8868')
OCR_MODE = os.getenv('OCR_MODE', 'paddleocr')  # paddleocr 或 llm


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    ocr_status = fields.Selection([
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('done', 'Done'),
        ('failed', 'Failed'),
    ], string='OCR Status', default='pending', tracking=True)

    ocr_raw_data = fields.Text(string='OCR Raw Data')
    ocr_extracted_texts = fields.Text(string='OCR Texts')
    ocr_line_items = fields.Text(string='OCR Line Items (JSON)')
    ocr_error_message = fields.Text(string='OCR Error')
    ocr_processed_at = fields.Datetime(string='OCR Processed At')
    ocr_confidence = fields.Float(string='OCR Confidence')
    ocr_matched_count = fields.Integer(string='Matched Products', default=0)
    ocr_model_used = fields.Char(string='OCR Model')
    ocr_cost = fields.Float(string='OCR Cost (JPY)')

    def action_send_to_ocr(self):
        """Send attachment to OCR service (PaddleOCR or LLM)"""
        self.ensure_one()
        return self._process_ocr(model_key='haiku')

    def action_send_to_ocr_premium(self):
        """Send to premium LLM OCR (Claude Sonnet)"""
        self.ensure_one()
        return self._process_ocr(model_key='sonnet')

    def _process_ocr(self, model_key='haiku'):
        """Core OCR processing logic"""
        # Find attachment
        attachment = None
        if hasattr(self, 'message_main_attachment_id') and self.message_main_attachment_id:
            attachment = self.message_main_attachment_id
        else:
            attachments = self.env['ir.attachment'].search([
                ('res_model', '=', 'purchase.order'),
                ('res_id', '=', self.id),
                '|',
                ('mimetype', 'like', 'image%'),
                ('mimetype', '=', 'application/pdf')
            ], order='create_date desc', limit=1)
            if attachments:
                attachment = attachments[0]

        if not attachment:
            raise UserError('Please attach a purchase order document first! (Image or PDF)')

        if self.ocr_status == 'processing':
            raise UserError('OCR is already processing.')

        if not attachment.datas:
            raise UserError('Attachment has no data!')

        mimetype = attachment.mimetype or ''
        if not (mimetype.startswith('image') or mimetype == 'application/pdf'):
            raise UserError('Attachment must be an image or PDF!')

        self.write({'ocr_status': 'processing'})

        try:
            file_data = base64.b64decode(attachment.datas)

            # Check usage quota
            usage = self._get_ocr_usage()
            is_billable = usage['used'] >= usage['free_quota']

            # Use LLM OCR
            if OCR_MODE == 'llm' or model_key in ('haiku', 'sonnet', 'gpt4o-mini'):
                result = self._process_with_llm(file_data, mimetype, model_key)
            else:
                result = self._process_with_paddleocr(file_data, mimetype, attachment.name)

            if result.get('success'):
                line_items = result.get('line_items', [])
                extracted = result.get('extracted', {})

                update_vals = {
                    'ocr_status': 'done',
                    'ocr_raw_data': json.dumps(result, ensure_ascii=False, indent=2),
                    'ocr_extracted_texts': result.get('raw_response', ''),
                    'ocr_line_items': json.dumps(line_items, ensure_ascii=False, indent=2),
                    'ocr_processed_at': fields.Datetime.now(),
                    'ocr_confidence': result.get('avg_confidence', 0.95),
                    'ocr_error_message': False,
                    'ocr_model_used': result.get('model', 'paddleocr'),
                    'ocr_cost': result.get('cost', 0) if is_billable else 0,
                }

                # Try to match vendor
                vendor_name = extracted.get('vendor_name')
                if vendor_name and not self.partner_id:
                    partner_id = self._find_or_create_partner(vendor_name)
                    if partner_id:
                        update_vals['partner_id'] = partner_id

                # Try to set date
                if extracted.get('date') and not self.date_order:
                    try:
                        import re
                        date_str = extracted['date']
                        date_str = re.sub(r'[年月]', '-', date_str)
                        date_str = re.sub(r'日', '', date_str)
                        update_vals['date_order'] = date_str
                    except Exception:
                        pass

                self.write(update_vals)

                # Create order lines
                matched_count = self._create_order_lines_from_ocr(line_items)
                self.write({'ocr_matched_count': matched_count})

                # Update usage
                self._increment_ocr_usage(result.get('sell_price', 0) if is_billable else 0)

                _logger.info('[OCR] Purchase order %s done with %s, %d lines, %d matched',
                             self.id, result.get('model'), len(line_items), matched_count)

                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': 'OCR Complete',
                        'message': f'Recognized {len(line_items)} items, matched {matched_count} products (Model: {result.get("model", "paddleocr")})',
                        'type': 'success',
                        'sticky': False,
                    }
                }
            else:
                error_msg = result.get('error', 'Unknown error')
                self.write({
                    'ocr_status': 'failed',
                    'ocr_error_message': error_msg,
                })
                raise UserError('OCR failed: ' + error_msg)

        except Exception as e:
            self.write({'ocr_status': 'failed', 'ocr_error_message': str(e)})
            raise

    def _process_with_llm(self, file_data, mimetype, model_key='haiku'):
        """Process with multimodal LLM"""
        from . import llm_ocr
        return llm_ocr.process_with_llm(file_data, mimetype, model_key)

    def _process_with_paddleocr(self, file_data, mimetype, filename):
        """Process with PaddleOCR service"""
        files = {'file': (filename, file_data, mimetype)}

        response = requests.post(
            OCR_SERVICE_URL + '/ocr/purchase_order',
            files=files,
            timeout=1800
        )

        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                return {
                    'success': True,
                    'extracted': result.get('extracted', {}),
                    'line_items': result.get('line_items', []),
                    'raw_response': '\n'.join(result.get('texts', [])),
                    'model': 'paddleocr',
                    'avg_confidence': result.get('avg_confidence', 0),
                    'cost': 0,
                    'sell_price': 0,
                }
            else:
                return {'success': False, 'error': result.get('error', 'Unknown error')}
        else:
            return {'success': False, 'error': f'HTTP {response.status_code}'}

    def _get_ocr_usage(self):
        """Get current month's OCR usage for this company"""
        from datetime import datetime
        month_key = datetime.now().strftime('%Y-%m')

        # You can store this in a separate model or company settings
        # For now, return default values
        return {
            'month': month_key,
            'used': 0,
            'free_quota': 30,
            'billable_count': 0,
            'total_cost': 0,
        }

    def _increment_ocr_usage(self, cost):
        """Increment OCR usage counter"""
        # Implement your billing logic here
        pass

    def action_reset_ocr(self):
        """Reset OCR status"""
        self.write({
            'ocr_status': 'pending',
            'ocr_raw_data': False,
            'ocr_extracted_texts': False,
            'ocr_line_items': False,
            'ocr_error_message': False,
            'ocr_processed_at': False,
            'ocr_confidence': 0,
            'ocr_matched_count': 0,
            'ocr_model_used': False,
            'ocr_cost': 0,
        })

    def action_apply_ocr_lines(self):
        """Manually apply OCR recognized product lines"""
        self.ensure_one()
        if not self.ocr_line_items:
            raise UserError('No OCR line items to apply!')

        try:
            line_items = json.loads(self.ocr_line_items)
            matched_count = self._create_order_lines_from_ocr(line_items)
            self.write({'ocr_matched_count': matched_count})

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Lines Applied',
                    'message': f'Matched {matched_count} products',
                    'type': 'success',
                    'sticky': False,
                }
            }
        except json.JSONDecodeError:
            raise UserError('Invalid OCR line items data')

    def _create_order_lines_from_ocr(self, line_items):
        """Create purchase order lines from OCR data"""
        created_count = 0
        OrderLine = self.env['purchase.order.line']

        for item in line_items:
            product_name = item.get('product_name', '')
            quantity = item.get('quantity', 1)
            unit_price = item.get('unit_price', 0)

            if not product_name:
                continue

            product = self._find_or_create_product(product_name, unit_price)

            if product:
                existing_line = OrderLine.search([
                    ('order_id', '=', self.id),
                    ('product_id', '=', product.id)
                ], limit=1)

                if existing_line:
                    existing_line.write({
                        'product_qty': existing_line.product_qty + quantity,
                    })
                else:
                    OrderLine.create({
                        'order_id': self.id,
                        'product_id': product.id,
                        'name': product.name,
                        'product_qty': quantity,
                        'price_unit': unit_price or product.standard_price,
                        'product_uom': product.uom_po_id.id or product.uom_id.id,
                        'date_planned': fields.Datetime.now(),
                    })

                created_count += 1
                _logger.info('[OCR] Product: %s -> %s (qty: %s, price: %s)',
                            product_name, product.name, quantity, unit_price)

        return created_count

    def _find_or_create_product(self, name, price=0):
        """Find product by name, create if not found"""
        if not name or len(name) < 2:
            return False

        Product = self.env['product.product']

        # Exact match
        product = Product.search([('name', '=', name)], limit=1)
        if product:
            return product

        # Contains match
        product = Product.search([('name', 'ilike', name)], limit=1)
        if product:
            return product

        # Partial match
        for word in name.split():
            if len(word) >= 2:
                product = Product.search([('name', 'ilike', word)], limit=1)
                if product:
                    return product

        # Create new product
        _logger.info('[OCR] Creating new product: %s (price: %s)', name, price)
        try:
            product = Product.create({
                'name': name,
                'type': 'consu',
                'purchase_ok': True,
                'sale_ok': False,
                'standard_price': price,
                'list_price': price,
            })
            return product
        except Exception as e:
            _logger.error('[OCR] Failed to create product %s: %s', name, e)
            return False

    def _find_or_create_partner(self, name):
        """Find or create supplier partner"""
        if not name or len(name) < 2:
            return False

        Partner = self.env['res.partner']

        partner = Partner.search([('name', '=', name), ('supplier_rank', '>', 0)], limit=1)
        if partner:
            return partner.id

        partner = Partner.search([('name', 'ilike', name), ('supplier_rank', '>', 0)], limit=1)
        if partner:
            return partner.id

        partner = Partner.search([('name', 'ilike', name)], limit=1)
        if partner:
            partner.write({'supplier_rank': 1})
            return partner.id

        _logger.info('[OCR] Creating new supplier: %s', name)
        try:
            partner = Partner.create({
                'name': name,
                'supplier_rank': 1,
                'customer_rank': 0,
                'company_type': 'company',
            })
            return partner.id
        except Exception as e:
            _logger.error('[OCR] Failed to create supplier %s: %s', name, e)
            return False
