# -*- coding: utf-8 -*-
# vendor.ops.tenant model with auto-generated tenant code and entitlement management

from odoo import api, fields, models
from odoo.exceptions import UserError
from datetime import datetime
import json
import logging
import requests

_logger = logging.getLogger(__name__)


class VendorOpsTenant(models.Model):
    _name = 'vendor.ops.tenant'
    _description = 'Vendor Ops Tenant'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'name'

    name = fields.Char(required=True, index=True, tracking=True)
    code = fields.Char(required=False, readonly=True, copy=False, index=True, tracking=True)
    partner_id = fields.Many2one('res.partner', string='Partner', tracking=True)
    active = fields.Boolean(default=True, tracking=True)
    plan = fields.Selection(
        [('starter', 'Starter'), ('pro', 'Pro'), ('enterprise', 'Enterprise')],
        default='starter',
        required=True,
        tracking=True
    )
    notes = fields.Text()

    # Auto-generated fields (readonly after creation)
    subdomain = fields.Char(
        string='Subdomain',
        required=False,
        readonly=True,
        copy=False,
        help='Numeric subdomain extracted from tenant_code (e.g., 00000001)'
    )
    domain_primary = fields.Char(
        string='Primary Domain',
        required=False,
        readonly=True,
        copy=False,
        help='Primary domain for the tenant (e.g., 00000001.erp.seisei.tokyo)'
    )
    customer_db_name = fields.Char(
        string='Customer DB Name',
        required=False,
        readonly=True,
        copy=False,
        help='Customer database name (e.g., cust_ten_00000001)'
    )

    # Bridge sync status fields
    bridge_sync_status = fields.Selection(
        [('pending', 'Pending'),
         ('ok', 'Synced'),
         ('failed', 'Failed')],
        string='Bridge Sync Status',
        default='pending',
        readonly=True,
        tracking=True,
        help='Status of synchronization with Bridge API'
    )
    bridge_sync_error = fields.Text(
        string='Bridge Sync Error',
        readonly=True,
        tracking=True,
        help='Error message if Bridge sync failed'
    )
    bridge_synced_at = fields.Datetime(
        string='Bridge Synced At',
        readonly=True,
        tracking=True,
        help='Last successful sync timestamp with Bridge'
    )

    intake_batch_ids = fields.One2many(
        'vendor.ops.intake.batch',
        'tenant_id',
        string='Intake Batches'
    )

    # ==========================================
    # Entitlement Management Fields (Seisei Billing)
    # ==========================================
    business_base_url = fields.Char(
        string='Business Database URL',
        help='Base URL of the business Odoo instance for entitlement push (e.g., https://00000001.erp.seisei.tokyo)',
        tracking=True,
    )
    business_api_key = fields.Char(
        string='Business API Key',
        help='API key for authenticating with the business database',
    )

    # Subscriptions (sale.order with is_subscription=True)
    subscription_ids = fields.One2many(
        'sale.order',
        'vendor_ops_tenant_id',
        string='Subscriptions',
        domain=[('is_subscription', '=', True)],
    )

    # Computed current features
    current_features = fields.Text(
        string='Current Features',
        compute='_compute_current_features',
        store=False,
        help='Currently active features based on valid subscriptions',
    )

    # Entitlement push status
    entitlement_push_date = fields.Datetime(
        string='Last Entitlement Push',
        readonly=True,
    )
    entitlement_push_status = fields.Selection([
        ('success', 'Success'),
        ('failed', 'Failed'),
    ], string='Entitlement Push Status', readonly=True)
    entitlement_push_error = fields.Text(
        string='Entitlement Push Error',
        readonly=True,
    )

    # Push logs
    entitlement_push_log_ids = fields.One2many(
        'seisei.push.log',
        'tenant_id',
        string='Entitlement Push Logs',
    )

    # ==========================================
    # OCR Usage Fields (synced from central OCR service)
    # ==========================================
    ocr_image_count = fields.Integer(
        string='OCR Images Used',
        default=0,
        readonly=True,
        help='Total OCR images processed this month'
    )
    ocr_free_remaining = fields.Integer(
        string='OCR Free Remaining',
        compute='_compute_ocr_free_remaining',
        help='Remaining free OCR quota this month'
    )
    ocr_billable_count = fields.Integer(
        string='OCR Billable',
        default=0,
        readonly=True,
        help='Billable OCR images (after free quota)'
    )
    ocr_total_cost = fields.Float(
        string='OCR Cost (JPY)',
        digits=(10, 2),
        default=0,
        readonly=True,
        help='Total OCR cost this month in JPY'
    )
    ocr_year_month = fields.Char(
        string='OCR Usage Month',
        readonly=True,
        help='Year-month of the OCR usage data'
    )
    ocr_last_sync = fields.Datetime(
        string='OCR Last Sync',
        readonly=True,
        help='Last sync time from central OCR service'
    )

    _sql_constraints = [
        models.Constraint(
            'UNIQUE(code)',
            'Tenant code must be unique.',
        ),
        models.Constraint(
            'UNIQUE(subdomain)',
            'Subdomain must be unique.',
        ),
        models.Constraint(
            'UNIQUE(domain_primary)',
            'Primary domain must be unique.',
        ),
        models.Constraint(
            'UNIQUE(customer_db_name)',
            'Customer DB name must be unique.',
        ),
    ]

    # ==========================================
    # OCR Usage Computed Fields
    # ==========================================
    @api.depends('ocr_image_count')
    def _compute_ocr_free_remaining(self):
        """Compute remaining free OCR quota"""
        ICP = self.env['ir.config_parameter'].sudo()
        free_quota = int(ICP.get_param('vendor_ops.ocr_free_quota', '30'))
        for tenant in self:
            tenant.ocr_free_remaining = max(0, free_quota - tenant.ocr_image_count)

    # ==========================================
    # Constraints
    # ==========================================
    @api.constrains('code')
    def _check_code_not_empty(self):
        """Ensure tenant code is never empty"""
        for rec in self:
            if not rec.code or (isinstance(rec.code, str) and rec.code.strip() == ''):
                raise UserError('Tenant Code must be generated (non-empty).')

    @api.constrains('subdomain')
    def _check_subdomain_not_empty(self):
        """Ensure subdomain is never empty"""
        for rec in self:
            if not rec.subdomain or (isinstance(rec.subdomain, str) and rec.subdomain.strip() == ''):
                raise UserError('Subdomain must be generated (non-empty).')

    @api.constrains('domain_primary')
    def _check_domain_primary_not_empty(self):
        """Ensure domain_primary is never empty"""
        for rec in self:
            if not rec.domain_primary or (isinstance(rec.domain_primary, str) and rec.domain_primary.strip() == ''):
                raise UserError('Primary Domain must be generated (non-empty).')

    @api.constrains('customer_db_name')
    def _check_customer_db_name_not_empty(self):
        """Ensure customer_db_name is never empty"""
        for rec in self:
            if not rec.customer_db_name or (isinstance(rec.customer_db_name, str) and rec.customer_db_name.strip() == ''):
                raise UserError('Customer DB Name must be generated (non-empty).')

    # ==========================================
    # Code Generation Helpers
    # ==========================================
    def action_start_intake_from_tenant(self):
        """Open Start Intake wizard from tenant form."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Start Intake',
            'res_model': 'vendor.ops.start.intake.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_tenant_id': self.id,
            }
        }

    @api.model
    def _get_base_domain(self):
        """Get base domain from ir.config_parameter"""
        ICP = self.env['ir.config_parameter'].sudo()
        return ICP.get_param('vendor_ops.base_domain', 'erp.seisei.tokyo')

    @api.model
    def _extract_subdomain_from_code(self, code):
        """Extract numeric subdomain from tenant_code (TEN-00000123 -> 00000123)"""
        if not code or not code.startswith('TEN-'):
            return None
        try:
            # Extract numeric part after TEN-
            numeric_part = code.split('-', 1)[1]
            return numeric_part
        except (IndexError, ValueError):
            return None

    @api.model
    def _generate_tenant_fields(self, code):
        """Generate subdomain, domain_primary, customer_db_name from code"""
        subdomain = self._extract_subdomain_from_code(code)
        if not subdomain:
            return {}

        base_domain = self._get_base_domain()
        domain_primary = f"{subdomain}.{base_domain}"
        customer_db_name = f"cust_ten_{subdomain}".lower()

        return {
            'subdomain': subdomain,
            'domain_primary': domain_primary,
            'customer_db_name': customer_db_name,
        }

    # ==========================================
    # Bridge API Sync
    # ==========================================
    def _bridge_payload(self):
        """Prepare payload for Bridge API"""
        return {
            'tenant_code': self.code,
            'tenant_name': self.name,
            'active': self.active,
            'subdomain': self.subdomain,
            'domain_primary': self.domain_primary,
            'customer_db_name': self.customer_db_name,
            'plan': self.plan,
            'note': self.notes or None,
        }

    def _sync_tenant_to_bridge(self, force=False):
        """Sync tenant to Bridge API (soft consistency, can retry)"""
        # Skip if not active and not forcing
        if not self.active and not force:
            return

        # Get Bridge configuration
        ICP = self.env['ir.config_parameter'].sudo()
        bridge_base_url = ICP.get_param('vendor_ops.bridge_base_url')
        bridge_timeout = int(ICP.get_param('vendor_ops.bridge_timeout_seconds', '8'))

        if not bridge_base_url:
            self.write({
                'bridge_sync_status': 'failed',
                'bridge_sync_error': 'Bridge base URL not configured (vendor_ops.bridge_base_url)',
            })
            _logger.warning(f"Tenant {self.code}: Bridge base URL not configured")
            return

        if not self.code:
            _logger.warning(f"Tenant {self.id}: Cannot sync without tenant_code")
            return

        # Prepare request
        url = f"{bridge_base_url.rstrip('/')}/admin/tenants/{self.code}"
        payload = self._bridge_payload()

        try:
            _logger.info(f"Syncing tenant {self.code} to Bridge: {url}")
            response = requests.put(
                url,
                json=payload,
                timeout=bridge_timeout,
                headers={'Content-Type': 'application/json'}
            )

            if response.status_code >= 200 and response.status_code < 300:
                # Success
                self.write({
                    'bridge_sync_status': 'ok',
                    'bridge_synced_at': fields.Datetime.now(),
                    'bridge_sync_error': False,
                })
                _logger.info(f"Tenant {self.code} synced to Bridge successfully (status: {response.status_code})")
            else:
                # HTTP error
                error_msg = f"HTTP {response.status_code}"
                try:
                    error_body = response.text[:500]  # First 500 chars
                    error_msg += f": {error_body}"
                except:
                    pass

                self.write({
                    'bridge_sync_status': 'failed',
                    'bridge_sync_error': error_msg,
                })
                _logger.error(f"Tenant {self.code} Bridge sync failed: {error_msg}")

        except requests.exceptions.Timeout:
            error_msg = f"Timeout after {bridge_timeout}s"
            self.write({
                'bridge_sync_status': 'failed',
                'bridge_sync_error': error_msg,
            })
            _logger.error(f"Tenant {self.code} Bridge sync timeout: {error_msg}")

        except requests.exceptions.ConnectionError as e:
            error_msg = f"Connection error: {str(e)[:200]}"
            self.write({
                'bridge_sync_status': 'failed',
                'bridge_sync_error': error_msg,
            })
            _logger.error(f"Tenant {self.code} Bridge sync connection error: {error_msg}")

        except Exception as e:
            error_msg = f"Unexpected error: {str(e)[:200]}"
            self.write({
                'bridge_sync_status': 'failed',
                'bridge_sync_error': error_msg,
            })
            _logger.exception(f"Tenant {self.code} Bridge sync unexpected error: {error_msg}")

    def action_sync_to_bridge(self):
        """Manual sync to Bridge (admin button)"""
        self.ensure_one()
        self._sync_tenant_to_bridge(force=True)
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Bridge Sync',
                'message': f'Sync status: {self.bridge_sync_status}',
                'type': 'success' if self.bridge_sync_status == 'ok' else 'warning',
            }
        }

    # ==========================================
    # Entitlement Management (Seisei Billing)
    # ==========================================
    @api.depends('subscription_ids', 'subscription_ids.subscription_state', 'subscription_ids.date_order')
    def _compute_current_features(self):
        """Compute current active features based on subscriptions"""
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

    def _get_entitlement_api_url(self):
        """Get the entitlement API URL for this tenant"""
        self.ensure_one()
        if self.business_base_url:
            return self.business_base_url.rstrip('/')
        # Fallback: use domain_primary with https
        if self.domain_primary:
            return f"https://{self.domain_primary}"
        return None

    def push_entitlements_to_business(self):
        """Push current entitlements to the business database."""
        for tenant in self:
            tenant._push_entitlements_single()

    def _push_entitlements_single(self):
        """Push entitlements for a single tenant."""
        self.ensure_one()

        api_url = self._get_entitlement_api_url()
        if not api_url:
            _logger.warning(f"Tenant {self.code}: No business URL configured, skipping entitlement push")
            return

        if not self.business_api_key:
            _logger.warning(f"Tenant {self.code}: No API key configured, skipping entitlement push")
            return

        features = list(self._get_active_features())
        timestamp = datetime.utcnow().isoformat() + 'Z'

        payload = {
            'tenant_code': self.code,
            'features': features,
            'source': 'odoo19_billing',
            'timestamp': timestamp,
        }

        url = f"{api_url}/seisei/entitlements/apply"
        headers = {
            'Content-Type': 'application/json',
            'X-API-KEY': self.business_api_key,
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

            log_vals.update({
                'status': 'success',
                'response_code': response.status_code,
                'response_body': response.text[:4000] if response.text else '',
            })
            self.write({
                'entitlement_push_date': fields.Datetime.now(),
                'entitlement_push_status': 'success',
                'entitlement_push_error': False,
            })
            _logger.info(f"Successfully pushed entitlements for tenant {self.code}: {features}")

        except requests.exceptions.RequestException as e:
            error_msg = str(e)
            log_vals.update({
                'status': 'failed',
                'response_code': getattr(e.response, 'status_code', None) if hasattr(e, 'response') else None,
                'response_body': getattr(e.response, 'text', '')[:4000] if hasattr(e, 'response') and e.response else '',
                'error_message': error_msg[:4000],
            })
            self.write({
                'entitlement_push_date': fields.Datetime.now(),
                'entitlement_push_status': 'failed',
                'entitlement_push_error': error_msg[:4000],
            })
            _logger.error(f"Failed to push entitlements for tenant {self.code}: {error_msg}")

        self.env['seisei.push.log'].create(log_vals)

    @api.model
    def cron_reconcile_entitlements(self):
        """Cron job to reconcile entitlements for all active tenants."""
        tenants = self.search([
            ('active', '=', True),
            ('business_base_url', '!=', False),
            ('business_api_key', '!=', False),
        ])
        _logger.info(f"Starting entitlement reconciliation for {len(tenants)} tenants")

        for tenant in tenants:
            try:
                tenant._push_entitlements_single()
                self.env.cr.commit()
            except Exception as e:
                _logger.exception(f"Error reconciling entitlements for tenant {tenant.code}: {e}")
                self.env.cr.rollback()

        _logger.info("Entitlement reconciliation completed")

    def action_push_entitlements(self):
        """Button action to manually push entitlements."""
        self.ensure_one()
        self._push_entitlements_single()
        if self.entitlement_push_status == 'success':
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Success',
                    'message': f'Entitlements pushed successfully for {self.code}',
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
                    'message': f'Failed to push entitlements: {self.entitlement_push_error}',
                    'type': 'danger',
                    'sticky': True,
                }
            }

    # ==========================================
    # OCR Usage Management
    # ==========================================
    @api.model
    def _get_ocr_service_config(self):
        """Get OCR service configuration from system parameters or environment"""
        import os
        ICP = self.env['ir.config_parameter'].sudo()

        # Environment variables take priority
        service_url = os.environ.get('OCR_SERVICE_URL')
        service_key = os.environ.get('OCR_SERVICE_KEY')

        if not service_url:
            service_url = ICP.get_param('vendor_ops.ocr_service_url', 'http://ocr-service:8080/api/v1')
        if not service_key:
            service_key = ICP.get_param('vendor_ops.ocr_service_key', '')

        return {
            'url': service_url.rstrip('/'),
            'key': service_key,
            'host': ICP.get_param('vendor_ops.ocr_service_host', ''),  # For proxy Host header
            'free_quota': int(ICP.get_param('vendor_ops.ocr_free_quota', '30')),
            'price_per_image': float(ICP.get_param('vendor_ops.ocr_price_per_image', '20')),
        }

    def action_sync_ocr_usage(self):
        """Sync OCR usage for this tenant from central service"""
        self.ensure_one()
        self._sync_ocr_usage_single()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'OCR Usage Synced',
                'message': f"Images: {self.ocr_image_count}, Free remaining: {self.ocr_free_remaining}, Cost: ¥{self.ocr_total_cost:.0f}",
                'type': 'success',
                'sticky': False,
            }
        }

    def _sync_ocr_usage_single(self):
        """Sync OCR usage for a single tenant"""
        self.ensure_one()
        config = self._get_ocr_service_config()

        if not config['url']:
            _logger.warning(f"Tenant {self.code}: OCR service URL not configured")
            return

        # Use subdomain as tenant_id for OCR service
        tenant_id = self.subdomain
        if not tenant_id:
            _logger.warning(f"Tenant {self.code}: No subdomain, cannot sync OCR usage")
            return

        year_month = datetime.now().strftime('%Y-%m')
        url = f"{config['url']}/usage/{tenant_id}?year_month={year_month}"

        try:
            headers = {
                'Content-Type': 'application/json',
                'X-Service-Key': config['key'],
            }
            if config.get('host'):
                headers['Host'] = config['host']
            response = requests.get(
                url,
                headers=headers,
                timeout=30,
            )

            if response.status_code == 200:
                data = response.json()
                self.write({
                    'ocr_image_count': data.get('image_count', 0),
                    'ocr_billable_count': data.get('billable_count', 0),
                    'ocr_total_cost': data.get('total_cost', 0),
                    'ocr_year_month': data.get('year_month', year_month),
                    'ocr_last_sync': fields.Datetime.now(),
                })
                _logger.info(f"Synced OCR usage for tenant {self.code}: {data}")
            elif response.status_code == 404:
                # No usage data from central OCR service
                # DON'T reset if we already have webhook data (Odoo 18 pushes directly)
                if self.ocr_image_count == 0:
                    self.write({
                        'ocr_year_month': year_month,
                        'ocr_last_sync': fields.Datetime.now(),
                    })
                    _logger.info(f"No OCR usage for tenant {self.code} (404)")
                else:
                    # Preserve webhook data, only update sync time
                    self.write({
                        'ocr_last_sync': fields.Datetime.now(),
                    })
                    _logger.info(f"No central OCR data for tenant {self.code} (404), preserving webhook data: {self.ocr_image_count} images")
            else:
                _logger.error(f"Failed to sync OCR usage for tenant {self.code}: HTTP {response.status_code}")

        except requests.RequestException as e:
            _logger.error(f"Failed to sync OCR usage for tenant {self.code}: {e}")

    @api.model
    def cron_sync_all_ocr_usage(self):
        """Cron job to sync OCR usage for all active tenants"""
        tenants = self.search([('active', '=', True)])
        _logger.info(f"Starting OCR usage sync for {len(tenants)} tenants")

        for tenant in tenants:
            try:
                tenant._sync_ocr_usage_single()
                self.env.cr.commit()
            except Exception as e:
                _logger.exception(f"Error syncing OCR usage for tenant {tenant.code}: {e}")
                self.env.cr.rollback()

        _logger.info("OCR usage sync completed")

    @api.model
    def action_sync_all_ocr_usage(self):
        """Manual action to sync all OCR usage"""
        self.cron_sync_all_ocr_usage()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'OCR Sync Complete',
                'message': 'OCR usage synced for all active tenants',
                'type': 'success',
                'sticky': False,
            }
        }

    @api.model
    def action_push_ocr_config(self):
        """Push OCR configuration from Odoo 19 to central OCR service"""
        ICP = self.env['ir.config_parameter'].sudo()

        # Get config from system parameters
        gemini_api_key = ICP.get_param('vendor_ops.gemini_api_key', '')
        free_quota = ICP.get_param('vendor_ops.ocr_free_quota', '30')
        price_per_image = ICP.get_param('vendor_ops.ocr_price_per_image', '20')
        service_url = ICP.get_param('vendor_ops.ocr_service_url', 'http://ocr-service:8080/api/v1')
        service_key = ICP.get_param('vendor_ops.ocr_service_key', '')
        service_host = ICP.get_param('vendor_ops.ocr_service_host', '')  # For proxy Host header

        # Build payload
        payload = {}
        if gemini_api_key:
            payload['gemini_api_key'] = gemini_api_key
        payload['free_quota'] = int(free_quota)
        payload['price_per_image'] = float(price_per_image)

        # Push to OCR service
        url = f"{service_url.rstrip('/')}/admin/config"
        headers = {
            'Content-Type': 'application/json',
            'X-Service-Key': service_key,
        }
        if service_host:
            headers['Host'] = service_host

        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            if response.status_code == 200:
                result = response.json()
                _logger.info(f"OCR config pushed successfully: {result}")
                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': 'Config Pushed',
                        'message': f"OCR configuration pushed successfully. Updated: {result.get('updated_keys', [])}",
                        'type': 'success',
                        'sticky': False,
                    }
                }
            else:
                _logger.error(f"Failed to push OCR config: {response.status_code} - {response.text}")
                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': 'Push Failed',
                        'message': f"Failed to push config: HTTP {response.status_code}",
                        'type': 'danger',
                        'sticky': True,
                    }
                }
        except requests.RequestException as e:
            _logger.error(f"Failed to push OCR config: {e}")
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Push Failed',
                    'message': f"Connection error: {str(e)[:100]}",
                    'type': 'danger',
                    'sticky': True,
                }
            }

    # ==========================================
    # CRUD Overrides
    # ==========================================
    @api.model_create_multi
    def create(self, vals_list):
        """Override create to auto-generate code and related fields"""
        for vals in vals_list:
            # Generate tenant_code if empty/None/False/'NEW'/whitespace
            code_value = vals.get('code', '')
            if not code_value or (isinstance(code_value, str) and code_value.strip() in ('', 'NEW', '/')):
                # Force generate code
                vals['code'] = self.env['ir.sequence'].next_by_code('vendor_ops.tenant')
                if not vals['code'] or (isinstance(vals['code'], str) and vals['code'].strip() == ''):
                    raise UserError('Failed to generate tenant code. Please check sequence configuration (vendor_ops.tenant).')

            # Ensure code is not empty string
            if not vals['code'] or (isinstance(vals['code'], str) and vals['code'].strip() == ''):
                raise UserError('Tenant code cannot be empty. Please check sequence configuration.')

            # Generate subdomain, domain_primary, customer_db_name BEFORE super().create()
            generated_fields = self._generate_tenant_fields(vals['code'])
            if not generated_fields:
                raise UserError(f'Failed to generate tenant fields from code: {vals["code"]}')
            vals.update(generated_fields)

            # Auto-fill business_base_url from domain_primary if not provided
            if not vals.get('business_base_url') and generated_fields.get('domain_primary'):
                vals['business_base_url'] = f"https://{generated_fields['domain_primary']}"

            # Set initial bridge sync status
            vals.setdefault('bridge_sync_status', 'pending')

        # Create records (all fields must be set before this call)
        records = super().create(vals_list)

        # Assert all records have non-empty code
        for record in records:
            if not record.code or (isinstance(record.code, str) and record.code.strip() == ''):
                raise UserError(f'Created tenant {record.id} has empty code. This should not happen.')

        # Trigger Bridge sync (non-blocking)
        for record in records:
            try:
                record._sync_tenant_to_bridge()
            except Exception as e:
                _logger.exception(f"Failed to sync tenant {record.code} to Bridge during create: {e}")
                # Don't block creation, just log error

        return records

    def write(self, vals):
        """Override write to protect auto-generated fields and trigger sync"""
        # Allow system backfill/create operations (context bypass)
        context = self.env.context
        is_system_operation = context.get('system_backfill') or context.get('system_create')

        # Protect auto-generated fields (only allow system admin or system operations to modify)
        protected_fields = {'code', 'subdomain', 'domain_primary', 'customer_db_name'}
        if any(field in vals for field in protected_fields):
            # Check if user is system admin or system operation
            if not is_system_operation and not self.env.user.has_group('base.group_system'):
                protected_changed = protected_fields & set(vals.keys())
                raise UserError(
                    f'Cannot modify auto-generated fields: {", ".join(protected_changed)}. '
                    'These fields are system-generated and cannot be changed.'
                )

        # Check if sync-triggering fields changed
        sync_fields = {'name', 'active', 'plan', 'notes'}
        sync_needed = any(field in vals for field in sync_fields)

        # Write
        result = super().write(vals)

        # Trigger Bridge sync if relevant fields changed
        if sync_needed:
            for record in self:
                try:
                    record.write({'bridge_sync_status': 'pending'})
                    record._sync_tenant_to_bridge()
                except Exception as e:
                    _logger.exception(f"Failed to sync tenant {record.code} to Bridge during write: {e}")

        return result
