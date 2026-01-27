# -*- coding: utf-8 -*-
import re
from odoo import http
from odoo.http import request

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

class SeiseiContactApi(http.Controller):

    # type=json 会自动解析 JSON body，并且不会走你现在遇到的 CSRF 流程
    @http.route("/api/v1/contact/submit", type="json", auth="public", methods=["POST"], csrf=False)
    def submit(self, **payload):
        # payload 已经是 dict
        name = (payload.get("name") or "").strip()
        email = (payload.get("email") or "").strip()
        subject = (payload.get("subject") or "").strip()
        message = (payload.get("message") or "").strip()
        phone = (payload.get("phone") or "").strip()

        if not name or not email or not message:
            return {"ok": False, "error": "missing_fields"}
        if not EMAIL_RE.match(email):
            return {"ok": False, "error": "invalid_email"}

        lead = request.env["crm.lead"].sudo().create({
            "name": "[Website] %s" % (subject or "Contact"),
            "contact_name": name,
            "email_from": email,
            "phone": phone or False,
            "description": message,
        })

        notify_to = request.env["ir.config_parameter"].sudo().get_param(
            "seisei.contact_notify_to", default="ops@seisei.tokyo"
        )

        mail_error = None
        try:
            mail = request.env["mail.mail"].sudo().create({
                "subject": ("New website contact: %s" % (subject or "")).strip(),
                "email_to": notify_to,
                "body_html": (
                    f"<p><b>Name:</b> {name}</p>"
                    f"<p><b>Email:</b> {email}</p>"
                    f"<p><b>Phone:</b> {phone}</p>"
                    f"<p><b>Subject:</b> {subject}</p>"
                    f"<p><b>Message:</b></p><pre>{message}</pre>"
                    f"<p><b>Lead ID:</b> {lead.id}</p>"
                ),
            })
            mail.send()
        except Exception as e:
            request.env.cr.rollback()
            mail_error = str(e)

        return {"ok": True, "lead_id": lead.id, "mail_sent": (mail_error is None), "mail_error": mail_error}


    @http.route("/seisei/ping", type="http", auth="public", methods=["GET"], csrf=False)
    def ping(self, **kw):
        return request.make_response("pong", [("Content-Type","text/plain")])
