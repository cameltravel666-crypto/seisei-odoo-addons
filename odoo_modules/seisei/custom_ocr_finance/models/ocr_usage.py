"""
OCR Usage Tracking Model
Tracks per-user monthly usage and billing
Also notifies BizNexus for centralized billing
"""
import logging
import requests
from datetime import datetime
from odoo import models, fields, api

_logger = logging.getLogger(__name__)

# Pricing constants
FREE_QUOTA = 30          # Free images per user per month (aligned with BizNexus)
PRICE_PER_IMAGE = 20     # JPY per image after free quota

# BizNexus webhook configuration
BIZNEXUS_WEBHOOK_URL = "https://biznexus.seisei.tokyo/api/ocr/webhook"
BIZNEXUS_WEBHOOK_KEY = "seisei-ocr-webhook-2026"


class OcrUsage(models.Model):
    _name = 'ocr.usage'
    _description = 'OCR Usage Tracking'
    _order = 'month desc, user_id'

    user_id = fields.Many2one('res.users', string='User', required=True, index=True)
    month = fields.Char(string='Month (YYYY-MM)', required=True, index=True)
    used_count = fields.Integer(string='Images Used', default=0)
    free_quota = fields.Integer(string='Free Quota', default=FREE_QUOTA)
    billable_count = fields.Integer(string='Billable Images', compute='_compute_billable', store=True)
    total_cost = fields.Integer(string='Total Cost (JPY)', compute='_compute_billable', store=True)

    _sql_constraints = [
        ('user_month_unique', 'unique(user_id, month)', 'Usage record must be unique per user per month')
    ]

    @api.depends('used_count', 'free_quota')
    def _compute_billable(self):
        for rec in self:
            if rec.used_count > rec.free_quota:
                rec.billable_count = rec.used_count - rec.free_quota
                rec.total_cost = rec.billable_count * PRICE_PER_IMAGE
            else:
                rec.billable_count = 0
                rec.total_cost = 0

    @api.model
    def get_current_usage(self, user_id=None):
        """Get current month usage for a user"""
        if not user_id:
            user_id = self.env.uid

        month = datetime.now().strftime('%Y-%m')

        usage = self.search([
            ('user_id', '=', user_id),
            ('month', '=', month)
        ], limit=1)

        if not usage:
            return {
                'month': month,
                'used': 0,
                'free_quota': FREE_QUOTA,
                'remaining_free': FREE_QUOTA,
                'billable': 0,
                'total_cost': 0,
            }

        remaining = max(0, usage.free_quota - usage.used_count)

        return {
            'month': month,
            'used': usage.used_count,
            'free_quota': usage.free_quota,
            'remaining_free': remaining,
            'billable': usage.billable_count,
            'total_cost': usage.total_cost,
        }

    @api.model
    def increment_usage(self, pages=1, user_id=None, document_id=None, document_model=None, document_name=None):
        """
        Increment usage count for a user and notify BizNexus

        Args:
            pages: Number of pages/images processed
            user_id: User ID (default: current user)
            document_id: ID of the processed document
            document_model: Model name (account.move, purchase.order)
            document_name: Document name/reference

        Returns:
            {'is_billable': bool, 'cost': int}
        """
        if not user_id:
            user_id = self.env.uid

        month = datetime.now().strftime('%Y-%m')

        usage = self.search([
            ('user_id', '=', user_id),
            ('month', '=', month)
        ], limit=1)

        if not usage:
            usage = self.create({
                'user_id': user_id,
                'month': month,
                'used_count': 0,
                'free_quota': FREE_QUOTA,
            })

        # Calculate cost for this operation
        old_billable = max(0, usage.used_count - usage.free_quota)
        new_used = usage.used_count + pages
        new_billable = max(0, new_used - usage.free_quota)
        cost_this_op = (new_billable - old_billable) * PRICE_PER_IMAGE

        # Update usage
        usage.write({'used_count': new_used})

        _logger.info(f'[OCR Usage] User {user_id}: {usage.used_count - pages} -> {new_used} images, cost: JPY{cost_this_op}')

        # Notify BizNexus webhook (async, don't block on failure)
        self._notify_biznexus(pages, document_id, document_model, document_name)

        return {
            'is_billable': cost_this_op > 0,
            'cost': cost_this_op,
        }

    def _notify_biznexus(self, pages, document_id, document_model, document_name):
        """Send OCR usage notification to BizNexus webhook"""
        try:
            # Get tenant code from database name
            db_name = self.env.cr.dbname
            tenant_code = db_name  # e.g., "ten_mkqzyn00"

            payload = {
                'tenant_code': tenant_code,
                'document_id': document_id or 0,
                'document_model': document_model or 'account.move',
                'document_name': document_name or 'Unknown',
                'ocr_status': 'done',
                'ocr_pages': pages,
                'api_key': BIZNEXUS_WEBHOOK_KEY,
            }

            response = requests.post(
                BIZNEXUS_WEBHOOK_URL,
                json=payload,
                timeout=5,
                headers={'Content-Type': 'application/json'}
            )

            if response.status_code == 200:
                result = response.json()
                _logger.info(f'[OCR Usage] BizNexus webhook success: {result.get("data", {})}')
            else:
                _logger.warning(f'[OCR Usage] BizNexus webhook failed: {response.status_code}')

        except Exception as e:
            # Don't fail OCR if webhook fails - just log
            _logger.warning(f'[OCR Usage] BizNexus webhook error (non-blocking): {e}')

    @api.model
    def get_usage_summary(self, user_id=None):
        """Get usage summary message for display"""
        usage = self.get_current_usage(user_id)

        if usage['remaining_free'] > 0:
            return f"Free: {usage['remaining_free']}/{usage['free_quota']} remaining this month"
        else:
            return f"Used: {usage['used']}, Billable: {usage['billable']} (JPY{usage['total_cost']})"
