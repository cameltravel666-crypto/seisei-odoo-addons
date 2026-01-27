# -*- coding: utf-8 -*-
import re
import logging
from werkzeug.utils import redirect
from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)

class DatabaseRouter(http.Controller):

    @http.route('/web/database/selector', type='http', auth='none', csrf=False)
    def database_selector_redirect(self, **kwargs):
        """
        Intercept database selector and auto-redirect based on subdomain.
        Example: 00000001.erp.seisei.tokyo -> redirect to /web?db=ten_00000001
        """
        try:
            host = request.httprequest.host
            _logger.info(f"Database router: host = {host}")
            
            # Extract subdomain from host
            match = re.match(r'^([a-z0-9]+)\.erp\.seisei\.tokyo', host)
            if match:
                subdomain = match.group(1)
                db_name = f"ten_{subdomain}"
                _logger.info(f"Database router: redirecting to db = {db_name}")
                return redirect(f'/web?db={db_name}', code=303)
        except Exception as e:
            _logger.exception(f"Database router error: {e}")
        
        # Fall through to default behavior
        return Response(
            "<html><body><h1>Select Database</h1></body></html>",
            content_type='text/html'
        )
