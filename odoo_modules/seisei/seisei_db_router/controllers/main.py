# -*- coding: utf-8 -*-
"""
Seisei Database Router
Routes requests to the correct database based on:
1. X-Odoo-dbfilter header (set by Traefik/nginx)
2. Subdomain pattern (fallback)
3. Query parameter db= (user override)
"""
import re
import logging
from werkzeug.utils import redirect as http_redirect
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)

# Database mapping for special domains
# This mapping takes precedence over subdomain pattern
DOMAIN_DB_MAP = {
    'demo.nagashiro.top': 'ten_testodoo',
    'testodoo.seisei.tokyo': 'ten_testodoo',
}

def get_db_from_host(host):
    """
    Determine database name from host.
    Priority:
    1. X-Odoo-dbfilter header
    2. Domain mapping (DOMAIN_DB_MAP)
    3. Subdomain pattern (xxx.erp.seisei.tokyo -> ten_xxx)
    """
    if not host:
        return None

    # Remove port if present
    host = host.split(':')[0].lower()

    # Check X-Odoo-dbfilter header first
    dbfilter_header = request.httprequest.headers.get('X-Odoo-dbfilter')
    if dbfilter_header:
        _logger.debug(f"DB from X-Odoo-dbfilter header: {dbfilter_header}")
        return dbfilter_header

    # Check domain mapping
    if host in DOMAIN_DB_MAP:
        db_name = DOMAIN_DB_MAP[host]
        _logger.debug(f"DB from domain mapping: {host} -> {db_name}")
        return db_name

    # Check subdomain pattern
    match = re.match(r'^([a-z0-9]+)\.erp\.seisei\.tokyo$', host)
    if match:
        subdomain = match.group(1)
        db_name = f"ten_{subdomain}"
        _logger.debug(f"DB from subdomain pattern: {subdomain} -> {db_name}")
        return db_name

    return None


class DatabaseRouter(http.Controller):

    @http.route('/web/database/selector', type='http', auth='none', csrf=False)
    def database_selector_redirect(self, **kwargs):
        """
        Intercept database selector and auto-redirect based on host/header.
        """
        try:
            host = request.httprequest.host
            _logger.info(f"Database router: host = {host}")

            db_name = get_db_from_host(host)
            if db_name:
                _logger.info(f"Database router: redirecting to db = {db_name}")
                return http_redirect(f'/web?db={db_name}', code=303)

        except Exception as e:
            _logger.exception(f"Database router error: {e}")

        # Fall through to default behavior
        return Response(
            "<html><body><h1>Select Database</h1></body></html>",
            content_type='text/html'
        )

    @http.route('/web', type='http', auth='none', csrf=False)
    def web_redirect(self, db=None, **kwargs):
        """
        Intercept /web and redirect to correct database if not specified.
        """
        try:
            # If db is already specified, let Odoo handle it
            if db:
                # Re-route to the original Odoo /web handler
                from odoo.addons.web.controllers.home import Home
                return Home().web_client(**kwargs)

            host = request.httprequest.host
            db_name = get_db_from_host(host)

            if db_name:
                _logger.info(f"Database router: /web redirect to db = {db_name}")
                return http_redirect(f'/web?db={db_name}', code=303)

            # If no db determined, let Odoo show database selector
            from odoo.addons.web.controllers.home import Home
            return Home().web_client(**kwargs)

        except Exception as e:
            _logger.exception(f"Database router /web error: {e}")
            from odoo.addons.web.controllers.home import Home
            return Home().web_client(**kwargs)

    @http.route('/web/login', type='http', auth='none', csrf=False, sitemap=False)
    def web_login_redirect(self, db=None, redirect_to=None, **kwargs):
        """
        Intercept /web/login and ensure correct database is used.
        Note: 'redirect' param renamed to 'redirect_to' to avoid conflict with werkzeug.redirect
        """
        try:
            # If db is already specified, let Odoo handle it
            if db:
                from odoo.addons.web.controllers.home import Home
                return Home().web_login(redirect=redirect_to, **kwargs)

            host = request.httprequest.host
            db_name = get_db_from_host(host)

            if db_name:
                _logger.info(f"Database router: /web/login redirect to db = {db_name}")
                redirect_url = f'/web/login?db={db_name}'
                if redirect_to:
                    redirect_url += f'&redirect={redirect_to}'
                return http_redirect(redirect_url, code=303)

            # If no db determined, let Odoo handle it
            from odoo.addons.web.controllers.home import Home
            return Home().web_login(redirect=redirect_to, **kwargs)

        except Exception as e:
            _logger.exception(f"Database router /web/login error: {e}")
            from odoo.addons.web.controllers.home import Home
            return Home().web_login(redirect=redirect_to, **kwargs)
