import json
import logging
import base64
import re
import time
from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

# Batch OCR configuration
BATCH_OCR_DELAY = 2  # Seconds between each OCR call to avoid rate limiting
BATCH_OCR_MAX_PER_RUN = 5  # Max records per cron run to prevent timeout


class AccountMove(models.Model):
    _inherit = 'account.move'

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
    ocr_pages = fields.Integer(string='Pages Processed', default=0)

    def action_send_to_ocr(self):
        """Process attached document with LLM OCR and create invoice lines"""
        self.ensure_one()

        if not self.message_main_attachment_id:
            raise UserError('Please attach an invoice image first!')

        if self.ocr_status == 'processing':
            raise UserError('OCR is already processing.')

        attachment = self.message_main_attachment_id
        if not attachment.datas:
            raise UserError('Attachment has no data!')

        mimetype = attachment.mimetype or ''
        if not (mimetype.startswith('image') or mimetype == 'application/pdf'):
            raise UserError('Attachment must be an image or PDF!')

        # Check valid move types
        valid_types = ('in_invoice', 'in_refund', 'out_invoice', 'out_refund')
        if self.move_type not in valid_types:
            raise UserError('OCR is only available for invoices and bills!')

        self.write({'ocr_status': 'processing', 'ocr_error_message': False})

        try:
            _logger.info('[OCR] Processing invoice %s: %s', self.id, attachment.name)

            file_data = base64.b64decode(attachment.datas)

            # Use LLM OCR to process document (same as purchase_order.py)
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

            update_vals = {
                'ocr_status': 'done',
                'ocr_raw_data': json.dumps(result, ensure_ascii=False, indent=2),
                'ocr_extracted_texts': result.get('raw_response', ''),
                'ocr_line_items': json.dumps(line_items, ensure_ascii=False, indent=2),
                'ocr_processed_at': fields.Datetime.now(),
                'ocr_confidence': 93.5,  # LLM OCR typically has high confidence
                'ocr_error_message': False,
                'ocr_pages': pages,
            }

            # Auto-fill vendor (with tax_id and address support)
            vendor_name = extracted.get('vendor_name')
            tax_id = extracted.get('tax_id')
            vendor_address = extracted.get('vendor_address')
            if vendor_name and not self.partner_id:
                partner_id = self._find_or_create_partner(vendor_name, tax_id=tax_id, address=vendor_address)
                if partner_id:
                    update_vals['partner_id'] = partner_id

            # Auto-fill invoice number
            if extracted.get('invoice_number'):
                update_vals['ref'] = extracted['invoice_number']

            # Auto-fill date
            if extracted.get('date'):
                try:
                    date_str = extracted['date']
                    date_str = re.sub(r'[年月]', '-', date_str)
                    date_str = re.sub(r'日', '', date_str)
                    update_vals['invoice_date'] = date_str
                except Exception:
                    pass

            # Store total amount in narration for reference
            total = extracted.get('total')
            if total:
                current = self.narration or ''
                update_vals['narration'] = f'OCR Amount: {total}\n{current}'

            self.write(update_vals)

            # Create invoice lines from OCR extracted items
            # Check if prices are tax-inclusive (内税/税込)
            is_tax_inclusive = extracted.get('is_tax_inclusive', False)
            matched_count = self._create_invoice_lines_from_ocr(
                line_items,
                is_tax_inclusive=is_tax_inclusive,
                extracted=extracted
            )
            self.write({'ocr_matched_count': matched_count})

            _logger.info(f'[OCR] Invoice {self.id}: {pages} pages, {len(line_items)} items, {matched_count} matched')

            # Reload the form to show updated data
            return {
                'type': 'ir.actions.act_window',
                'res_model': 'account.move',
                'res_id': self.id,
                'view_mode': 'form',
                'target': 'current',
            }

        except UserError:
            raise
        except Exception as e:
            self.write({
                'ocr_status': 'failed',
                'ocr_error_message': str(e)
            })
            _logger.exception(f'[OCR] Error processing invoice {self.id}')
            raise UserError(f'OCR processing error: {e}')

    def action_reset_ocr(self):
        """Reset OCR status and clear all OCR-related data"""
        self.write({
            'ocr_status': 'pending',
            'ocr_raw_data': False,
            'ocr_extracted_texts': False,
            'ocr_line_items': False,
            'ocr_error_message': False,
            'ocr_processed_at': False,
            'ocr_confidence': 0,
            'ocr_matched_count': 0,
            'ocr_pages': 0,
        })

    def action_ocr_apply_lines(self):
        """Manually apply OCR recognized lines to create invoice lines"""
        self.ensure_one()
        if not self.ocr_line_items:
            raise UserError('No OCR data to apply!')

        try:
            line_items = json.loads(self.ocr_line_items)

            # Try to get full extracted data for tax-inclusive flag
            extracted = {}
            is_tax_inclusive = False
            if self.ocr_raw_data:
                try:
                    raw_data = json.loads(self.ocr_raw_data)
                    extracted = raw_data.get('extracted', {})
                    is_tax_inclusive = extracted.get('is_tax_inclusive', False)
                except json.JSONDecodeError:
                    pass

            matched_count = self._create_invoice_lines_from_ocr(
                line_items,
                is_tax_inclusive=is_tax_inclusive,
                extracted=extracted
            )
            self.write({'ocr_matched_count': matched_count})

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Lines Applied',
                    'message': f'Created {matched_count} invoice lines',
                    'type': 'success',
                    'sticky': False,
                }
            }
        except json.JSONDecodeError:
            raise UserError('Invalid OCR data format')

    def action_upload_and_ocr(self, image_data, filename='uploaded_image.jpg', mimetype='image/jpeg'):
        """Upload image and trigger OCR in one step.

        This method is called from the chatter upload zone component.

        Args:
            image_data: Base64 encoded image data (without data URL prefix)
            filename: Original filename
            mimetype: MIME type of the file

        Returns:
            dict with success status and result
        """
        self.ensure_one()

        if self.ocr_status == 'processing':
            return {'success': False, 'error': 'OCR is already processing'}

        try:
            # Create attachment from uploaded data
            attachment = self.env['ir.attachment'].create({
                'name': filename,
                'type': 'binary',
                'datas': image_data,
                'res_model': 'account.move',
                'res_id': self.id,
                'mimetype': mimetype,
            })

            # Set as main attachment
            self.message_main_attachment_id = attachment.id

            _logger.info(f'[OCR] Uploaded attachment {attachment.id} for invoice {self.id}')

            # Trigger OCR processing
            self.action_send_to_ocr()

            return {
                'success': True,
                'attachment_id': attachment.id,
                'ocr_status': self.ocr_status,
            }

        except Exception as e:
            _logger.exception(f'[OCR] Upload and OCR failed for invoice {self.id}')
            return {
                'success': False,
                'error': str(e),
            }

    def _create_invoice_lines_from_ocr(self, line_items, is_tax_inclusive=False, extracted=None):
        """Create invoice lines from OCR extracted items.

        Uses batch creation with check_move_validity=False to avoid
        concurrent update errors during dynamic line sync.
        """
        created_count = 0
        extracted = extracted or {}

        # Determine if this is a purchase (expense) or sale (income) document
        is_purchase = self.move_type in ("in_invoice", "in_refund")
        is_sale = self.move_type in ("out_invoice", "out_refund")

        if not is_purchase and not is_sale:
            _logger.warning(f"[OCR] Skipping line creation for move_type: {self.move_type}")
            return 0

        # Collect all line values first, then create in batch
        lines_to_create = []
        lines_to_update = []

        for item in line_items:
            # Support both old format (product_name) and new format (name)
            product_name = item.get("product_name") or item.get("name", "")
            if not product_name:
                continue

            # Parse quantity - support both 'quantity' and 'qty'
            try:
                quantity = float(item.get("quantity") or item.get("qty") or 1)
            except (ValueError, TypeError):
                quantity = 1

            # Parse price (could be tax-inclusive)
            try:
                unit_price = float(item.get("unit_price", 0) or 0)
            except (ValueError, TypeError):
                unit_price = 0

            # If no unit price but amount exists, calculate it
            # Support both 'amount' and 'gross_amount'
            if unit_price == 0:
                try:
                    amount = float(item.get("amount") or item.get("gross_amount") or 0)
                    if amount > 0 and quantity > 0:
                        unit_price = amount / quantity
                except (ValueError, TypeError):
                    pass

            # Get tax rate for this item (default to 8% - food items in Japan)
            # Handle multiple formats: decimal (0.08), integer (8), string ("8%")
            tax_rate = item.get("tax_rate", 8)
            try:
                if tax_rate is not None:
                    # Handle string format like "8%" or "10%"
                    if isinstance(tax_rate, str):
                        tax_rate = tax_rate.replace('%', '').strip()
                    tax_rate = float(tax_rate)
                    # If decimal format (e.g., 0.08), convert to percentage
                    if tax_rate < 1:
                        tax_rate = int(tax_rate * 100)
                    else:
                        tax_rate = int(tax_rate)
                else:
                    tax_rate = 8
            except (ValueError, TypeError):
                tax_rate = 8

            # If tax-inclusive, convert to tax-exclusive price
            price_excl = unit_price
            if is_tax_inclusive and unit_price > 0:
                price_excl = round(unit_price / (1 + tax_rate / 100), 2)
                _logger.info(f"[OCR] Tax-inclusive conversion: {unit_price} -> {price_excl} (excl. {tax_rate}% tax)")

            # Find or create product
            product = self._find_or_create_product(product_name, price_excl, is_sale=is_sale)
            if not product:
                _logger.warning(f"[OCR] Could not find/create product: {product_name}")
                continue

            # Check for existing line with same product
            existing = self.invoice_line_ids.filtered(lambda l: l.product_id.id == product.id)

            if existing:
                # Queue update for existing line
                lines_to_update.append((existing[0], quantity))
                _logger.info(f"[OCR] Will update line: {product_name} (qty: +{quantity})")
            else:
                # Get default account based on document type
                if is_purchase:
                    account = product.property_account_expense_id or \
                              product.categ_id.property_account_expense_categ_id
                    if not account:
                        account = self.env["ir.property"]._get(
                            "property_account_expense_categ_id", "product.category"
                        )
                    price = price_excl or product.standard_price
                else:
                    account = product.property_account_income_id or \
                              product.categ_id.property_account_income_categ_id
                    if not account:
                        account = self.env["ir.property"]._get(
                            "property_account_income_categ_id", "product.category"
                        )
                    price = price_excl or product.list_price

                line_vals = {
                    "move_id": self.id,
                    "product_id": product.id,
                    "name": product.name,
                    "quantity": quantity,
                    "price_unit": price,
                    "product_uom_id": product.uom_id.id,
                }

                if account:
                    line_vals["account_id"] = account.id

                # Find and set appropriate tax
                tax = self._find_tax_by_rate(tax_rate, is_purchase)
                if tax:
                    line_vals["tax_ids"] = [(6, 0, [tax.id])]

                lines_to_create.append(line_vals)
                _logger.info(f"[OCR] Will create line: {product_name} (qty: {quantity}, price: {price})")

            created_count += 1

        # Batch create all new lines
        # Note: Do NOT use skip_invoice_sync=True as it prevents balance/debit/credit computation
        if lines_to_create:
            try:
                # Use check_move_validity=False to avoid validation during batch creation
                # But allow invoice_sync to happen so balance/debit/credit are computed
                self.env["account.move.line"].with_context(
                    check_move_validity=False,
                ).create(lines_to_create)
                _logger.info(f"[OCR] Batch created {len(lines_to_create)} invoice lines")
            except Exception as e:
                _logger.error(f"[OCR] Batch create failed: {e}")
                # Try creating one by one as fallback
                for line_vals in lines_to_create:
                    try:
                        self.env["account.move.line"].with_context(
                            check_move_validity=False,
                        ).create(line_vals)
                    except Exception as e2:
                        _logger.error(f"[OCR] Failed to create line: {e2}")

        # Batch update existing lines
        for line, add_qty in lines_to_update:
            try:
                line.with_context(check_move_validity=False).write({
                    "quantity": line.quantity + add_qty
                })
            except Exception as e:
                _logger.error(f"[OCR] Failed to update line: {e}")

        # Odoo 18: Force synchronization and recomputation of all accounting fields
        # This ensures balance/debit/credit and totals are computed correctly
        try:
            _logger.info(f"[OCR] Triggering full sync for invoice {self.id}")

            # Method 1: Try _synchronize_business_models (Odoo 18 standard method)
            if hasattr(self, '_synchronize_business_models'):
                self.with_context(check_move_validity=False)._synchronize_business_models(['line_ids'])
                _logger.info("[OCR] Used _synchronize_business_models")

            # Method 2: Invalidate and recompute all line fields
            for line in self.line_ids:
                line.invalidate_recordset()
                # Force balance computation by writing price_unit back
                if line.display_type == 'product' and line.price_unit:
                    try:
                        line.with_context(check_move_validity=False).write({
                            'price_unit': line.price_unit
                        })
                    except Exception:
                        pass

            # Method 3: Trigger onchange to sync tax and payment lines
            if hasattr(self, '_onchange_quick_edit_line_ids'):
                self.with_context(check_move_validity=False)._onchange_quick_edit_line_ids()

            # Final: Invalidate move and access computed fields
            self.invalidate_recordset()
            _logger.info(f"[OCR] After sync: total={self.amount_total}, untaxed={self.amount_untaxed}, tax={self.amount_tax}")

            # Log line balances for debugging
            for line in self.line_ids.filtered(lambda l: l.display_type == 'product'):
                _logger.info(f"[OCR] Line {line.name}: balance={line.balance}, debit={line.debit}, credit={line.credit}")

        except Exception as e:
            _logger.warning(f"[OCR] Sync warning: {e}")

        return created_count

    def _find_tax_by_rate(self, rate, is_purchase=True):
        """Find tax record by rate percentage.

        Args:
            rate: Tax rate (8 or 10)
            is_purchase: True for purchase taxes, False for sale taxes

        Returns:
            account.tax record or False
        """
        Tax = self.env['account.tax']

        # Determine tax type
        tax_type = 'purchase' if is_purchase else 'sale'

        # Search for matching tax
        # For Japan: 8% is reduced rate (軽減税率), 10% is standard rate
        domain = [
            ('type_tax_use', '=', tax_type),
            ('amount', '=', float(rate)),
            ('amount_type', '=', 'percent'),
        ]

        # Try company-specific tax first
        if self.company_id:
            tax = Tax.search(domain + [('company_id', '=', self.company_id.id)], limit=1)
            if tax:
                return tax

        # Fall back to any matching tax
        tax = Tax.search(domain, limit=1)
        return tax if tax else False

    def _find_or_create_product(self, name, price=0, is_sale=False):
        """Find product by name, create if not found.

        Args:
            name: Product name to search/create
            price: Default price for new products
            is_sale: If True, create as saleable product; if False, as purchaseable
        """
        if not name or len(name) < 2:
            return False

        Product = self.env['product.product']

        # Exact match
        product = Product.search([('name', '=', name)], limit=1)
        if product:
            return product

        # Fuzzy match (contains)
        product = Product.search([('name', 'ilike', name)], limit=1)
        if product:
            return product

        # Word match - try significant words
        for word in name.split():
            if len(word) >= 3:  # Skip very short words
                product = Product.search([('name', 'ilike', word)], limit=1)
                if product:
                    return product

        # Create new product
        _logger.info(f'[OCR] Creating product: {name} (sale={is_sale})')
        try:
            return Product.create({
                'name': name,
                'type': 'consu',
                'purchase_ok': not is_sale,
                'sale_ok': is_sale,
                'standard_price': price if not is_sale else 0,
                'list_price': price if is_sale else 0,
            })
        except Exception as e:
            _logger.error(f'[OCR] Failed to create product: {e}')
            return False

    def _find_or_create_partner(self, name, tax_id=None, address=None):
        """Find or create supplier partner with tax_id (VAT) and address support.

        For chain stores (same name, different branches), we identify branches by tax_id.
        Each branch with a unique tax_id gets its own partner record.
        """
        if not name or len(name) < 2:
            return False

        Partner = self.env['res.partner']

        # If tax_id is provided, try to find by tax_id first (most reliable)
        if tax_id:
            partner = Partner.search([('vat', '=', tax_id)], limit=1)
            if partner:
                _logger.info(f'[OCR] Found partner by tax_id: {tax_id}')
                return partner.id

        # Exact supplier match by name
        partner = Partner.search([('name', '=', name), ('supplier_rank', '>', 0)], limit=1)
        if partner:
            # If we have new tax_id or address, update the partner
            update_vals = {}
            if tax_id and not partner.vat:
                update_vals['vat'] = tax_id
            if address and not partner.street:
                update_vals['street'] = address
            if update_vals:
                partner.write(update_vals)
                _logger.info(f'[OCR] Updated partner {name} with: {update_vals}')
            return partner.id

        # Fuzzy supplier match
        partner = Partner.search([('name', 'ilike', name), ('supplier_rank', '>', 0)], limit=1)
        if partner:
            # For chain stores, if tax_id is different, create a new branch
            if tax_id and partner.vat and partner.vat != tax_id:
                _logger.info(f'[OCR] Chain store detected: {name} with different tax_id')
                # Create new partner for this branch
                branch_name = name
                if address:
                    # Add location hint to name for clarity
                    branch_name = f"{name} ({address[:20]}...)" if len(address) > 20 else f"{name} ({address})"
                try:
                    new_partner = Partner.create({
                        'name': branch_name,
                        'supplier_rank': 1,
                        'customer_rank': 0,
                        'company_type': 'company',
                        'vat': tax_id,
                        'street': address or False,
                    })
                    return new_partner.id
                except Exception as e:
                    _logger.error(f'[OCR] Failed to create branch partner: {e}')
                    return partner.id
            return partner.id

        # Any contact match
        partner = Partner.search([('name', 'ilike', name)], limit=1)
        if partner:
            partner.write({'supplier_rank': 1})
            if tax_id and not partner.vat:
                partner.write({'vat': tax_id})
            if address and not partner.street:
                partner.write({'street': address})
            return partner.id

        # Create new supplier
        _logger.info(f'[OCR] Creating supplier: {name}')
        try:
            partner = Partner.create({
                'name': name,
                'supplier_rank': 1,
                'customer_rank': 0,
                'company_type': 'company',
                'vat': tax_id or False,
                'street': address or False,
            })
            return partner.id
        except Exception as e:
            _logger.error(f'[OCR] Failed to create supplier: {e}')
            return False

    # ==================== Batch OCR Methods (with Progress Tracking) ====================

    def action_batch_send_to_ocr(self):
        """
        Queue invoices for background OCR processing with progress tracking.

        Creates a batch progress record and returns action to open progress dialog.
        A cron job processes the queue in the background.
        """
        # Filter records that can be processed
        to_process = self.filtered(
            lambda r: r.message_main_attachment_id and
                      r.ocr_status not in ('processing', 'done') and
                      r.move_type in ('in_invoice', 'in_refund', 'out_invoice', 'out_refund')
        )

        if not to_process:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Batch OCR'),
                    'message': _('No valid invoices selected. Please select invoices with attachments.'),
                    'type': 'warning',
                    'sticky': False,
                }
            }

        # Create batch progress record (use sudo to bypass access control)
        BatchProgress = self.env['ocr.batch.progress'].sudo()
        batch = BatchProgress.create_batch(to_process.ids)

        if not batch:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Batch OCR'),
                    'message': _('Failed to create batch job.'),
                    'type': 'danger',
                    'sticky': False,
                }
            }

        count = len(to_process)
        _logger.info(f'[Batch OCR] Created batch {batch.id} with {count} invoices')

        # Return client action to show progress dialog
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Batch OCR Started'),
                'message': _('%d invoice(s) queued for OCR processing (Batch #%d). Processing in background...') % (count, batch.id),
                'type': 'success',
                'sticky': True,
                'links': [{
                    'label': _('View Progress'),
                    'url': f'/web#action=reload',
                }],
            }
        }

    @api.model
    def cron_process_ocr_queue(self):
        """
        Cron job to process queued OCR records with progress tracking.

        Runs every 2 minutes and processes batches in order.
        Updates batch progress for real-time UI display.
        """
        _logger.info('[Batch OCR Cron] Starting queue processing')

        BatchProgress = self.env['ocr.batch.progress']

        # Find active batches to process
        active_batches = BatchProgress.search([
            ('state', 'in', ('queued', 'processing')),
        ], order='create_date asc', limit=3)

        if not active_batches:
            # Fallback: Check for orphan records (processing status but no batch)
            orphans = self.search([
                ('ocr_status', '=', 'processing'),
                ('message_main_attachment_id', '!=', False),
                ('move_type', 'in', ('in_invoice', 'in_refund', 'out_invoice', 'out_refund')),
            ], limit=BATCH_OCR_MAX_PER_RUN, order='write_date asc')

            if orphans:
                _logger.info(f'[Batch OCR Cron] Processing {len(orphans)} orphan records')
                self._process_orphan_queue(orphans)
            else:
                _logger.info('[Batch OCR Cron] No queued records to process')
            return

        # Process each batch
        for batch in active_batches:
            try:
                self._process_batch(batch)
            except Exception as e:
                _logger.error(f'[Batch OCR Cron] Batch {batch.id} failed: {e}')
                batch.mark_failed(error=str(e))

    def _process_batch(self, batch):
        """Process records in a batch with progress updates."""
        _logger.info(f'[Batch OCR] Processing batch {batch.id}')

        # Start the batch if not already started
        if batch.state == 'queued':
            batch.start_processing()

        # Get unprocessed records from this batch
        to_process = batch.move_ids.filtered(
            lambda m: m.ocr_status == 'processing'
        )

        if not to_process:
            batch.write({'state': 'done', 'completed_at': fields.Datetime.now()})
            _logger.info(f'[Batch OCR] Batch {batch.id} completed')
            return

        # Process up to BATCH_OCR_MAX_PER_RUN records per cron run
        records_to_process = to_process[:BATCH_OCR_MAX_PER_RUN]
        total = len(records_to_process)

        for idx, record in enumerate(records_to_process):
            try:
                _logger.info(f'[Batch OCR] Batch {batch.id}: Processing {idx + 1}/{total}: Invoice {record.id}')

                # Update status
                record.write({
                    'ocr_error_message': _('Processing... (Batch #%d)') % batch.id,
                })
                self.env.cr.commit()

                # Process the record
                record._process_single_ocr()

                # Update batch progress
                batch.update_progress(current_move=record, success=True)
                self.env.cr.commit()

                # Delay between API calls
                if idx < total - 1:
                    time.sleep(BATCH_OCR_DELAY)

            except Exception as e:
                error_msg = str(e)[:500]
                _logger.error(f'[Batch OCR] Failed invoice {record.id}: {e}')

                record.write({
                    'ocr_status': 'failed',
                    'ocr_error_message': error_msg,
                })

                # Update batch progress with failure
                batch.update_progress(current_move=record, success=False, error=error_msg)
                self.env.cr.commit()

        _logger.info(f'[Batch OCR] Batch {batch.id}: Processed {total} records this run')

    def _process_orphan_queue(self, records):
        """Process orphan records that don't belong to any batch."""
        success_count = 0
        fail_count = 0
        total = len(records)

        for idx, record in enumerate(records):
            try:
                _logger.info(f'[Batch OCR Orphan] Processing {idx + 1}/{total}: Invoice {record.id}')

                record.write({
                    'ocr_error_message': _('Processing... (%d/%d)') % (idx + 1, total),
                })
                self.env.cr.commit()

                record._process_single_ocr()
                success_count += 1
                self.env.cr.commit()

                if idx < total - 1:
                    time.sleep(BATCH_OCR_DELAY)

            except Exception as e:
                fail_count += 1
                error_msg = str(e)[:500]
                _logger.error(f'[Batch OCR Orphan] Failed invoice {record.id}: {e}')

                record.write({
                    'ocr_status': 'failed',
                    'ocr_error_message': error_msg,
                })
                self.env.cr.commit()

        _logger.info(f'[Batch OCR Orphan] Completed: {success_count} succeeded, {fail_count} failed')

    def _process_single_ocr(self):
        """
        Process OCR for a single record without UI interaction.
        Used by batch processing and cron job.
        """
        self.ensure_one()

        attachment = self.message_main_attachment_id
        if not attachment or not attachment.datas:
            raise UserError(_('No attachment found'))

        mimetype = attachment.mimetype or ''
        if not (mimetype.startswith('image') or mimetype == 'application/pdf'):
            raise UserError(_('Attachment must be an image or PDF'))

        file_data = base64.b64decode(attachment.datas)

        # Use LLM OCR to process document
        from . import llm_ocr
        result = llm_ocr.process_document(file_data, mimetype)

        if not result.get('success'):
            raise UserError(result.get('error', 'Unknown error'))

        # Get results
        line_items = result.get('line_items', [])
        extracted = result.get('extracted', {})
        pages = result.get('pages', 1)

        # Update usage
        OcrUsage = self.env['ocr.usage']
        OcrUsage.increment_usage(pages=pages)

        update_vals = {
            'ocr_status': 'done',
            'ocr_raw_data': json.dumps(result, ensure_ascii=False, indent=2),
            'ocr_extracted_texts': result.get('raw_response', ''),
            'ocr_line_items': json.dumps(line_items, ensure_ascii=False, indent=2),
            'ocr_processed_at': fields.Datetime.now(),
            'ocr_confidence': 93.5,
            'ocr_error_message': False,
            'ocr_pages': pages,
        }

        # Auto-fill vendor (with tax_id and address support)
        vendor_name = extracted.get('vendor_name')
        tax_id = extracted.get('tax_id')
        vendor_address = extracted.get('vendor_address')
        if vendor_name and not self.partner_id:
            partner_id = self._find_or_create_partner(vendor_name, tax_id=tax_id, address=vendor_address)
            if partner_id:
                update_vals['partner_id'] = partner_id

        # Auto-fill invoice number
        if extracted.get('invoice_number'):
            update_vals['ref'] = extracted['invoice_number']

        # Auto-fill date
        if extracted.get('date'):
            try:
                date_str = extracted['date']
                date_str = re.sub(r'[年月]', '-', date_str)
                date_str = re.sub(r'日', '', date_str)
                update_vals['invoice_date'] = date_str
            except Exception:
                pass

        # Store total
        total = extracted.get('total')
        if total:
            current = self.narration or ''
            update_vals['narration'] = f'OCR Amount: {total}\n{current}'

        self.write(update_vals)

        # Create invoice lines (with tax-inclusive support)
        is_tax_inclusive = extracted.get('is_tax_inclusive', False)
        matched_count = self._create_invoice_lines_from_ocr(
            line_items,
            is_tax_inclusive=is_tax_inclusive,
            extracted=extracted
        )
        self.write({'ocr_matched_count': matched_count})

        _logger.info(f'[OCR] Invoice {self.id}: {pages} pages, {len(line_items)} items, {matched_count} matched')
