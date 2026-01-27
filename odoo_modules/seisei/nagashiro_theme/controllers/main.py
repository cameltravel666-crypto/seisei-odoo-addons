# -*- coding: utf-8 -*-

from odoo import http
from odoo.http import request


class SeiseiThemeController(http.Controller):
    
    @http.route('/nagashiro_theme/logo', type='http', auth='none', methods=['GET'])
    def logo(self):
        """Return custom logo for Nagashiro"""
        # Return default logo path, can be customized later
        return request.redirect('/web/static/src/img/logo.png', code=302)

