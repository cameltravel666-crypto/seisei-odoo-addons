from odoo import http
from odoo.http import request
import odoo

class WebClientPatch(http.Controller):
    @http.route("/web/webclient/version_info", type="http", auth="none", methods=["GET", "POST"])
    def version_info(self, **kw):
        import json
        result = odoo.service.common.exp_version()
        return request.make_response(
            json.dumps({"jsonrpc": "2.0", "id": None, "result": result}),
            headers=[("Content-Type", "application/json")]
        )
