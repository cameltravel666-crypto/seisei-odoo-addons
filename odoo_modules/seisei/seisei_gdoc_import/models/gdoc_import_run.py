# -*- coding: utf-8 -*-
import json
import logging

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)


class GdocImportRun(models.Model):
    """Google Doc Import Run - tracks each import execution."""
    _name = 'seisei.gdoc.import.run'
    _description = 'Google Doc Import Run'
    _order = 'create_date desc'

    name = fields.Char(string='Run Name', compute='_compute_name', store=True)
    template_id = fields.Many2one(
        'seisei.gdoc.template',
        string='Template',
        required=True,
        ondelete='cascade'
    )

    state = fields.Selection([
        ('draft', 'Draft'),
        ('fetched', 'Fetched'),
        ('validated', 'Validated'),
        ('imported', 'Imported'),
        ('failed', 'Failed'),
    ], default='draft', string='State', readonly=True)

    run_by = fields.Many2one(
        'res.users',
        string='Run By',
        default=lambda self: self.env.user,
        readonly=True
    )
    run_at = fields.Datetime(string='Run At', readonly=True)

    # Data storage
    raw_data_json = fields.Text(string='Raw Data (JSON)', readonly=True)
    preview_json = fields.Text(string='Preview Data (JSON)', readonly=True)
    validation_errors_json = fields.Text(string='Validation Errors (JSON)', readonly=True)

    # Statistics
    stats_json = fields.Text(string='Statistics (JSON)', readonly=True)
    total_rows = fields.Integer(string='Total Rows', compute='_compute_stats')
    created_count = fields.Integer(string='Created', compute='_compute_stats')
    updated_count = fields.Integer(string='Updated', compute='_compute_stats')
    skipped_count = fields.Integer(string='Skipped', compute='_compute_stats')
    error_count = fields.Integer(string='Errors', compute='_compute_stats')

    # Log lines
    log_ids = fields.One2many(
        'seisei.gdoc.import.log',
        'run_id',
        string='Log Lines'
    )
    log_count = fields.Integer(string='Log Entries', compute='_compute_log_count')

    @api.depends('template_id', 'create_date')
    def _compute_name(self):
        for run in self:
            if run.template_id and run.create_date:
                run.name = f"{run.template_id.name} - {run.create_date.strftime('%Y-%m-%d %H:%M')}"
            else:
                run.name = _('New Import Run')

    @api.depends('stats_json')
    def _compute_stats(self):
        for run in self:
            stats = {}
            if run.stats_json:
                try:
                    stats = json.loads(run.stats_json)
                except:
                    pass
            run.total_rows = stats.get('total', 0)
            run.created_count = stats.get('created', 0)
            run.updated_count = stats.get('updated', 0)
            run.skipped_count = stats.get('skipped', 0)
            run.error_count = stats.get('errors', 0)

    @api.depends('log_ids')
    def _compute_log_count(self):
        for run in self:
            run.log_count = len(run.log_ids)

    def action_fetch(self):
        """Fetch data from Google Doc."""
        self.ensure_one()

        service = self.env['seisei.gdoc.service']
        document = service.fetch_document(self.template_id.doc_id)
        sections = service.parse_document_tables(document)

        self.write({
            'state': 'fetched',
            'raw_data_json': json.dumps(sections, ensure_ascii=False, indent=2),
        })

        self._log('info', None, None, _('Document fetched successfully. Found %d sections.') % len(sections))

        return True

    def action_validate(self):
        """Validate fetched data."""
        self.ensure_one()

        if not self.raw_data_json:
            raise UserError(_('No data to validate. Please fetch the document first.'))

        raw_data = json.loads(self.raw_data_json)
        section_config = json.loads(self.template_id.section_config)

        preview = {}
        errors = []
        total_rows = 0

        for section_name, rows in raw_data.items():
            # Find matching handler
            handler_name = self._match_section_handler(section_name, section_config)
            if not handler_name:
                self._log('warning', None, None, _('No handler found for section: %s') % section_name)
                continue

            handler_config = section_config.get(handler_name, {})
            if not handler_config.get('enabled', True):
                continue

            model_name = handler_config.get('model')
            if not model_name:
                continue

            # Validate rows
            section_preview = []
            for i, row in enumerate(rows):
                total_rows += 1
                row_errors = self._validate_row(row, handler_config, i + 1)
                if row_errors:
                    errors.extend(row_errors)
                section_preview.append({
                    'row_num': i + 1,
                    'data': row,
                    'errors': row_errors,
                })

            preview[section_name] = {
                'handler': handler_name,
                'model': model_name,
                'rows': section_preview,
            }

        self.write({
            'state': 'validated' if not errors else 'draft',
            'preview_json': json.dumps(preview, ensure_ascii=False, indent=2),
            'validation_errors_json': json.dumps(errors, ensure_ascii=False, indent=2) if errors else '[]',
            'stats_json': json.dumps({'total': total_rows, 'validation_errors': len(errors)}),
        })

        if errors:
            self._log('error', None, None, _('Validation failed with %d errors.') % len(errors))
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Validation Failed'),
                    'message': _('%d validation errors found. Please check the logs.') % len(errors),
                    'type': 'danger',
                    'sticky': True,
                }
            }
        else:
            self._log('info', None, None, _('Validation passed. %d rows ready to import.') % total_rows)
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Validation Passed'),
                    'message': _('%d rows ready to import.') % total_rows,
                    'type': 'success',
                    'sticky': False,
                }
            }

    def _match_section_handler(self, section_name, section_config):
        """Match section name to handler."""
        section_lower = section_name.lower()
        for handler_name in section_config.keys():
            if handler_name.lower() in section_lower or section_lower in handler_name.lower():
                return handler_name
        # Common mappings
        mappings = {
            'customer': 'partners',
            'supplier': 'partners',
            'vendor': 'partners',
            'partner': 'partners',
            'product': 'products',
            'item': 'products',
            'contact': 'contacts',
        }
        for keyword, handler in mappings.items():
            if keyword in section_lower:
                return handler
        return None

    def _validate_row(self, row, handler_config, row_num):
        """Validate a single row."""
        errors = []
        model_name = handler_config.get('model')
        field_mapping = handler_config.get('field_mapping', {})
        key_fields = handler_config.get('key_fields', [])

        # Check required key fields
        for key_field in key_fields:
            source_field = None
            for src, dest in field_mapping.items():
                if dest == key_field:
                    source_field = src
                    break
            if source_field and not row.get(source_field):
                # Check if alternative key exists
                has_alternative = False
                for other_key in key_fields:
                    if other_key != key_field:
                        for src, dest in field_mapping.items():
                            if dest == other_key and row.get(src):
                                has_alternative = True
                                break
                if not has_alternative:
                    errors.append({
                        'row': row_num,
                        'field': key_field,
                        'message': _('Missing required field: %s') % key_field
                    })

        return errors

    def action_import(self):
        """Execute the import."""
        self.ensure_one()

        if self.state not in ('validated', 'fetched'):
            raise UserError(_('Please validate the data before importing.'))

        raw_data = json.loads(self.raw_data_json)
        section_config = json.loads(self.template_id.section_config)

        stats = {
            'total': 0,
            'created': 0,
            'updated': 0,
            'skipped': 0,
            'errors': 0,
        }

        try:
            for section_name, rows in raw_data.items():
                handler_name = self._match_section_handler(section_name, section_config)
                if not handler_name:
                    continue

                handler_config = section_config.get(handler_name, {})
                if not handler_config.get('enabled', True):
                    continue

                model_name = handler_config.get('model')
                if not model_name:
                    continue

                self._log('info', model_name, None, _('Processing section: %s (%d rows)') % (section_name, len(rows)))

                for i, row in enumerate(rows):
                    stats['total'] += 1
                    try:
                        result = self._import_row(row, handler_config, i + 1)
                        if result == 'created':
                            stats['created'] += 1
                        elif result == 'updated':
                            stats['updated'] += 1
                        elif result == 'skipped':
                            stats['skipped'] += 1
                    except Exception as e:
                        stats['errors'] += 1
                        self._log('error', model_name, str(row), _('Row %d: %s') % (i + 1, str(e)))

            self.write({
                'state': 'imported',
                'run_at': fields.Datetime.now(),
                'stats_json': json.dumps(stats),
            })

            self._log('info', None, None,
                _('Import completed: %d created, %d updated, %d skipped, %d errors') %
                (stats['created'], stats['updated'], stats['skipped'], stats['errors']))

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Import Complete'),
                    'message': _('Created: %d, Updated: %d, Skipped: %d, Errors: %d') %
                        (stats['created'], stats['updated'], stats['skipped'], stats['errors']),
                    'type': 'success' if stats['errors'] == 0 else 'warning',
                    'sticky': True,
                }
            }

        except Exception as e:
            self.write({
                'state': 'failed',
                'stats_json': json.dumps(stats),
            })
            self._log('error', None, None, _('Import failed: %s') % str(e))
            raise UserError(_('Import failed: %s') % str(e))

    def _import_row(self, row, handler_config, row_num):
        """Import a single row (upsert)."""
        model_name = handler_config.get('model')
        field_mapping = handler_config.get('field_mapping', {})
        key_fields = handler_config.get('key_fields', [])

        Model = self.env[model_name].sudo()

        # Build values dict
        vals = {}
        for source_field, dest_field in field_mapping.items():
            value = row.get(source_field)
            if value:
                vals[dest_field] = self._convert_value(value, dest_field, model_name)

        if not vals:
            return 'skipped'

        # Build domain for finding existing record
        domain = []
        for key_field in key_fields:
            if key_field in vals and vals[key_field]:
                domain.append((key_field, '=', vals[key_field]))

        if not domain:
            # No key fields, cannot upsert - just create
            Model.create(vals)
            self._log('info', model_name, vals.get('name', ''), _('Row %d: Created new record') % row_num)
            return 'created'

        # Try to find existing record
        existing = Model.search(domain, limit=1)

        if existing:
            existing.write(vals)
            self._log('info', model_name, vals.get('name', ''), _('Row %d: Updated existing record (ID: %d)') % (row_num, existing.id))
            return 'updated'
        else:
            record = Model.create(vals)
            self._log('info', model_name, vals.get('name', ''), _('Row %d: Created new record (ID: %d)') % (row_num, record.id))
            return 'created'

    def _convert_value(self, value, field_name, model_name):
        """Convert string value to appropriate type."""
        if not value:
            return False

        Model = self.env[model_name]
        field = Model._fields.get(field_name)

        if not field:
            return value

        # Handle Many2one fields
        if field.type == 'many2one':
            return self._resolve_many2one(value, field.comodel_name, field_name)

        # Handle boolean
        if field.type == 'boolean':
            return value.lower() in ('true', 'yes', '1', 'y')

        # Handle integer
        if field.type == 'integer':
            try:
                return int(float(value))
            except:
                return 0

        # Handle float/monetary
        if field.type in ('float', 'monetary'):
            try:
                # Remove currency symbols and commas
                clean_value = value.replace(',', '').replace('$', '').replace('¥', '').replace('€', '').strip()
                return float(clean_value)
            except:
                return 0.0

        return value

    def _resolve_many2one(self, value, comodel_name, field_name):
        """Resolve Many2one field value."""
        if not value:
            return False

        CoModel = self.env[comodel_name].sudo()

        # Special handling for common fields
        if comodel_name == 'res.country':
            # Try code first, then name
            country = CoModel.search(['|', ('code', '=ilike', value), ('name', '=ilike', value)], limit=1)
            return country.id if country else False

        if comodel_name == 'res.lang':
            lang = CoModel.search([('code', '=', value)], limit=1)
            if not lang:
                lang = CoModel.search([('name', 'ilike', value)], limit=1)
            return lang.id if lang else False

        if comodel_name == 'uom.uom':
            uom = CoModel.search(['|', ('name', '=ilike', value), ('name', 'ilike', value)], limit=1)
            return uom.id if uom else False

        if comodel_name == 'res.partner':
            # For parent company reference
            partner = CoModel.search([('name', '=ilike', value), ('is_company', '=', True)], limit=1)
            return partner.id if partner else False

        # Generic: try by name
        record = CoModel.search([('name', '=ilike', value)], limit=1)
        return record.id if record else False

    def _log(self, level, model, external_key, message):
        """Create a log entry."""
        self.env['seisei.gdoc.import.log'].sudo().create({
            'run_id': self.id,
            'level': level,
            'model': model or '',
            'external_key': external_key or '',
            'message': message,
        })

    def action_view_logs(self):
        """View log entries for this run."""
        self.ensure_one()
        return {
            'name': _('Import Logs'),
            'type': 'ir.actions.act_window',
            'res_model': 'seisei.gdoc.import.log',
            'view_mode': 'tree,form',
            'domain': [('run_id', '=', self.id)],
        }
