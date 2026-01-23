import json
import logging
from datetime import datetime

import requests

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.models import Constraint

_logger = logging.getLogger(__name__)


class SeiseiTenant(models.Model):
    _name = 'seisei.tenant'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'Seisei Tenant'
    _order = 'tenant_code'

    tenant_code = fields.Char(
        string='Tenant Code',
        required=True,
        index=True,
        copy=False,
    )
    name = fields.Char(string='Tenant Name', required=True)
    business_base_url = fields.Char(
        string='Business Database URL',
        required=True,
        help='Base URL of the business Odoo instance (e.g., https://business.example.com)',
    )
    api_key = fields.Char(
        string='API Key',
        required=True,
        help='API key for authenticating with the business database',
    )
    active = fields.Boolean(default=True)
    partner_id = fields.Many2one(
        'res.partner',
        string='Related Partner',
        help='The partner/customer associated with this tenant',
    )
    # In Odoo 19, subscriptions are sale.order with is_subscription=True
    subscription_ids = fields.One2many(
        'sale.order',
        'seisei_tenant_id',
        string='Subscriptions',
        domain=[('is_subscription', '=', True)],
    )
    current_features = fields.Text(
        string='Current Features',
        compute='_compute_current_features',
        store=False,
        help='Currently active features based on valid subscriptions',
    )
    last_push_date = fields.Datetime(
        string='Last Push Date',
        readonly=True,
    )
    last_push_status = fields.Selection([
        ('success', 'Success'),
        ('failed', 'Failed'),
    ], string='Last Push Status', readonly=True)
    last_push_error = fields.Text(
        string='Last Push Error',
        readonly=True,
    )
    push_log_ids = fields.One2many(
        'seisei.push.log',
        'tenant_id',
        string='Push Logs',
    )

    _constraints = [
        Constraint(
            'UNIQUE(tenant_code)',
            'Tenant code must be unique!',
        ),
    ]

    @api.depends('subscription_ids', 'subscription_ids.subscription_state', 'subscription_ids.date_order')
    def _compute_current_features(self):
        for tenant in self:
            features = tenant._get_active_features()
            tenant.current_features = ', '.join(sorted(features)) if features else ''

    def _get_active_features(self):
        """Calculate active features for this tenant based on valid subscriptions."""
        self.ensure_one()
        features = set()

        for subscription in self.subscription_ids:
            if not self._is_subscription_active(subscription):
                continue

            for line in subscription.order_line:
                if not line.product_id:
                    continue
                mappings = self.env['seisei.product.feature.map'].search([
                    ('product_id', '=', line.product_id.id)
                ])
                for mapping in mappings:
                    features.add(mapping.feature_id.key)

        return features

    def _is_subscription_active(self, subscription):
        """Check if a subscription is currently active.

        In Odoo 19, subscription_state can be:
        - '1_draft': Draft
        - '2_renewal': Renewal Quotation
        - '3_progress': In Progress (active)
        - '4_paused': Paused
        - '5_renewed': Renewed
        - '6_churn': Churned
        - '7_upsell': Upsell
        """
        if not subscription.is_subscription:
            return False

        # Active states: in_progress
        active_states = ('3_progress',)
        if subscription.subscription_state not in active_states:
            return False

        return True

    def push_entitlements_to_business(self):
        """Push current entitlements to the business database."""
        for tenant in self:
            tenant._push_entitlements_single()

    def _push_entitlements_single(self):
        """Push entitlements for a single tenant."""
        self.ensure_one()
        features = list(self._get_active_features())
        timestamp = datetime.utcnow().isoformat() + 'Z'

        # JSON-RPC format for Odoo 18 Business端
        payload = {
            'jsonrpc': '2.0',
            'method': 'call',
            'params': {
                'tenant_code': self.tenant_code,
                'features': features,
                'source': 'odoo19_billing',
                'timestamp': timestamp,
            },
            'id': None,
        }

        url = f"{self.business_base_url.rstrip('/')}/seisei/entitlements/apply"
        headers = {
            'Content-Type': 'application/json',
            'X-API-KEY': self.api_key,
        }

        log_vals = {
            'tenant_id': self.id,
            'push_date': fields.Datetime.now(),
            'payload': json.dumps(payload, indent=2),
            'endpoint': url,
        }

        try:
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=30,
            )
            response.raise_for_status()

            # Parse JSON-RPC response
            result = response.json()
            if 'error' in result:
                raise requests.exceptions.RequestException(
                    f"JSON-RPC Error: {result['error'].get('message', 'Unknown error')}"
                )
            if not result.get('result', {}).get('success'):
                raise requests.exceptions.RequestException(
                    f"API Error: {result.get('result', {}).get('error', 'Unknown error')}"
                )

            log_vals.update({
                'status': 'success',
                'response_code': response.status_code,
                'response_body': response.text[:4000] if response.text else '',
            })
            self.write({
                'last_push_date': fields.Datetime.now(),
                'last_push_status': 'success',
                'last_push_error': False,
            })
            _logger.info(f"Successfully pushed entitlements for tenant {self.tenant_code}: {features}")

        except requests.exceptions.RequestException as e:
            error_msg = str(e)
            log_vals.update({
                'status': 'failed',
                'response_code': getattr(e.response, 'status_code', None) if hasattr(e, 'response') else None,
                'response_body': getattr(e.response, 'text', '')[:4000] if hasattr(e, 'response') and e.response else '',
                'error_message': error_msg[:4000],
            })
            self.write({
                'last_push_date': fields.Datetime.now(),
                'last_push_status': 'failed',
                'last_push_error': error_msg[:4000],
            })
            _logger.error(f"Failed to push entitlements for tenant {self.tenant_code}: {error_msg}")

        self.env['seisei.push.log'].create(log_vals)

    @api.model
    def cron_reconcile_entitlements(self):
        """Cron job to reconcile entitlements for all active tenants."""
        tenants = self.search([('active', '=', True)])
        _logger.info(f"Starting entitlement reconciliation for {len(tenants)} tenants")

        for tenant in tenants:
            try:
                tenant._push_entitlements_single()
                self.env.cr.commit()
            except Exception as e:
                _logger.exception(f"Error reconciling entitlements for tenant {tenant.tenant_code}: {e}")
                self.env.cr.rollback()

        _logger.info("Entitlement reconciliation completed")

    def action_push_entitlements(self):
        """Button action to manually push entitlements."""
        self.ensure_one()
        self._push_entitlements_single()
        if self.last_push_status == 'success':
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Success',
                    'message': f'Entitlements pushed successfully for {self.tenant_code}',
                    'type': 'success',
                    'sticky': False,
                }
            }
        else:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Error',
                    'message': f'Failed to push entitlements: {self.last_push_error}',
                    'type': 'danger',
                    'sticky': True,
                }
            }
