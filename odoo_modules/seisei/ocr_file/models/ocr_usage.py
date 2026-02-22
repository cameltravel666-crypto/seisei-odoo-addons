# -*- coding: utf-8 -*-

from odoo import models, fields, api
from datetime import datetime, date
import logging
import requests

_logger = logging.getLogger(__name__)


class OcrFileUsage(models.Model):
    """Track OCR file processing usage per company per month"""
    _name = 'ocr.file.usage'
    _description = 'AI File Usage'
    _rec_name = 'month_display'
    _order = 'year desc, month desc'

    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company,
        index=True
    )
    year = fields.Integer(string='Year', required=True, index=True)
    month = fields.Integer(string='Month', required=True, index=True)
    month_display = fields.Char(string='Month', compute='_compute_month_display', store=True)

    # Usage counts
    image_count = fields.Integer(string='Images Processed', default=0)
    free_quota = fields.Integer(string='Free Quota', default=30)
    price_per_image = fields.Float(string='Price per Image (JPY)', default=20.0)

    # Computed fields
    billable_count = fields.Integer(string='Billable Images', compute='_compute_billable', store=True)
    total_charge = fields.Float(string='Total Charge (JPY)', compute='_compute_billable', store=True)
    remaining_free = fields.Integer(string='Remaining Free', compute='_compute_remaining')

    _sql_constraints = [
        ('unique_company_month', 'unique(company_id, year, month)',
         'Usage record already exists for this company and month!')
    ]

    @api.depends('year', 'month')
    def _compute_month_display(self):
        for record in self:
            record.month_display = f"{record.year}-{record.month:02d}"

    @api.depends('image_count', 'free_quota', 'price_per_image')
    def _compute_billable(self):
        for record in self:
            record.billable_count = max(0, record.image_count - record.free_quota)
            record.total_charge = record.billable_count * record.price_per_image

    @api.depends('image_count', 'free_quota')
    def _compute_remaining(self):
        for record in self:
            record.remaining_free = max(0, record.free_quota - record.image_count)

    @api.model
    def get_current_usage(self, company_id=None):
        """Get or create usage record for current month"""
        if not company_id:
            company_id = self.env.company.id

        today = date.today()
        usage = self.search([
            ('company_id', '=', company_id),
            ('year', '=', today.year),
            ('month', '=', today.month),
        ], limit=1)

        if not usage:
            usage = self.create({
                'company_id': company_id,
                'year': today.year,
                'month': today.month,
            })

        return usage

    @api.model
    def increment_usage(self, count=1, company_id=None):
        """Increment image count for current month and sync to Odoo 19"""
        usage = self.get_current_usage(company_id)
        usage.image_count += count

        # Sync to Odoo 19 after updating
        usage._sync_to_odoo19()

        return usage

    def _sync_to_odoo19(self):
        """Push usage data to Odoo 19 vendor.ops.tenant via webhook"""
        self.ensure_one()

        ICP = self.env['ir.config_parameter'].sudo()
        odoo19_url = ICP.get_param('ocr.odoo19_webhook_url', '')
        odoo19_api_key = ICP.get_param('ocr.odoo19_api_key', 'seisei-ocr-webhook-2026')

        if not odoo19_url:
            _logger.debug("Odoo 19 webhook URL not configured, skipping sync")
            return

        # Get tenant code from company (stored in company's ref or a custom field)
        company = self.company_id
        # Try multiple sources for tenant code
        tenant_code = (
            getattr(company, 'tenant_code', None) or
            company.ref or
            getattr(company, 'x_tenant_code', None) or
            ''
        )

        if not tenant_code:
            _logger.warning(f"No tenant code for company {company.name}, skipping Odoo 19 sync")
            return

        # Build JSON-RPC format payload expected by Odoo 19 webhook
        payload = {
            'jsonrpc': '2.0',
            'method': 'call',
            'params': {
                'tenant_code': tenant_code,
                'ocr_pages': self.image_count,  # Send total count, Odoo 19 will replace
                'year_month': f"{self.year}-{self.month:02d}",
                'image_count': self.image_count,
                'free_quota': self.free_quota,
                'billable_count': self.billable_count,
                'total_cost': self.total_charge,
                'api_key': odoo19_api_key,
            },
            'id': None
        }

        try:
            headers = {
                'Content-Type': 'application/json',
                'X-Odoo-Database': 'ERP',
            }

            response = requests.post(
                odoo19_url,
                json=payload,
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                _logger.info(f"Synced OCR usage to Odoo 19: {tenant_code} = {self.image_count} images")
            else:
                _logger.warning(f"Failed to sync to Odoo 19: HTTP {response.status_code} - {response.text[:200]}")

        except requests.RequestException as e:
            _logger.warning(f"Failed to sync OCR usage to Odoo 19: {e}")

    @api.model
    def check_quota(self, count=1, company_id=None):
        """
        Check if processing would exceed free quota.
        Returns: dict with quota info
        """
        usage = self.get_current_usage(company_id)
        current = usage.image_count
        free_quota = usage.free_quota
        price = usage.price_per_image

        will_exceed = (current + count) > free_quota
        billable_new = max(0, (current + count) - free_quota) - max(0, current - free_quota)

        return {
            'current_usage': current,
            'free_quota': free_quota,
            'remaining_free': max(0, free_quota - current),
            'will_exceed': will_exceed,
            'new_billable': billable_new,
            'new_charge': billable_new * price,
            'price_per_image': price,
        }
