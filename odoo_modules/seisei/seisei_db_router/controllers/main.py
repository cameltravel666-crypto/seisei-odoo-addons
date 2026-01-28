# -*- coding: utf-8 -*-
"""
Seisei Database Router
Routes requests to the correct database based on:
1. X-Odoo-dbfilter header (set by Traefik/nginx)
2. Subdomain pattern (fallback)
3. Query parameter db= (user override)

FIXED: Removed /web and /web/login overrides that were breaking login functionality.
The database is locked via odoo.conf (db_name = ten_testodoo).
"""
import re
import logging
from werkzeug.utils import redirect as http_redirect
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)

# Database mapping for special domains
DOMAIN_DB_MAP = {
    "demo.nagashiro.top": "ten_testodoo",
    "testodoo.seisei.tokyo": "ten_testodoo",
}

def get_db_from_host(host):
    """
    Determine database name from host.
    """
    if not host:
        return None

    host = host.split(":")[0].lower()

    # Check X-Odoo-dbfilter header first
    dbfilter_header = request.httprequest.headers.get("X-Odoo-dbfilter")
    if dbfilter_header:
        _logger.debug(f"DB from X-Odoo-dbfilter header: {dbfilter_header}")
        return dbfilter_header

    # Check domain mapping
    if host in DOMAIN_DB_MAP:
        db_name = DOMAIN_DB_MAP[host]
        _logger.debug(f"DB from domain mapping: {host} -> {db_name}")
        return db_name

    # Check subdomain pattern
    match = re.match(r"^([a-z0-9]+)\.erp\.seisei\.tokyo$", host)
    if match:
        subdomain = match.group(1)
        db_name = f"ten_{subdomain}"
        _logger.debug(f"DB from subdomain pattern: {subdomain} -> {db_name}")
        return db_name

    return None


class DatabaseRouter(http.Controller):

    @http.route("/web/database/selector", type="http", auth="none", csrf=False)
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
                return http_redirect(f"/web?db={db_name}", code=303)

        except Exception as e:
            _logger.exception(f"Database router error: {e}")

        return Response(
            "<html><body><h1>Select Database</h1></body></html>",
            content_type="text/html"
        )

    # NOTE: /web and /web/login routes REMOVED - let Odoo handle them natively.
    # The database is locked via odoo.conf (db_name = ten_testodoo).

    @http.route("/odoo", type="http", auth="none", csrf=False)
    def odoo_redirect(self, **kwargs):
        """
        Intercept /odoo and redirect to /web.
        """
        try:
            db_name = get_db_from_host(request.httprequest.host)
            if db_name:
                return http_redirect(f"/web?db={db_name}", code=303)
            return http_redirect("/web", code=303)
        except Exception as e:
            _logger.exception(f"Database router /odoo error: {e}")
            return http_redirect("/web", code=303)
