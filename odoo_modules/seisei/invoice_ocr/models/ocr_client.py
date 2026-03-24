import logging

from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class OcrClient(models.Model):
    _name = 'ocr.client'
    _description = 'OCR Client'
    _order = 'name'

    name = fields.Char('Client Name', required=True)
    code = fields.Char('Client Code')
    active = fields.Boolean('Active', default=True)
    default_debit_account = fields.Many2one(
        'ocr.account', 'Default Debit Account',
        domain=[('account_type', '=', 'debit'), ('active', '=', True)],
    )
    default_credit_account = fields.Many2one(
        'ocr.account', 'Default Credit Account',
        domain=[('account_type', '=', 'credit'), ('active', '=', True)],
    )
    note = fields.Text('Notes')
    document_ids = fields.One2many('ocr.document', 'client_id', 'Documents')
    document_count = fields.Integer(
        'Document Count', compute='_compute_document_count',
    )
    rule_ids = fields.One2many('ocr.account.rule', 'client_id', 'Learning Rules')
    rule_count = fields.Integer('Rule Count', compute='_compute_document_count')
    vendor_rule_ids = fields.One2many('ocr.vendor.rule', 'client_id', 'Vendor Rules')

    def _compute_document_count(self):
        for rec in self:
            rec.document_count = len(rec.document_ids)
            rec.rule_count = len(rec.rule_ids)

    def action_assign_summaries(self):
        """Assign No.{seq}--{MM/DD}-{seller} summaries to all documents."""
        for client in self:
            docs = self.env['ocr.document'].search([
                ('client_id', '=', client.id),
                ('state', 'in', ('done', 'reviewed')),
                ('invoice_date', '!=', False),
            ], order='invoice_date, id')

            if not docs:
                continue

            seq = 0
            for doc in docs:
                seq += 1
                d = doc.invoice_date
                date_part = f'{d.month}/{d.day}'
                seller = doc.seller_name or ''
                doc.summary = f'No.{seq:04d}--{date_part}-{seller}'

            _logger.info(
                'Assigned summaries No.0001~No.%04d for client %s (%d docs)',
                seq, client.name, seq,
            )

    # ------------------------------------------------------------------
    # Audit & Vendor Rule Generation
    # ------------------------------------------------------------------

    def action_run_audit(self):
        """Recompute audit flags and open audit dashboard for this client."""
        self.ensure_one()
        docs = self.env['ocr.document'].search([
            ('client_id', '=', self.id),
            ('state', 'in', ('done', 'reviewed', 'confirmed')),
        ])
        # Force recompute
        docs._compute_audit_flags()
        flagged = docs.filtered(lambda d: d.audit_flag_count > 0)
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': f'Audit complete: {len(flagged)}/{len(docs)} documents have issues.',
                'type': 'warning' if flagged else 'success',
                'sticky': False,
                'next': {
                    'type': 'ir.actions.act_window',
                    'name': f'監査: {self.name}',
                    'res_model': 'ocr.document',
                    'view_mode': 'list,form',
                    'domain': [('client_id', '=', self.id), ('audit_flag_count', '>', 0)],
                    'context': {'search_default_has_issues': 1},
                },
            },
        }

    def action_generate_vendor_rules(self):
        """Auto-generate vendor rules from seller frequency and tax patterns."""
        self.ensure_one()
        Doc = self.env['ocr.document']
        VendorRule = self.env['ocr.vendor.rule']

        docs = Doc.search([
            ('client_id', '=', self.id),
            ('state', 'in', ('done', 'reviewed', 'confirmed')),
            ('seller_name', '!=', False),
            ('seller_name', '!=', ''),
        ])

        # Group by seller_name
        seller_stats = {}
        for doc in docs:
            name = doc.seller_name.strip()
            if not name:
                continue
            if name not in seller_stats:
                seller_stats[name] = {'count': 0, 'rates': {}}
            seller_stats[name]['count'] += 1
            for line in doc.line_ids:
                rate = line.tax_rate or '10'
                seller_stats[name]['rates'][rate] = (
                    seller_stats[name]['rates'].get(rate, 0) + 1
                )

        created = 0
        for seller, stats in seller_stats.items():
            if stats['count'] < 3:
                continue

            # Check if rule already exists
            existing = VendorRule.search([
                ('client_id', '=', self.id),
                ('vendor_pattern', '=', seller),
            ], limit=1)
            if existing:
                continue

            # Determine dominant tax rate
            force_rate = False
            total_lines = sum(stats['rates'].values())
            if total_lines > 0:
                for rate, cnt in stats['rates'].items():
                    if cnt / total_lines >= 0.8 and rate in ('8', '10'):
                        force_rate = rate
                        break

            VendorRule.create({
                'client_id': self.id,
                'vendor_pattern': seller,
                'priority': 10,
                'force_tax_rate': force_rate,
                'date_era': 'auto',
                'amount_field_is': 'auto',
                'note': f'Auto-generated: {stats["count"]} docs',
            })
            created += 1

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'message': f'{created} vendor rules created from {len(seller_stats)} sellers.',
                'type': 'success',
                'sticky': False,
            },
        }
