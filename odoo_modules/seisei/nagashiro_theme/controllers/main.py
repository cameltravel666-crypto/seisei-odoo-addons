# -*- coding: utf-8 -*-

from odoo import http
from odoo.http import request


class SeiseiThemeController(http.Controller):
    
    @http.route('/nagashiro_theme/logo', type='http', auth='none', methods=['GET'])
    def logo(self):
        """Return custom logo for Nagashiro"""
        return request.redirect('/nagashiro_theme/static/src/img/logo.png', code=302)

