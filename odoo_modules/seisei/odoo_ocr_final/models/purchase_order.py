"""
Purchase Order OCR Integration
Single model: GPT-4o-mini with PDF to image conversion
"""
import json
import logging
import base64
from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    # OCR Status Fields
    ocr_status = fields.Selection([
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('done', 'Done'),
        ('failed', 'Failed'),
    ], string='OCR Status', default='pending', tracking=True)

    ocr_raw_data = fields.Text(string='OCR Raw Data')
    ocr_extracted_texts = fields.Text(string='OCR Response')
    ocr_line_items = fields.Text(string='OCR Line Items (JSON)')
    ocr_error_message = fields.Text(string='OCR Error')
    ocr_processed_at = fields.Datetime(string='OCR Processed At')
    ocr_matched_count = fields.Integer(string='Matched Products', default=0)
    ocr_pages = fields.Integer(string='Pages Processed', default=0)
    ocr_cost = fields.Integer(string='Cost (JPY)', default=0)

    def action_ocr_scan(self):
        """
        Main OCR action - Process attached document
        Supports images and PDFs (PDF converted to images)
        """
        self.ensure_one()

        # Find attachment
        attachment = self._find_ocr_attachment()
        if not attachment:
            raise UserError('Please attach a document first! (Image or PDF)')

        if self.ocr_status == 'processing':
            raise UserError('OCR is already processing.')

        if not attachment.datas:
            raise UserError('Attachment has no data!')

        mimetype = attachment.mimetype or ''
        if not (mimetype.startswith('image') or mimetype == 'application/pdf'):
            raise UserError('File must be an image or PDF!')

        # Start processing
        self.write({'ocr_status': 'processing', 'ocr_error_message': False})

        try:
            file_data = base64.b64decode(attachment.datas)

            # Process document
            from . import llm_ocr
            result = llm_ocr.process_document(file_data, mimetype)

            if not result.get('success'):
                raise UserError(f"OCR failed: {result.get('error', 'Unknown error')}")

            # Get results
            line_items = result.get('line_items', [])
            extracted = result.get('extracted', {})
            pages = result.get('pages', 1)

            # Update usage and get cost
            OcrUsage = self.env['ocr.usage']
            billing = OcrUsage.increment_usage(pages=pages)

            # Prepare update values
            update_vals = {
                'ocr_status': 'done',
                'ocr_raw_data': json.dumps(result, ensure_ascii=False, indent=2),
                'ocr_extracted_texts': result.get('raw_response', ''),
                'ocr_line_items': json.dumps(line_items, ensure_ascii=False, indent=2),
                'ocr_processed_at': fields.Datetime.now(),
                'ocr_error_message': False,
                'ocr_pages': pages,
                'ocr_cost': billing['cost'],
            }

            # Auto-fill vendor
            vendor_name = extracted.get('vendor_name')
            if vendor_name and not self.partner_id:
                partner_id = self._find_or_create_partner(vendor_name)
                if partner_id:
                    update_vals['partner_id'] = partner_id

            # Auto-fill date
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

            _logger.info(f'[OCR] PO {self.id}: {pages} pages, {len(line_items)} items, {matched_count} matched')

            # Build notification message
            cost_msg = f"¥{billing['cost']}" if billing['is_billable'] else "Free"
            usage = OcrUsage.get_current_usage()

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'OCR Complete',
                    'message': f"{len(line_items)} items found, {matched_count} matched\n"
                               f"Pages: {pages}, Cost: {cost_msg}\n"
                               f"Quota: {usage['remaining_free']}/{usage['free_quota']} remaining",
                    'type': 'success',
                    'sticky': False,
                }
            }

        except UserError:
            raise
        except Exception as e:
            self.write({
                'ocr_status': 'failed',
                'ocr_error_message': str(e)
            })
            _logger.exception(f'[OCR] Error processing PO {self.id}')
            raise UserError(f'OCR processing error: {e}')

    def action_ocr_reset(self):
        """Reset OCR status"""
        self.write({
            'ocr_status': 'pending',
            'ocr_raw_data': False,
            'ocr_extracted_texts': False,
            'ocr_line_items': False,
            'ocr_error_message': False,
            'ocr_processed_at': False,
            'ocr_matched_count': 0,
            'ocr_pages': 0,
            'ocr_cost': 0,
        })

    def action_ocr_apply_lines(self):
        """Manually apply OCR recognized lines"""
        self.ensure_one()
        if not self.ocr_line_items:
            raise UserError('No OCR data to apply!')

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
            raise UserError('Invalid OCR data format')

    def action_ocr_view_usage(self):
        """Show current OCR usage"""
        self.ensure_one()
        OcrUsage = self.env['ocr.usage']
        usage = OcrUsage.get_current_usage()

        msg = f"Month: {usage['month']}\n"
        msg += f"Used: {usage['used']} images\n"
        msg += f"Free remaining: {usage['remaining_free']}/{usage['free_quota']}\n"
        if usage['billable'] > 0:
            msg += f"Billable: {usage['billable']} images\n"
            msg += f"Total cost: ¥{usage['total_cost']}"

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'OCR Usage This Month',
                'message': msg,
                'type': 'info',
                'sticky': True,
            }
        }

    def _find_ocr_attachment(self):
        """Find suitable attachment for OCR"""
        # Try main attachment first
        if hasattr(self, 'message_main_attachment_id') and self.message_main_attachment_id:
            return self.message_main_attachment_id

        # Search for attached files
        attachments = self.env['ir.attachment'].search([
            ('res_model', '=', 'purchase.order'),
            ('res_id', '=', self.id),
            '|',
            ('mimetype', 'like', 'image%'),
            ('mimetype', '=', 'application/pdf')
        ], order='create_date desc', limit=1)

        return attachments[0] if attachments else None

    def _create_order_lines_from_ocr(self, line_items):
        """Create purchase order lines from OCR extracted items"""
        created_count = 0
        OrderLine = self.env['purchase.order.line']

        for item in line_items:
            product_name = item.get('product_name', '')
            if not product_name:
                continue

            # Parse quantity
            try:
                quantity = float(item.get('quantity', 1) or 1)
            except (ValueError, TypeError):
                quantity = 1

            # Parse price
            try:
                unit_price = float(item.get('unit_price', 0) or 0)
            except (ValueError, TypeError):
                unit_price = 0

            # Find or create product
            product = self._find_or_create_product(product_name, unit_price)
            if not product:
                continue

            # Check for existing line
            existing = OrderLine.search([
                ('order_id', '=', self.id),
                ('product_id', '=', product.id)
            ], limit=1)

            if existing:
                existing.write({'product_qty': existing.product_qty + quantity})
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
            _logger.info(f'[OCR] Added: {product_name} -> {product.name} (qty: {quantity})')

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

        # Fuzzy match
        product = Product.search([('name', 'ilike', name)], limit=1)
        if product:
            return product

        # Word match
        for word in name.split():
            if len(word) >= 2:
                product = Product.search([('name', 'ilike', word)], limit=1)
                if product:
                    return product

        # Create new product
        _logger.info(f'[OCR] Creating product: {name}')
        try:
            return Product.create({
                'name': name,
                'type': 'consu',
                'purchase_ok': True,
                'sale_ok': False,
                'standard_price': price,
                'list_price': price,
            })
        except Exception as e:
            _logger.error(f'[OCR] Failed to create product: {e}')
            return False

    def _find_or_create_partner(self, name):
        """Find or create supplier"""
        if not name or len(name) < 2:
            return False

        Partner = self.env['res.partner']

        # Exact supplier match
        partner = Partner.search([('name', '=', name), ('supplier_rank', '>', 0)], limit=1)
        if partner:
            return partner.id

        # Fuzzy supplier match
        partner = Partner.search([('name', 'ilike', name), ('supplier_rank', '>', 0)], limit=1)
        if partner:
            return partner.id

        # Any contact match
        partner = Partner.search([('name', 'ilike', name)], limit=1)
        if partner:
            partner.write({'supplier_rank': 1})
            return partner.id

        # Create new supplier
        _logger.info(f'[OCR] Creating supplier: {name}')
        try:
            partner = Partner.create({
                'name': name,
                'supplier_rank': 1,
                'customer_rank': 0,
                'company_type': 'company',
            })
            return partner.id
        except Exception as e:
            _logger.error(f'[OCR] Failed to create supplier: {e}')
            return False
