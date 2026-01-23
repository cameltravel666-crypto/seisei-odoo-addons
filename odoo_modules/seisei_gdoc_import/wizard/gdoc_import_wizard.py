# -*- coding: utf-8 -*-
import json

from odoo import api, fields, models, _
from odoo.exceptions import UserError


class GdocImportWizard(models.TransientModel):
    """Wizard for Google Doc Import."""
    _name = 'seisei.gdoc.import.wizard'
    _description = 'Google Doc Import Wizard'

    template_id = fields.Many2one(
        'seisei.gdoc.template',
        string='Template',
        required=True,
    )
    state = fields.Selection([
        ('select', 'Select Template'),
        ('preview', 'Preview'),
        ('validate', 'Validate'),
        ('import', 'Import'),
        ('done', 'Done'),
    ], default='select', string='State')

    # Import run created by this wizard
    run_id = fields.Many2one(
        'seisei.gdoc.import.run',
        string='Import Run',
        readonly=True,
    )

    # Preview data display
    preview_html = fields.Html(
        string='Preview',
        compute='_compute_preview_html',
        sanitize=False,
    )
    validation_html = fields.Html(
        string='Validation Results',
        compute='_compute_validation_html',
        sanitize=False,
    )
    stats_html = fields.Html(
        string='Import Statistics',
        compute='_compute_stats_html',
        sanitize=False,
    )

    @api.depends('run_id', 'run_id.raw_data_json')
    def _compute_preview_html(self):
        for wizard in self:
            if wizard.run_id and wizard.run_id.raw_data_json:
                try:
                    data = json.loads(wizard.run_id.raw_data_json)
                    html = self._render_data_html(data)
                    wizard.preview_html = html
                except:
                    wizard.preview_html = '<p>Error parsing data</p>'
            else:
                wizard.preview_html = '<p>No data available. Click "Fetch" to load data.</p>'

    @api.depends('run_id', 'run_id.validation_errors_json')
    def _compute_validation_html(self):
        for wizard in self:
            if wizard.run_id and wizard.run_id.validation_errors_json:
                try:
                    errors = json.loads(wizard.run_id.validation_errors_json)
                    if errors:
                        html = '<div class="alert alert-danger"><ul>'
                        for err in errors[:20]:  # Show first 20 errors
                            html += f'<li>Row {err.get("row")}: {err.get("message")}</li>'
                        if len(errors) > 20:
                            html += f'<li>... and {len(errors) - 20} more errors</li>'
                        html += '</ul></div>'
                        wizard.validation_html = html
                    else:
                        wizard.validation_html = '<div class="alert alert-success">All validations passed!</div>'
                except:
                    wizard.validation_html = ''
            else:
                wizard.validation_html = ''

    @api.depends('run_id', 'run_id.stats_json')
    def _compute_stats_html(self):
        for wizard in self:
            if wizard.run_id and wizard.run_id.stats_json:
                try:
                    stats = json.loads(wizard.run_id.stats_json)
                    html = f'''
                    <div class="row">
                        <div class="col-md-3">
                            <div class="card text-center">
                                <div class="card-body">
                                    <h3>{stats.get("total", 0)}</h3>
                                    <p>Total Rows</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-success text-white">
                                <div class="card-body">
                                    <h3>{stats.get("created", 0)}</h3>
                                    <p>Created</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-info text-white">
                                <div class="card-body">
                                    <h3>{stats.get("updated", 0)}</h3>
                                    <p>Updated</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-danger text-white">
                                <div class="card-body">
                                    <h3>{stats.get("errors", 0)}</h3>
                                    <p>Errors</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    '''
                    wizard.stats_html = html
                except:
                    wizard.stats_html = ''
            else:
                wizard.stats_html = ''

    def _render_data_html(self, data):
        """Render data as HTML tables."""
        html = ''
        for section_name, rows in data.items():
            if not rows:
                continue
            html += f'<h4>{section_name} ({len(rows)} rows)</h4>'
            html += '<table class="table table-sm table-bordered">'

            # Headers
            headers = list(rows[0].keys()) if rows else []
            html += '<thead><tr>'
            for h in headers:
                html += f'<th>{h}</th>'
            html += '</tr></thead>'

            # Data (show first 10 rows)
            html += '<tbody>'
            for row in rows[:10]:
                html += '<tr>'
                for h in headers:
                    val = row.get(h, '')
                    html += f'<td>{val[:50]}{"..." if len(str(val)) > 50 else ""}</td>'
                html += '</tr>'
            if len(rows) > 10:
                html += f'<tr><td colspan="{len(headers)}" class="text-muted text-center">... and {len(rows) - 10} more rows</td></tr>'
            html += '</tbody></table>'

        return html or '<p>No tables found in document</p>'

    def action_fetch(self):
        """Fetch data from Google Doc."""
        self.ensure_one()

        if not self.template_id:
            raise UserError(_('Please select a template.'))

        # Create import run
        run = self.env['seisei.gdoc.import.run'].create({
            'template_id': self.template_id.id,
        })
        run.action_fetch()

        self.write({
            'run_id': run.id,
            'state': 'preview',
        })

        return self._reopen_wizard()

    def action_validate(self):
        """Validate fetched data."""
        self.ensure_one()

        if not self.run_id:
            raise UserError(_('No import run found. Please fetch data first.'))

        self.run_id.action_validate()

        self.write({
            'state': 'validate',
        })

        return self._reopen_wizard()

    def action_import(self):
        """Execute the import."""
        self.ensure_one()

        if not self.run_id:
            raise UserError(_('No import run found.'))

        self.run_id.action_import()

        self.write({
            'state': 'done',
        })

        return self._reopen_wizard()

    def action_view_logs(self):
        """View import logs."""
        self.ensure_one()
        return self.run_id.action_view_logs()

    def _reopen_wizard(self):
        """Reopen wizard with updated state."""
        return {
            'name': _('Import from Google Doc'),
            'type': 'ir.actions.act_window',
            'res_model': 'seisei.gdoc.import.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
