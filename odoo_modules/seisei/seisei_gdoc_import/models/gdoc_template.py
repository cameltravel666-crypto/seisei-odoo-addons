# -*- coding: utf-8 -*-
import json
import logging

from odoo import api, fields, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class GdocTemplate(models.Model):
    """Google Doc Import Template Configuration."""
    _name = 'seisei.gdoc.template'
    _description = 'Google Doc Import Template'
    _order = 'name'

    name = fields.Char(string='Template Name', required=True)
    doc_id = fields.Char(
        string='Google Doc ID',
        required=True,
        help='The document ID from the Google Doc URL. '
             'Example: For https://docs.google.com/document/d/ABC123/edit, the ID is ABC123'
    )
    active = fields.Boolean(default=True)
    notes = fields.Text(string='Notes')

    # Mapping configuration
    mapping_json = fields.Text(
        string='Field Mapping (JSON)',
        default='{}',
        help='JSON mapping configuration for sections to Odoo models'
    )

    # Section handlers configuration
    section_config = fields.Text(
        string='Section Configuration',
        default=lambda self: json.dumps(self._default_section_config(), indent=2),
        help='JSON configuration for each section handler'
    )

    # Related import runs
    import_run_ids = fields.One2many(
        'seisei.gdoc.import.run',
        'template_id',
        string='Import Runs'
    )
    import_run_count = fields.Integer(
        string='Import Runs',
        compute='_compute_import_run_count'
    )

    # Last fetch info
    last_fetch_date = fields.Datetime(string='Last Fetched', readonly=True)
    last_fetch_sections = fields.Text(string='Sections Found', readonly=True)

    @api.depends('import_run_ids')
    def _compute_import_run_count(self):
        for record in self:
            record.import_run_count = len(record.import_run_ids)

    def _default_section_config(self):
        """Default section configuration."""
        return {
            'partners': {
                'model': 'res.partner',
                'enabled': True,
                'key_fields': ['email', 'name'],
                'field_mapping': {
                    'name': 'name',
                    'email': 'email',
                    'phone': 'phone',
                    'mobile': 'mobile',
                    'street': 'street',
                    'city': 'city',
                    'zip': 'zip',
                    'country': 'country_id',
                    'vat': 'vat',
                    'lang': 'lang',
                    'is_company': 'is_company',
                    'customer': 'customer_rank',
                    'supplier': 'supplier_rank',
                }
            },
            'products': {
                'model': 'product.template',
                'enabled': True,
                'key_fields': ['default_code'],
                'field_mapping': {
                    'name': 'name',
                    'sku': 'default_code',
                    'default_code': 'default_code',
                    'description': 'description',
                    'price': 'list_price',
                    'list_price': 'list_price',
                    'cost': 'standard_price',
                    'standard_price': 'standard_price',
                    'type': 'detailed_type',
                    'barcode': 'barcode',
                    'uom': 'uom_id',
                }
            },
            'contacts': {
                'model': 'res.partner',
                'enabled': True,
                'key_fields': ['email', 'parent_id'],
                'field_mapping': {
                    'name': 'name',
                    'email': 'email',
                    'phone': 'phone',
                    'mobile': 'mobile',
                    'function': 'function',
                    'parent_company': 'parent_id',
                }
            }
        }

    def action_fetch_preview(self):
        """Fetch document and preview sections."""
        self.ensure_one()

        service = self.env['seisei.gdoc.service']
        document = service.fetch_document(self.doc_id)
        sections = service.parse_document_tables(document)

        # Update template info
        section_summary = []
        for section_name, rows in sections.items():
            section_summary.append(f"{section_name}: {len(rows)} rows")

        self.write({
            'last_fetch_date': fields.Datetime.now(),
            'last_fetch_sections': '\n'.join(section_summary) if section_summary else 'No tables found',
        })

        # Create preview message
        message = _('Document fetched successfully!\n\nSections found:\n%s') % '\n'.join(section_summary)

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Preview Complete'),
                'message': message,
                'type': 'success',
                'sticky': True,
            }
        }

    def action_open_import_wizard(self):
        """Open the import wizard for this template."""
        self.ensure_one()
        return {
            'name': _('Import from Google Doc'),
            'type': 'ir.actions.act_window',
            'res_model': 'seisei.gdoc.import.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_template_id': self.id,
            }
        }

    def action_view_import_runs(self):
        """View import runs for this template."""
        self.ensure_one()
        return {
            'name': _('Import Runs'),
            'type': 'ir.actions.act_window',
            'res_model': 'seisei.gdoc.import.run',
            'view_mode': 'tree,form',
            'domain': [('template_id', '=', self.id)],
            'context': {'default_template_id': self.id},
        }
