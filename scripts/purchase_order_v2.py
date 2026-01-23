import json
import logging
import requests
import base64
import os
from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

OCR_SERVICE_URL = os.getenv('OCR_SERVICE_URL', 'http://seisei-project-ocr:8868')


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
    ocr_pages = fields.Integer(string='Pages Processed', default=0)

    def action_send_to_ocr_quick(self):
        """Quick OCR - GPT-4o-mini (cheapest, PDF converted to images)"""
        self.ensure_one()
        return self._process_ocr(model_key='gpt4o-mini')

    def action_send_to_ocr(self):
        """Standard OCR - Claude Haiku 3.5 (recommended, native PDF)"""
        self.ensure_one()
        return self._process_ocr(model_key='haiku')

    def action_send_to_ocr_premium(self):
        """Premium OCR - Claude Sonnet 4 (best quality for complex docs)"""
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

            # Process with LLM OCR
            from . import llm_ocr
            result = llm_ocr.process_with_llm(file_data, mimetype, model_key)

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
                    'ocr_model_used': result.get('model', 'unknown'),
                    'ocr_cost': result.get('sell_price', 0) if is_billable else 0,
                    'ocr_pages': result.get('pages_processed', 1),
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

                _logger.info('[OCR] Purchase order %s done with %s, %d items, %d matched',
                             self.id, result.get('model'), len(line_items), matched_count)

                # Build message
                model_name = result.get('model', 'unknown')
                pages = result.get('pages_processed', 1)
                cost_msg = f", Cost: ¥{result.get('sell_price', 0)}" if is_billable else " (Free)"

                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': 'OCR Complete',
                        'message': f'{len(line_items)} items recognized, {matched_count} matched\nModel: {model_name}, Pages: {pages}{cost_msg}',
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

    def _get_ocr_usage(self):
        """Get current month's OCR usage"""
        from datetime import datetime
        month_key = datetime.now().strftime('%Y-%m')
        # TODO: Implement actual usage tracking
        return {
            'month': month_key,
            'used': 0,
            'free_quota': 30,
            'billable_count': 0,
            'total_cost': 0,
        }

    def _increment_ocr_usage(self, cost):
        """Increment OCR usage counter"""
        # TODO: Implement actual billing
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
            'ocr_pages': 0,
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

            # Ensure quantity is a number
            try:
                quantity = float(quantity) if quantity else 1
            except (ValueError, TypeError):
                quantity = 1

            # Ensure price is a number
            try:
                unit_price = float(unit_price) if unit_price else 0
            except (ValueError, TypeError):
                unit_price = 0

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
