# -*- coding: utf-8 -*-
"""
Seisei Database Router - Enhanced with global database context
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


# Monkey-patch Odoo's get_db_router to use our custom logic
_original_db_router = http.db_filter

def custom_db_filter(dbs, host=None, httprequest=None):
    """
    Custom database filter that respects X-Odoo-dbfilter header and domain mapping.
    """
    # Handle both calling conventions: (dbs, host) and (dbs, httprequest=xxx, host=xxx)
    if not httprequest:
        httprequest = request.httprequest if hasattr(request, 'httprequest') else None

    # If host is not provided, try to get it from httprequest
    if not host and httprequest and hasattr(httprequest, 'host'):
        host = httprequest.host

    # Try to get database from our custom logic
    db_name = None
    try:
        # Check X-Odoo-dbfilter header first
        dbfilter_header = None
        if httprequest and hasattr(httprequest, 'headers'):
            dbfilter_header = httprequest.headers.get("X-Odoo-dbfilter")
        if dbfilter_header:
            db_name = dbfilter_header
            _logger.debug(f"[custom_db_filter] Using X-Odoo-dbfilter header: {db_name}")

        # Check domain mapping
        if not db_name and host:
            host_clean = host.split(":")[0].lower()
            if host_clean in DOMAIN_DB_MAP:
                db_name = DOMAIN_DB_MAP[host_clean]
                _logger.debug(f"[custom_db_filter] Using domain mapping: {host_clean} -> {db_name}")

        # Check subdomain pattern
        if not db_name and host:
            host_clean = host.split(":")[0].lower()
            match = re.match(r"^([a-z0-9]+)\.erp\.seisei\.tokyo$", host_clean)
            if match:
                subdomain = match.group(1)
                db_name = f"ten_{subdomain}"
                _logger.debug(f"[custom_db_filter] Using subdomain pattern: {subdomain} -> {db_name}")

        # If we found a database and it exists in the list, return it
        if db_name and db_name in dbs:
            _logger.debug(f"[custom_db_filter] Selected database: {db_name}")
            return [db_name]

    except Exception as e:
        _logger.exception(f"[custom_db_filter] Error in custom database filter: {e}")

    # Fall back to original Odoo logic
    return _original_db_router(dbs, host=host)


# Apply the monkey patch
http.db_filter = custom_db_filter


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
