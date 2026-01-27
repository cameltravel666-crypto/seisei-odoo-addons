# -*- coding: utf-8 -*-
"""
Seisei Admin Gate Controller
Intercepts login attempts on *.erp.seisei.tokyo and restricts to admin only
"""
import logging
import os
import re
from odoo import http
from odoo.http import request
from odoo.addons.web.controllers.home import Home

_logger = logging.getLogger(__name__)

# Admin domain pattern
ADMIN_DOMAIN_PATTERN = re.compile(r'^[a-z0-9-]+\.erp\.seisei\.tokyo$')

# Default admin email
DEFAULT_ADMIN_EMAIL = 'admin@seisei.tokyo'


def is_admin_domain(host):
    """Check if the request host is an admin domain (*.erp.seisei.tokyo)"""
    if not host:
        return False
    # Remove port if present
    host = host.split(':')[0].lower()
    return bool(ADMIN_DOMAIN_PATTERN.match(host))


def get_admin_email():
    """Get admin email from config or environment"""
    try:
        # Try to get from ir.config_parameter
        param = request.env['ir.config_parameter'].sudo().get_param(
            'seisei_admin_gate.admin_email'
        )
        if param:
            return param
    except Exception:
        pass

    # Fallback to environment variable
    return os.environ.get('ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL)


class SeiseiAdminGate(Home):
    """
    Extends the Home controller to add admin gate functionality.
    Intercepts web_login to check if user is allowed on admin domains.
    """

    @http.route('/web/login', type='http', auth="none", sitemap=False)
    def web_login(self, redirect=None, **kw):
        """Override login to enforce admin-only access on *.erp.seisei.tokyo"""
        host = request.httprequest.host

        # Only enforce on admin domains
        if not is_admin_domain(host):
            return super().web_login(redirect=redirect, **kw)

        # If this is a POST request (actual login attempt)
        if request.httprequest.method == 'POST':
            login = kw.get('login', '')
            admin_email = get_admin_email()

            # Check if login matches admin email
            if login.lower() != admin_email.lower():
                _logger.warning(
                    'Admin gate: Login denied for %s on %s (admin: %s)',
                    login, host, admin_email
                )
                # Show access denied page
                return request.render(
                    'seisei_admin_gate.access_denied',
                    {
                        'login': login,
                        'admin_email': admin_email,
                        'host': host,
                    }
                )

        # For GET requests or admin login, proceed normally
        return super().web_login(redirect=redirect, **kw)

    @http.route('/web/session/authenticate', type='json', auth="none")
    def authenticate(self, db, login, password, base_location=None):
        """Override JSON-RPC authenticate to enforce admin-only access"""
        host = request.httprequest.host

        # Only enforce on admin domains
        if is_admin_domain(host):
            admin_email = get_admin_email()

            if login.lower() != admin_email.lower():
                _logger.warning(
                    'Admin gate: JSON-RPC auth denied for %s on %s',
                    login, host
                )
                return {
                    'error': 'access_denied',
                    'message': f'Only {admin_email} can access this resource'
                }

        # Proceed with normal authentication
        return super().authenticate(
            db, login, password, base_location=base_location
        )


class AdminGateInfo(http.Controller):
    """Additional controller for admin gate info/status"""

    @http.route('/admin-gate/status', type='json', auth='none')
    def gate_status(self):
        """Return admin gate status (for debugging/monitoring)"""
        host = request.httprequest.host
        return {
            'enabled': True,
            'is_admin_domain': is_admin_domain(host),
            'admin_email': get_admin_email(),
            'host': host,
        }

    @http.route('/admin-gate/denied', type='http', auth='none')
    def access_denied_page(self, **kw):
        """Standalone access denied page"""
        return request.render(
            'seisei_admin_gate.access_denied',
            {
                'login': kw.get('login', 'unknown'),
                'admin_email': get_admin_email(),
                'host': request.httprequest.host,
            }
        )
