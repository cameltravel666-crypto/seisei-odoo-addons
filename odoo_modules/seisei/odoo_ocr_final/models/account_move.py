import csv
import io
import json
import logging
import base64
import os
import re
import time
from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

# Batch OCR configuration
BATCH_OCR_DELAY = 2  # Seconds between each OCR call to avoid rate limiting


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

            # Copy _prompt_version from result to extracted for FAST format detection
            if '_prompt_version' in result:
                extracted['_prompt_version'] = result['_prompt_version']

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

            # Auto-fill date (fallback to today if OCR doesn't extract one)
            if extracted.get('date'):
                try:
                    date_str = extracted['date']
                    date_str = re.sub(r'[年月]', '-', date_str)
                    date_str = re.sub(r'日', '', date_str)
                    update_vals['invoice_date'] = date_str
                except Exception:
                    update_vals['invoice_date'] = fields.Date.context_today(self)
            else:
                update_vals['invoice_date'] = fields.Date.context_today(self)

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

            # Return False to stay on the current form and preserve the list pager
            return False

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

        Supports:
        - in_invoice: Vendor Bills (uses expense account)
        - in_refund: Vendor Credit Notes (uses expense account)
        - out_invoice: Customer Invoices (uses income account)
        - out_refund: Customer Credit Notes (uses income account)

        Args:
            line_items: List of extracted line items
            is_tax_inclusive: Whether prices include tax (内税/税込)
            extracted: Full extracted data dict for tax amounts
        """
        created_count = 0
        extracted = extracted or {}
        enable_discount_lines = self._get_ocr_param_bool('odoo_ocr_final.enable_discount_lines', True)
        default_tax_inclusive = self._get_ocr_param_bool('odoo_ocr_final.default_tax_inclusive', True)

        _logger.info(f'[OCR] _create_invoice_lines_from_ocr called for invoice {self.name}, move_type={self.move_type}')
        _logger.info(f'[OCR] extracted keys: {list(extracted.keys())}')
        _logger.info(f'[OCR] extracted data: {json.dumps(extracted, ensure_ascii=False, indent=2)}')
        _logger.info(f'[OCR] line_items count: {len(line_items)}')

        # Determine if this is a purchase (expense) or sale (income) document
        is_purchase = self.move_type in ('in_invoice', 'in_refund')
        is_sale = self.move_type in ('out_invoice', 'out_refund')

        if not is_purchase and not is_sale:
            _logger.warning(f'[OCR] Skipping line creation for move_type: {self.move_type}')
            return 0

        # Normalize tax-inclusive flag
        is_tax_inclusive = self._infer_tax_inclusive(extracted, default_tax_inclusive, is_tax_inclusive)

        # Check if this is FAST prompt format (summary only, no detailed items)
        prompt_version = extracted.get('_prompt_version', '')
        _logger.info(f'[OCR] prompt_version from extracted: "{prompt_version}"')
        if prompt_version == 'fast':
            _logger.info('[OCR] Detected FAST prompt format, creating Japanese accounting entries')
            return self._create_japanese_accounting_entries(extracted, is_purchase)

        for item in line_items:
            # Support both old format (product_name) and new format (name)
            product_name = item.get('product_name') or item.get('name', '')
            if not product_name:
                continue

            # Parse quantity - support both 'quantity' and 'qty'
            try:
                quantity = float(item.get('quantity') or item.get('qty') or 1)
            except (ValueError, TypeError):
                quantity = 1
            if quantity <= 0:
                quantity = 1

            # Parse price (could be tax-inclusive)
            try:
                unit_price = float(item.get('unit_price', 0) or 0)
            except (ValueError, TypeError):
                unit_price = 0

            # If no unit price but amount exists, calculate it
            # Support both 'amount' and 'gross_amount' (allow negative for discounts)
            amount_value = self._parse_amount(item.get('amount') or item.get('gross_amount') or item.get('net_amount') or 0)
            if unit_price == 0 and quantity > 0 and amount_value != 0:
                unit_price = amount_value / quantity

            # Get tax rate for this item (default to 8% - food items in Japan)
            # Handle multiple formats: decimal (0.08), integer (8), string ("8%")
            tax_rate = item.get('tax_rate')
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

            # Resolve tax record (prefer matching price_include)
            tax = self._find_tax_by_rate(tax_rate, is_purchase, price_include=is_tax_inclusive)

            # If tax-inclusive, convert to tax-exclusive price when tax is not price-included
            # Formula: price_excl = price_incl / (1 + tax_rate/100)
            price_excl = unit_price
            if is_tax_inclusive and unit_price > 0:
                price_excl = round(unit_price / (1 + tax_rate / 100), 2)
                _logger.info(f'[OCR] Tax-inclusive conversion: {unit_price} -> {price_excl} (excl. {tax_rate}% tax)')

            # Determine if this is a discount line
            is_discount = self._is_discount_line(product_name, amount_value)
            if is_discount and not enable_discount_lines:
                _logger.info(f'[OCR] Discount line skipped by config: {product_name}')
                continue

            # Resolve tax record (prefer matching price_include)
            tax = self._find_tax_by_rate(tax_rate, is_purchase, price_include=is_tax_inclusive)

            # Decide price unit based on tax configuration
            price_unit = unit_price
            if is_tax_inclusive and (not tax or not tax.price_include):
                price_unit = price_excl
            if tax and tax.price_include:
                price_unit = unit_price

            # Discount lines: create a direct line without product
            if is_discount:
                account = self._get_default_ocr_account(is_purchase, extracted)
                line_vals = {
                    'move_id': self.id,
                    'name': product_name,
                    'quantity': 1,
                    'price_unit': price_unit,
                }
                if account:
                    line_vals['account_id'] = account.id
                if tax:
                    line_vals['tax_ids'] = [(6, 0, [tax.id])]
                self.env['account.move.line'].create(line_vals)
                _logger.info(f'[OCR] Created discount line: {product_name} (price: {price_unit}, tax: {tax_rate}%)')
                created_count += 1
                continue

            # Find or create product
            product = self._find_or_create_product(product_name, price_excl, is_sale=is_sale)
            if not product:
                _logger.warning(f'[OCR] Could not find/create product: {product_name}')
                continue

            # Check for existing line with same product
            existing = self.invoice_line_ids.filtered(lambda l: l.product_id.id == product.id)

            if existing:
                # Update existing line quantity
                existing[0].write({'quantity': existing[0].quantity + quantity})
                _logger.info(f'[OCR] Updated line: {product_name} (qty: +{quantity})')
            else:
                # Try OCR suggested_account first (from Gemini)
                account = None
                suggested = item.get('suggested_account')
                if suggested:
                    account = self._search_account_by_name(suggested)
                    if account:
                        _logger.info(f'[OCR] Using suggested_account "{suggested}" -> {account.code} {account.name}')

                # Keyword-based inference when suggested_account is missing
                if not account:
                    vendor_name = extracted.get('vendor_name', '') if extracted else ''
                    raw_text = self.ocr_extracted_texts or ''
                    account = self._infer_account_from_keywords([
                        product_name, vendor_name, raw_text,
                    ])

                # Fallback to product default account
                if is_purchase:
                    if not account:
                        account = product.property_account_expense_id or \
                                  product.categ_id.property_account_expense_categ_id
                    if not account:
                        default_categ = self.env.ref('product.product_category_all', raise_if_not_found=False)
                        account = default_categ and default_categ.property_account_expense_categ_id
                    price = price_unit or product.standard_price
                else:
                    if not account:
                        account = product.property_account_income_id or \
                                  product.categ_id.property_account_income_categ_id
                    if not account:
                        default_categ = self.env.ref('product.product_category_all', raise_if_not_found=False)
                        account = default_categ and default_categ.property_account_income_categ_id
                    price = price_unit or product.list_price

                line_vals = {
                    'move_id': self.id,
                    'product_id': product.id,
                    'name': product.name,
                    'quantity': quantity,
                    'price_unit': price,
                    'product_uom_id': product.uom_id.id,
                }

                if account:
                    line_vals['account_id'] = account.id

                # Find and set appropriate tax based on tax_rate
                tax = self._find_tax_by_rate(tax_rate, is_purchase, price_include=is_tax_inclusive)
                if tax:
                    line_vals['tax_ids'] = [(6, 0, [tax.id])]

                self.env['account.move.line'].create(line_vals)
                _logger.info(f'[OCR] Created line: {product_name} (qty: {quantity}, price: {price}, tax: {tax_rate}%)')

            created_count += 1

        # Validate tax amounts and reconcile if needed
        if extracted:
            self._validate_and_reconcile_tax(extracted)

        return created_count

    def _find_tax_by_rate(self, rate, is_purchase=True, price_include=None):
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
        if price_include is True:
            domain.append(('price_include', '=', True))
        elif price_include is False:
            domain.append(('price_include', '=', False))

        # Search for tax matching the current company
        if self.company_id:
            domain.append(('company_id', '=', self.company_id.id))

        tax = Tax.search(domain, limit=1)
        if tax:
            return tax

        # Fall back: relax price_include constraint but keep company filter
        if price_include is not None and self.company_id:
            fallback_domain = [
                ('type_tax_use', '=', tax_type),
                ('amount', '=', float(rate)),
                ('amount_type', '=', 'percent'),
                ('company_id', '=', self.company_id.id),
            ]
            tax = Tax.search(fallback_domain, limit=1)
        return tax if tax else False

    def _validate_and_reconcile_tax(self, extracted):
        try:
            ocr_tax = self._parse_amount(self._pick_extracted_amount(extracted, ['tax', 'tax_amount', 'r8_tax', 'r10_tax']))
            ocr_total = self._parse_amount(self._pick_extracted_amount(extracted, ['total', 'gross_amount']))
            if ocr_tax <= 0 or ocr_total <= 0:
                _logger.info('[OCR] No OCR tax/total for validation')
                return
            self.invalidate_recordset()
            calculated_tax = abs(self.amount_tax)
            calculated_total = abs(self.amount_total)
            _logger.info(f'[OCR] Tax: OCR={ocr_tax}, calc={calculated_tax}')
            _logger.info(f'[OCR] Total: OCR={ocr_total}, calc={calculated_total}')
            tax_diff = abs(calculated_tax - ocr_tax)
            total_diff = abs(calculated_total - ocr_total)
            if tax_diff <= 1 and total_diff > 1:
                _logger.info(f'[OCR] Tax OK but total diff={total_diff}, adjusting')
                self._adjust_line_for_total_diff(ocr_total, calculated_total)
            elif tax_diff > 1:
                _logger.warning(f'[OCR] Tax mismatch: OCR={ocr_tax}, calc={calculated_tax}')
        except Exception as e:
            _logger.warning(f'[OCR] Tax validation error: {e}')

    def _adjust_line_for_total_diff(self, ocr_total, calculated_total):
        try:
            lines = self.invoice_line_ids.filtered(lambda l: l.price_unit > 0 and not l.display_type)
            if not lines:
                return
            adjust_line = lines[-1]
            total_diff = ocr_total - calculated_total
            tax_rate = 8
            if adjust_line.tax_ids:
                tax_rate = adjust_line.tax_ids[0].amount or 8
            price_diff = total_diff / (adjust_line.quantity * (1 + tax_rate / 100))
            new_price = adjust_line.price_unit + price_diff
            if new_price > 0:
                adjust_line.write({'price_unit': round(new_price, 2)})
                _logger.info(f'[OCR] Adjusted {adjust_line.name}: -> {round(new_price, 2)}')
        except Exception as e:
            _logger.warning(f'[OCR] Line adjustment error: {e}')

    def _get_ocr_param_bool(self, key, default=False):
        ICP = self.env['ir.config_parameter'].sudo()
        raw = ICP.get_param(key, 'True' if default else 'False')
        return str(raw).strip().lower() in ('1', 'true', 'yes', 'y', 'on')

    def _infer_tax_inclusive(self, extracted, default_tax_inclusive, explicit_flag):
        if isinstance(explicit_flag, bool) and explicit_flag:
            return True
        extracted_flag = extracted.get('is_tax_inclusive')
        if isinstance(extracted_flag, bool):
            return extracted_flag
        tax_type = (extracted.get('tax_included_type') or '').strip().lower()
        if tax_type in ('inclusive', 'tax_inclusive', '内税', '税込', 'tax_included'):
            return True
        return bool(default_tax_inclusive)

    def _is_discount_line(self, name, amount):
        if amount is not None and self._parse_amount(amount) < 0:
            return True
        name_l = (name or '').lower()
        keywords = ['割引', '値引', '値引き', '割り引', 'discount', 'off', 'rebate']
        return any(k in name_l for k in keywords)

    def _get_default_ocr_account(self, is_purchase, extracted):
        Account = self.env['account.account']
        company = self.company_id or self.env.company
        suggested = extracted.get('suggested_account') if extracted else None
        if suggested:
            account = Account.search([
                ('name', 'ilike', suggested),
                ('company_ids', 'in', [company.id]),
            ], limit=1)
            if account:
                return account
        return self._get_default_expense_account() if is_purchase else self._get_default_income_account()

    def _parse_amount(self, value):
        if value is None:
            return 0
        if isinstance(value, (int, float)):
            return float(value)
        try:
            return float(str(value).replace(',', '').replace('¥', '').replace('円', '').strip())
        except:
            return 0

    def _pick_extracted_amount(self, extracted, keys):
        for key in keys:
            value = extracted.get(key)
            if value is None:
                continue
            return value
        return 0

    def _get_ocr_param_bool(self, key, default=False):
        ICP = self.env['ir.config_parameter'].sudo()
        raw = ICP.get_param(key, 'True' if default else 'False')
        return str(raw).strip().lower() in ('1', 'true', 'yes', 'y', 'on')

    def _infer_tax_inclusive(self, extracted, default_tax_inclusive, explicit_flag):
        # Explicit boolean from caller or extracted
        if isinstance(explicit_flag, bool):
            if explicit_flag:
                return True
        extracted_flag = extracted.get('is_tax_inclusive')
        if isinstance(extracted_flag, bool):
            return extracted_flag

        tax_type = extracted.get('tax_included_type')
        if isinstance(tax_type, str):
            normalized = tax_type.strip().lower()
            if any(k in normalized for k in ['inclusive', 'included', '内税', '税込']):
                return True
            if any(k in normalized for k in ['exclusive', 'excluded', '外税', '税抜']):
                return False

        # Heuristic: presence of r8_gross/r10_gross implies tax-inclusive receipt
        if extracted.get('r8_gross') or extracted.get('r10_gross'):
            return True

        return bool(default_tax_inclusive)

    def _is_discount_line(self, name, amount):
        if amount is not None and amount < 0:
            return True
        if not name:
            return False
        keywords = ['割引', '値引', '値引き', 'まとめ値引', '自動割引', '割戻', 'discount', 'off']
        return any(k in name for k in keywords)

    def _get_default_ocr_account(self, is_purchase, extracted):
        """Resolve default account for OCR lines (supports suggested_account)."""
        suggested = extracted.get('suggested_account') if extracted else None
        if suggested:
            account = self._search_account_by_name(suggested)
            if account:
                return account

        # Fallback to company default accounts (Odoo 18: ir.property removed)
        return self._get_default_expense_account() if is_purchase else self._get_default_income_account()

    def _search_account_by_name(self, name):
        """Search account by name across multiple languages (ja_JP, zh_CN, en_US).

        OCR returns Japanese account names (e.g. 旅費交通費) but user's Odoo
        may be in Chinese or English. Odoo 18 stores names as jsonb and ORM
        searches only in current user language by default.
        """
        Account = self.env['account.account']
        company = self.company_id or self.env.company
        company_domain = [('company_ids', 'in', [company.id])]
        # 1. Try current user language
        account = Account.search([('name', '=', name)] + company_domain, limit=1)
        if account:
            return account
        # 2. Try Japanese (OCR returns Japanese names)
        account = Account.with_context(lang='ja_JP').search([('name', '=', name)] + company_domain, limit=1)
        if account:
            return account
        # 3. Fuzzy match in current language
        account = Account.search([('name', 'ilike', name)] + company_domain, limit=1)
        if account:
            return account
        # 4. Fuzzy match in Japanese
        account = Account.with_context(lang='ja_JP').search([('name', 'ilike', name)] + company_domain, limit=1)
        return account or False

    def _infer_account_from_keywords(self, text_sources):
        """Infer account from keywords when OCR suggested_account is missing.

        Args:
            text_sources: list of strings to scan for keywords (vendor name, product name, raw text, etc.)

        Returns:
            account.account record or False
        """
        KEYWORD_ACCOUNT_MAP = [
            ('旅費交通費', ['駐車', 'パーキング', 'コインパーキング', 'タクシー', '電車', 'JR', 'バス',
                        '新幹線', '飛行機', '高速', 'ETC', 'ガソリン', '軽油', '宿泊', 'ホテル',
                        '旅館', 'Suica', 'PASMO', 'IC', '交通', '出張', '乗車', '運賃',
                        'タイムズ', 'タイムスペース', 'リパーク', 'NPC', '三井リパーク']),
            ('会議費', ['会議', '打合せ', 'ミーティング']),
            ('交際費', ['接待', '贈答', 'お土産', '懇親']),
            ('通信費', ['通信', '携帯', '電話', 'インターネット', '切手', 'はがき', '郵便']),
            ('荷造運賃', ['宅急便', '宅配', 'ゆうパック', '送料', '配送', 'ヤマト', '佐川']),
            ('消耗品費', ['文房具', '事務用品', 'コピー', 'USB']),
            ('福利厚生費', ['健康診断', '薬局', 'ドラッグストア']),
            ('水道光熱費', ['電気', 'ガス代', '水道']),
        ]
        combined = ' '.join(str(s) for s in text_sources if s)
        if not combined:
            return False

        for account_name, keywords in KEYWORD_ACCOUNT_MAP:
            if any(kw in combined for kw in keywords):
                account = self._search_account_by_name(account_name)
                if account:
                    _logger.info(f'[OCR] Keyword inference: "{account_name}" matched -> {account.code} {account.name}')
                    return account
        return False

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

    # ==================== Batch OCR Methods ====================

    def action_batch_send_to_ocr(self):
        """
        Batch OCR processing for multiple selected invoices.
        Queues records for processing and starts the batch job.
        """
        # Filter records that can be processed
        to_process = self.filtered(
            lambda r: r.message_main_attachment_id and
                      r.ocr_status != 'processing' and
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

        # Mark all as queued for processing
        to_process.write({
            'ocr_status': 'processing',
            'ocr_error_message': _('Queued for batch processing...'),
        })

        # Commit to save the status before processing
        self.env.cr.commit()

        # Process each record with delay
        success_count = 0
        fail_count = 0
        total = len(to_process)

        for idx, record in enumerate(to_process):
            try:
                _logger.info(f'[Batch OCR] Processing {idx + 1}/{total}: Invoice {record.id}')
                record._process_single_ocr()
                success_count += 1

                # Commit after each successful processing
                self.env.cr.commit()

                # Delay between API calls to avoid rate limiting
                if idx < total - 1:
                    time.sleep(BATCH_OCR_DELAY)

            except Exception as e:
                fail_count += 1
                _logger.error(f'[Batch OCR] Failed invoice {record.id}: {e}')
                record.write({
                    'ocr_status': 'failed',
                    'ocr_error_message': str(e)[:500],
                })
                self.env.cr.commit()

        # Return notification with results
        message = _('Batch OCR completed: %d succeeded, %d failed out of %d total.') % (
            success_count, fail_count, total
        )

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Batch OCR Complete'),
                'message': message,
                'type': 'success' if fail_count == 0 else 'warning',
                'sticky': True,
                'next': {'type': 'ir.actions.client', 'tag': 'reload'},
            }
        }

    def _process_single_ocr(self):
        """
        Process OCR for a single record without UI interaction.
        Used by batch processing.
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

        # Auto-fill date (fallback to today if OCR doesn't extract one)
        if extracted.get('date'):
            try:
                date_str = extracted['date']
                date_str = re.sub(r'[年月]', '-', date_str)
                date_str = re.sub(r'日', '', date_str)
                update_vals['invoice_date'] = date_str
            except Exception:
                update_vals['invoice_date'] = fields.Date.context_today(self)
        else:
            update_vals['invoice_date'] = fields.Date.context_today(self)

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

    @api.model
    def cron_process_ocr_queue(self):
        """Cron job to process queued OCR records."""
        _logger.info('[OCR Cron] Processing queued OCR records')

        to_process = self.search([
            ('ocr_status', '=', 'processing'),
            ('message_main_attachment_id', '!=', False),
            ('move_type', 'in', ('in_invoice', 'in_refund', 'out_invoice', 'out_refund')),
        ], limit=10, order='write_date asc')

        if not to_process:
            _logger.info('[OCR Cron] No queued records to process')
            return

        for idx, record in enumerate(to_process):
            try:
                _logger.info(f'[OCR Cron] Processing {idx + 1}/{len(to_process)}: Invoice {record.id}')
                record._process_single_ocr()
                self.env.cr.commit()
                if idx < len(to_process) - 1:
                    time.sleep(BATCH_OCR_DELAY)
            except Exception as e:
                _logger.error(f'[OCR Cron] Failed invoice {record.id}: {e}')
                record.write({
                    'ocr_status': 'failed',
                    'ocr_error_message': str(e)[:500],
                })
                self.env.cr.commit()

    def _create_japanese_accounting_entries(self, extracted, is_purchase=True):
        """Create accounting entries according to Japanese GAAP for FAST prompt receipts.

        For tax-exclusive (外税) receipts from OCR FAST prompt:
        - Creates expense/income line for net amount
        - Creates separate tax lines for 8% and 10% consumption tax

        Args:
            extracted: OCR extracted data with subtotal, tax_8_net, tax_8_amount, etc.
            is_purchase: True for vendor bills (仕入), False for sales (売上)

        Returns:
            Number of lines created
        """
        self.ensure_one()

        _logger.info(f'[OCR] _create_japanese_accounting_entries called for invoice {self.name}')
        _logger.info(f'[OCR] extracted data: {json.dumps(extracted, ensure_ascii=False, indent=2)}')

        # Get amounts from extracted data
        subtotal = self._parse_amount(extracted.get('subtotal', 0))
        tax_8_net = self._parse_amount(extracted.get('tax_8_net', 0))
        tax_8_amount = self._parse_amount(extracted.get('tax_8_amount', 0))
        tax_10_net = self._parse_amount(extracted.get('tax_10_net', 0))
        tax_10_amount = self._parse_amount(extracted.get('tax_10_amount', 0))
        total = self._parse_amount(extracted.get('total', 0))

        _logger.info(f'[OCR] Japanese entries: subtotal={subtotal}, tax_8={tax_8_amount}, tax_10={tax_10_amount}, total={total}')

        if subtotal <= 0:
            _logger.warning('[OCR] No subtotal found, cannot create accounting entries')
            return 0

        created_count = 0

        # Get appropriate accounts based on document type
        if is_purchase:
            # Vendor bill - expense account (仕入高/経費)
            expense_account = self._get_default_expense_account()
            tax_account_8 = self._get_tax_account('purchase', 8)
            tax_account_10 = self._get_tax_account('purchase', 10)
            account_label = '仕入高/経費'
        else:
            # Customer invoice - income account (売上高)
            expense_account = self._get_default_income_account()
            tax_account_8 = self._get_tax_account('sale', 8)
            tax_account_10 = self._get_tax_account('sale', 10)
            account_label = '売上高'

        if not expense_account:
            raise UserError(f'No default {account_label} account found. Please configure chart of accounts.')

        # Determine if we can create separate tax lines
        has_tax_accounts = bool(tax_account_8 or tax_account_10)

        if has_tax_accounts:
            # Create main expense/income line (税抜金額) - tax-exclusive
            expense_amount = subtotal
            _logger.info(f'[OCR] Tax accounts found, creating tax-exclusive entries')
        else:
            # No tax accounts - include tax in expense line (税込金額) - tax-inclusive
            expense_amount = total
            _logger.warning(f'[OCR] No tax accounts found, creating tax-inclusive entry with total={total}')

        line_vals = {
            'move_id': self.id,
            'name': f'{account_label} (OCR: {extracted.get("vendor_name", "不明")})',
            'account_id': expense_account.id,
            'quantity': 1,
            'price_unit': expense_amount,
            'tax_ids': [(5, 0, 0)],  # Clear taxes (manual tax lines)
        }

        self.env['account.move.line'].with_context(check_move_validity=False).create(line_vals)
        created_count += 1
        _logger.info(f'[OCR] Created {account_label} line: ¥{expense_amount}')

        # Create 8% tax line if amount > 0 AND tax account exists
        if tax_8_amount > 0 and tax_account_8:
            tax_line_vals = {
                'move_id': self.id,
                'name': '仮払消費税 8%' if is_purchase else '仮受消費税 8%',
                'account_id': tax_account_8.id,
                'quantity': 1,
                'price_unit': tax_8_amount,
                'tax_ids': [(5, 0, 0)],
            }
            self.env['account.move.line'].with_context(check_move_validity=False).create(tax_line_vals)
            created_count += 1
            _logger.info(f'[OCR] Created 8% tax line: ¥{tax_8_amount} (on net: ¥{tax_8_net})')

        # Create 10% tax line if amount > 0
        if tax_10_amount > 0 and tax_account_10:
            tax_line_vals = {
                'move_id': self.id,
                'name': '仮払消費税 10%' if is_purchase else '仮受消費税 10%',
                'account_id': tax_account_10.id,
                'quantity': 1,
                'price_unit': tax_10_amount,
                'tax_ids': [(5, 0, 0)],
            }
            self.env['account.move.line'].with_context(check_move_validity=False).create(tax_line_vals)
            created_count += 1
            _logger.info(f'[OCR] Created 10% tax line: ¥{tax_10_amount} (on net: ¥{tax_10_net})')

        # Validate total
        calculated_total = subtotal + tax_8_amount + tax_10_amount
        if abs(calculated_total - total) > 2:
            _logger.warning(f'[OCR] Total mismatch: calculated={calculated_total}, OCR={total}, diff={abs(calculated_total-total)}')

        _logger.info(f'[OCR] Created {created_count} Japanese accounting entries (subtotal={subtotal}, tax={tax_8_amount+tax_10_amount}, total={total})')
        return created_count

    def _get_default_expense_account(self):
        """Get default expense account (仕入高/経費) for purchases."""
        company = self.company_id or self.env.company
        # Try to get from default product category (Odoo 18: ir.property removed)
        default_categ = self.env.ref('product.product_category_all', raise_if_not_found=False)
        account = default_categ and default_categ.property_account_expense_categ_id
        if account:
            return account

        # Fallback: search for expense account by code/name
        Account = self.env['account.account']
        # Try Japanese: 仕入高
        account = Account.search([
            ('code', '=like', '510%'),  # Common code for 仕入高
            ('company_ids', 'in', [company.id]),
        ], limit=1)
        if account:
            return account

        # Try more generic expense account
        account = Account.search([
            ('account_type', '=', 'expense'),
            ('company_ids', 'in', [company.id]),
        ], limit=1)
        return account

    def _get_default_income_account(self):
        """Get default income account (売上高) for sales."""
        company = self.company_id or self.env.company
        # Try to get from default product category (Odoo 18: ir.property removed)
        default_categ = self.env.ref('product.product_category_all', raise_if_not_found=False)
        account = default_categ and default_categ.property_account_income_categ_id
        if account:
            return account

        # Fallback: search for income account by code/name
        Account = self.env['account.account']
        # Try Japanese: 売上高
        account = Account.search([
            ('code', '=like', '410%'),  # Common code for 売上高
            ('company_ids', 'in', [company.id]),
        ], limit=1)
        if account:
            return account

        # Try more generic income account
        account = Account.search([
            ('account_type', '=', 'income'),
            ('company_ids', 'in', [company.id]),
        ], limit=1)
        return account

    def _get_tax_account(self, tax_type, rate):
        """Get consumption tax account (仮払消費税/仮受消費税).

        Args:
            tax_type: 'purchase' or 'sale'
            rate: 8 or 10

        Returns:
            account.account record or False
        """
        _logger.info(f'[OCR] _get_tax_account called: tax_type={tax_type}, rate={rate}')
        Account = self.env['account.account']
        company = self.company_id or self.env.company
        company_domain = [('company_ids', 'in', [company.id])]

        # For purchase: 仮払消費税 (prepaid consumption tax)
        # For sale: 仮受消費税 (consumption tax payable)
        if tax_type == 'purchase':
            # Search for tax receivable account
            # Common codes: 145x for 仮払消費税
            account = Account.search([
                ('code', '=like', '145%'),
            ] + company_domain, limit=1)
            _logger.info(f'[OCR] Search 145% result: {account.code if account else "Not found"} - {account.name if account else "N/A"}')
            if account:
                return account

            # Fallback to current asset type
            account = Account.search([
                ('account_type', '=', 'asset_current'),
                ('name', 'ilike', '消費税'),
            ] + company_domain, limit=1)
            _logger.info(f'[OCR] Fallback asset_current search result: {account.code if account else "Not found"} - {account.name if account else "N/A"}')
        else:
            # Search for tax payable account
            # Common codes: 255x for 仮受消費税
            account = Account.search([
                ('code', '=like', '255%'),
            ] + company_domain, limit=1)
            _logger.info(f'[OCR] Search 255% result: {account.code if account else "Not found"} - {account.name if account else "N/A"}')
            if account:
                return account

            # Fallback to current liability type
            account = Account.search([
                ('account_type', '=', 'liability_current'),
                ('name', 'ilike', '消費税'),
            ] + company_domain, limit=1)
            _logger.info(f'[OCR] Fallback liability_current search result: {account.code if account else "Not found"} - {account.name if account else "N/A"}')

        final_result = account if account else False
        _logger.info(f'[OCR] _get_tax_account returning: {final_result}')
        return final_result

    # ==================== Yayoi CSV Export ====================

    def _format_yayoi_date(self, date_val):
        """Format date as YYYY/M/D (no zero-padding) for Yayoi."""
        if not date_val:
            return ''
        return f'{date_val.year}/{date_val.month}/{date_val.day}'

    def _get_dominant_tax_rate(self):
        """Return the tax rate with the highest total amount across invoice lines."""
        self.ensure_one()
        rate_totals = {}
        for line in self.invoice_line_ids.filtered(lambda l: not l.display_type):
            for tax in line.tax_ids:
                if tax.amount_type != 'percent':
                    continue
                rate = int(round(tax.amount))
                rate_totals[rate] = rate_totals.get(rate, 0) + abs(line.price_subtotal)
        if not rate_totals:
            return 0
        return max(rate_totals, key=rate_totals.get)

    def _get_yayoi_tax_category(self, side, rate):
        """Return Yayoi tax category string.

        Args:
            side: 'debit' or 'credit'
            rate: tax rate (8, 10, 0)

        For vendor bills:  debit=expense(課対仕入), credit=payable(対象外)
        For customer invoices: debit=receivable(対象外), credit=income(課税売上)
        """
        if rate <= 0:
            return '対象外'
        reduced = '（軽）' if rate == 8 else ''
        is_purchase = self.move_type in ('in_invoice', 'in_refund')
        if is_purchase:
            return f'課対仕入内{rate}%{reduced}' if side == 'debit' else '対象外'
        else:
            return '対象外' if side == 'debit' else f'課税売上内{rate}%{reduced}'

    def _get_account_name_ja(self, account):
        """Get Japanese name for an account."""
        if not account:
            return ''
        ja_account = account.with_context(lang='ja_JP')
        return ja_account.name or account.name or ''

    def _get_yayoi_accounts(self):
        """Determine debit/credit account names by move_type.

        Returns:
            tuple: (debit_account_name, debit_sub, credit_account_name, credit_sub)
        """
        self.ensure_one()
        partner_name = self.partner_id.name if self.partner_id else ''

        # Find receivable/payable accounts from line_ids
        receivable_line = self.line_ids.filtered(
            lambda l: l.account_id.account_type == 'asset_receivable'
        )
        payable_line = self.line_ids.filtered(
            lambda l: l.account_id.account_type == 'liability_payable'
        )

        # Find primary expense/income account (highest total from invoice_line_ids)
        primary_account = False
        max_amount = 0
        for line in self.invoice_line_ids.filtered(lambda l: not l.display_type):
            if abs(line.price_subtotal) > max_amount:
                max_amount = abs(line.price_subtotal)
                primary_account = line.account_id

        is_purchase = self.move_type in ('in_invoice', 'in_refund')
        if is_purchase:
            # Debit: expense account, Credit: payable (買掛金)
            debit_name = self._get_account_name_ja(primary_account) if primary_account else '仕入高'
            credit_account = payable_line[0].account_id if payable_line else False
            credit_name = self._get_account_name_ja(credit_account) if credit_account else '買掛金'
            return (debit_name, '', credit_name, partner_name)
        else:
            # Debit: receivable (売掛金), Credit: income account
            debit_account = receivable_line[0].account_id if receivable_line else False
            debit_name = self._get_account_name_ja(debit_account) if debit_account else '売掛金'
            credit_name = self._get_account_name_ja(primary_account) if primary_account else '売上高'
            return (debit_name, partner_name, credit_name, '')

    def _build_yayoi_description(self):
        """Build description column: MM/DD--{ref or partner_name}."""
        self.ensure_one()
        date_part = ''
        if self.invoice_date:
            date_part = f'{self.invoice_date.month:02d}/{self.invoice_date.day:02d}'
        detail = self.ref or (self.partner_id.name if self.partner_id else self.name or '')
        if date_part and detail:
            return f'{date_part}--{detail}'
        return date_part or detail or ''

    def _get_yayoi_slip_number(self):
        """Get attachment filename (without extension) as slip number."""
        self.ensure_one()
        if self.message_main_attachment_id and self.message_main_attachment_id.name:
            name = self.message_main_attachment_id.name
            return os.path.splitext(name)[0]
        return self.name or ''

    @staticmethod
    def _truncate_yayoi(text, max_halfwidth):
        """Truncate text to fit within max_halfwidth half-width character count.

        CJK / full-width characters count as 2 half-width units.
        """
        if not text:
            return ''
        text = text.replace('\n', '').replace('\r', '')
        width = 0
        result = []
        for ch in text:
            # CJK Unified Ideographs, CJK punctuation, full-width forms, katakana, hiragana
            cp = ord(ch)
            cw = 2 if (
                (0x3000 <= cp <= 0x9FFF)
                or (0xF900 <= cp <= 0xFAFF)
                or (0xFF01 <= cp <= 0xFF60)
                or (0xFFE0 <= cp <= 0xFFE6)
                or (0x20000 <= cp <= 0x2FA1F)
            ) else 1
            if width + cw > max_halfwidth:
                break
            width += cw
            result.append(ch)
        return ''.join(result)

    def _build_yayoi_row(self):
        """Assemble 25-column Yayoi CSV row."""
        self.ensure_one()
        rate = self._get_dominant_tax_rate()
        debit_acct, debit_sub, credit_acct, credit_sub = self._get_yayoi_accounts()
        # Yayoi uses positive amounts for both invoices and refunds;
        # the journal entry structure (debit/credit accounts) distinguishes them.
        amount_total = int(abs(self.amount_total))
        amount_tax = int(abs(self.amount_tax))
        description = self._build_yayoi_description()
        slip_number = self._get_yayoi_slip_number()

        is_purchase = self.move_type in ('in_invoice', 'in_refund')

        debit_tax_cat = self._get_yayoi_tax_category('debit', rate)
        credit_tax_cat = self._get_yayoi_tax_category('credit', rate)

        if is_purchase:
            debit_amount = amount_total
            debit_tax = amount_tax
            credit_amount = amount_total
            credit_tax = 0
        else:
            debit_amount = amount_total
            debit_tax = 0
            credit_amount = amount_total
            credit_tax = amount_tax

        t = self._truncate_yayoi
        return [
            2000,               # Col1: fixed
            slip_number,        # Col2: attachment filename (伝票番号)
            '',                 # Col3: empty
            self._format_yayoi_date(self.invoice_date),  # Col4: date
            t(debit_acct, 24),  # Col5: debit account (max 24)
            t(debit_sub, 24),   # Col6: debit sub-account (max 24)
            '',                 # Col7: empty
            debit_tax_cat,      # Col8: debit tax category
            debit_amount,       # Col9: debit amount
            debit_tax,          # Col10: debit tax
            t(credit_acct, 24), # Col11: credit account (max 24)
            t(credit_sub, 24),  # Col12: credit sub-account (max 24)
            '',                 # Col13: empty
            credit_tax_cat,     # Col14: credit tax category
            credit_amount,      # Col15: credit amount
            credit_tax,         # Col16: credit tax
            t(description, 64), # Col17: description (max 64)
            '',                 # Col18: empty
            '',                 # Col19: empty
            0,                  # Col20: 0
            '',                 # Col21: empty
            '',                 # Col22: empty
            0,                  # Col23: 0
            0,                  # Col24: 0
            'no',               # Col25: no
        ]

    def action_export_yayoi_csv(self):
        """Export selected invoices/bills to Yayoi Accounting CSV format.

        Called from list view Action menu. Filters to posted records only,
        builds CSV with UTF-8 BOM, no header, 25 columns per row.
        """
        valid_types = ('in_invoice', 'in_refund', 'out_invoice', 'out_refund')
        to_export = self.filtered(
            lambda r: r.state == 'posted'
            and r.move_type in valid_types
            and r.invoice_date
        )

        if not to_export:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('弥生CSV出力'),
                    'message': _('出力対象の記帳済み伝票がありません。記帳済みで日付のある伝票を選択してください。'),
                    'type': 'warning',
                    'sticky': False,
                }
            }

        skipped = len(self) - len(to_export)
        if skipped:
            _logger.info(f'[Yayoi] Skipped {skipped} records (draft/no date)')

        to_export = to_export.sorted(key=lambda r: (r.invoice_date, r.id))

        # Build CSV (UTF-8 BOM, no header)
        output = io.BytesIO()
        output.write(b'\xef\xbb\xbf')  # UTF-8 BOM
        wrapper = io.TextIOWrapper(output, encoding='utf-8', newline='')
        writer = csv.writer(wrapper)

        for record in to_export:
            try:
                row = record._build_yayoi_row()
                writer.writerow(row)
            except Exception as e:
                _logger.warning(f'[Yayoi] Failed to export record {record.id}: {e}')

        wrapper.flush()
        wrapper.detach()

        filename = f'yayoi_export_{fields.Date.today().strftime("%Y%m%d")}.csv'
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(output.getvalue()),
            'res_model': 'account.move',
            'res_id': to_export[0].id,
            'mimetype': 'text/csv',
        })

        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'self',
        }
