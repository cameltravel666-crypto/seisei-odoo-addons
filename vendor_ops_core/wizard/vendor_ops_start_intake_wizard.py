# -*- coding: utf-8 -*-

import json
import logging
from datetime import datetime
from odoo import models, fields, api
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class VendorOpsStartIntakeWizard(models.TransientModel):
    _name = 'vendor.ops.start.intake.wizard'
    _description = 'Start Intake Wizard'
    
    tenant_id = fields.Many2one(
        'vendor.ops.tenant',
        string='Tenant',
        required=True,
        default=lambda self: self._default_tenant_id()
    )
    tenant_code = fields.Char(
        string='Tenant Code',
        related='tenant_id.code',
        readonly=True
    )
    store_code = fields.Char(
        string='Store Code',
        required=True,
        help='Store code (e.g., S001)'
    )
    effective_month = fields.Char(
        string='Effective Month',
        required=True,
        default=lambda self: self._default_effective_month(),
        help='Format: YYYY-MM (e.g., 2026-01)'
    )
    note = fields.Text(string='Note')
    
    # Output fields (readonly)
    client_record_url = fields.Char(
        string='Client Record URL',
        readonly=True,
        help='Notion URL for client intake record (send to client)'
    )
    notion_pack_url = fields.Char(
        string='Notion Pack URL',
        readonly=True,
        help='Main link to Notion pack page'
    )
    bridge_batch_id = fields.Char(
        string='Bridge Batch ID',
        readonly=True
    )
    notion_batch_page_id = fields.Char(
        string='Notion Batch Page ID',
        readonly=True
    )
    
    batch_id = fields.Many2one(
        'vendor.ops.intake.batch',
        string='Created Batch',
        readonly=True
    )
    
    @api.model
    def _default_tenant_id(self):
        """Get tenant_id from context."""
        return self.env.context.get('default_tenant_id') or self.env.context.get('active_id')
    
    @api.model
    def _default_effective_month(self):
        """Default to current month in YYYY-MM format."""
        now = datetime.now()
        return now.strftime('%Y-%m')
    
    @api.constrains('effective_month')
    def _check_effective_month_format(self):
        """Validate effective_month format."""
        for record in self:
            if record.effective_month:
                import re
                if not re.match(r'^\d{4}-\d{2}$', record.effective_month):
                    raise UserError('Effective Month must be in format YYYY-MM (e.g., 2026-01)')
    
    def action_start_intake(self):
        """Start intake process - create batch and call Bridge API."""
        self.ensure_one()
        
        if not self.tenant_id or not self.tenant_id.code:
            raise UserError('Tenant code is required. Please ensure tenant has a code.')
        
        if not self.store_code:
            raise UserError('Store Code is required.')
        
        if not self.effective_month:
            raise UserError('Effective Month is required.')
        
        # Validate effective_month format
        import re
        if not re.match(r'^\d{4}-\d{2}$', self.effective_month):
            raise UserError('Effective Month must be in format YYYY-MM (e.g., 2026-01)')
        
        tenant_code = self.tenant_id.code
        
        # Check if batch already exists (idempotency)
        existing_batch = self.env['vendor.ops.intake.batch'].search([
            ('tenant_id', '=', self.tenant_id.id),
            ('store_code', '=', self.store_code),
            ('effective_month', '=', self.effective_month),
        ], limit=1)
        
        if existing_batch and existing_batch.bridge_batch_id:
            # Batch exists and has bridge_batch_id - return existing
            _logger.info(f"Batch already exists: {existing_batch.id} with bridge_batch_id: {existing_batch.bridge_batch_id}")
            return {
                'type': 'ir.actions.act_window',
                'name': 'Intake Batch',
                'res_model': 'vendor.ops.intake.batch',
                'res_id': existing_batch.id,
                'view_mode': 'form',
                'target': 'current',
            }
        
        # Create or update batch record
        if existing_batch:
            batch = existing_batch
            batch.write({
                'note': self.note or batch.note,
            })
        else:
            batch = self.env['vendor.ops.intake.batch'].create({
                'tenant_id': self.tenant_id.id,
                'store_code': self.store_code,
                'effective_month': self.effective_month,
                'status': 'collecting',
                'note': self.note,
            })
        
        # Call Bridge API
        try:
            from ..services.bridge_client import BridgeClient
            bridge = BridgeClient(self.env)
            
            _logger.info(f"Calling Bridge API to create batch: tenant={tenant_code}, store={self.store_code}, month={self.effective_month}")
            
            response = bridge.create_intake_batch(
                tenant_code=tenant_code,
                store_code=self.store_code,
                effective_month=self.effective_month,
                note=self.note
            )
            
            # Log full response for debugging
            _logger.info(f"Bridge API response: {json.dumps(response, ensure_ascii=False, default=str)}")
            
            # Check for API errors first
            if not response.get('ok', True):
                error_msg = response.get('error') or response.get('message') or 'Unknown error'
                trace_id = response.get('traceId') or response.get('trace_id') or response.get('request_id')
                error_full = error_msg
                if trace_id:
                    error_full += f" [Trace: {trace_id}]"
                batch.write({
                    'last_error': error_full,
                    'bridge_trace_id': trace_id or False,
                    'status': 'draft',
                })
                batch.message_post(
                    body=f"Start Intake failed: {error_full}",
                    subject='Start Intake Error',
                    message_type='notification'
                )
                raise UserError(f"Bridge API Error: {error_msg}")
            
            # Map response fields flexibly (handle different field names)
            batch_id = (
                response.get('bridge_batch_id') or
                response.get('batch_id') or
                response.get('id')
            )
            client_url = (
                response.get('client_record_url') or
                response.get('client_url')
            )
            pack_url = (
                response.get('notion_pack_url') or
                response.get('pack_url')
            )
            notion_internal_page_id = response.get('notion_internal_page_id')
            notion_batch_page_id = (
                response.get('notion_batch_page_id') or
                response.get('notion_page_id')
            )
            # Pack-related fields (required for Pull)
            notion_pack_page_id = response.get('notion_pack_page_id')
            pack_databases = response.get('pack_databases') or response.get('notion_pack_databases_json')
            meta_database_id = response.get('meta_database_id') or response.get('notion_pack_meta_database_id')

            trace_id_raw = response.get('traceId') or response.get('trace_id') or response.get('request_id')
            # Ensure trace_id is string (handle dict case)
            if trace_id_raw:
                if isinstance(trace_id_raw, dict):
                    trace_id = json.dumps(trace_id_raw, ensure_ascii=False, default=str)
                elif not isinstance(trace_id_raw, str):
                    trace_id = str(trace_id_raw)
                else:
                    trace_id = trace_id_raw
            else:
                trace_id = False

            if not batch_id:
                raise UserError(f"Bridge API did not return batch_id. Response: {json.dumps(response, default=str)[:500]}")

            # Serialize pack_databases to JSON string if it's a dict
            pack_databases_json = False
            if pack_databases:
                if isinstance(pack_databases, dict):
                    pack_databases_json = json.dumps(pack_databases, ensure_ascii=False)
                elif isinstance(pack_databases, str):
                    pack_databases_json = pack_databases
                else:
                    pack_databases_json = json.dumps(pack_databases, ensure_ascii=False, default=str)

            # Update batch record with all fields from Bridge response
            update_vals = {
                'bridge_batch_id': batch_id,
                'client_record_url': client_url or False,
                'notion_pack_url': pack_url or False,
                'notion_internal_page_id': notion_internal_page_id or False,
                'notion_batch_page_id': notion_batch_page_id or False,
                'notion_pack_page_id': notion_pack_page_id or False,
                'notion_pack_databases_json': pack_databases_json or False,
                'notion_pack_meta_database_id': meta_database_id or False,
                'status': 'collecting',
                'last_error': False,  # Clear any previous errors
            }
            if trace_id:
                # Truncate trace_id if too long
                update_vals['bridge_trace_id'] = trace_id[:255] if len(trace_id) > 255 else trace_id

            batch.write(update_vals)
            
            # Update wizard fields for display
            self.write({
                'bridge_batch_id': batch_id,
                'client_record_url': client_url or False,
                'notion_pack_url': pack_url or False,
                'notion_batch_page_id': notion_batch_page_id or False,
                'batch_id': batch.id,
            })
            
            # Check for warnings from response (e.g., Notion not configured)
            warnings = response.get('warnings', [])
            if warnings:
                warning_msgs = []
                for w in warnings:
                    if isinstance(w, dict):
                        warning_msgs.append(f"{w.get('stage', 'unknown')}: {w.get('error', 'unknown error')}")
                    else:
                        warning_msgs.append(str(w))
                batch.message_post(
                    body=f"Warnings from Bridge API:\n" + "\n".join(warning_msgs),
                    subject='Start Intake Warnings',
                    message_type='notification'
                )

            # If Notion fields are null, log info message
            if not client_url and not notion_internal_page_id:
                batch.message_post(
                    body="Notion not configured or returned null. Client record URL not available.",
                    subject='Notion Not Configured',
                    message_type='notification'
                )

            # Post success message to chatter with all relevant info
            message_lines = [
                f"Intake batch created successfully via Bridge API.",
                f"Bridge Batch ID: {batch_id}",
            ]
            if client_url:
                message_lines.append(f"Client Record URL (发给客户的链接): {client_url}")
            else:
                message_lines.append("Client Record URL: Not available (Notion not configured)")
            if notion_internal_page_id:
                message_lines.append(f"Notion Internal Page ID: {notion_internal_page_id}")
            if pack_url:
                message_lines.append(f"Notion Pack URL: {pack_url}")
            if notion_pack_page_id:
                message_lines.append(f"Notion Pack Page ID: {notion_pack_page_id}")
            if pack_databases_json:
                message_lines.append(f"Pack Databases: {pack_databases_json[:200]}...")
            if meta_database_id:
                message_lines.append(f"Meta Database ID: {meta_database_id}")
            if trace_id:
                message_lines.append(f"Trace ID: {trace_id}")
            
            batch.message_post(
                body="\n".join(message_lines),
                subject='Batch Created'
            )
            
            # Return action to open batch form with reload to ensure fields are displayed
            return {
                'type': 'ir.actions.act_window',
                'name': 'Intake Batch',
                'res_model': 'vendor.ops.intake.batch',
                'res_id': batch.id,
                'view_mode': 'form',
                'target': 'current',
                'context': self.env.context,  # Preserve context for proper reload
            }
            
        except UserError:
            raise
        except Exception as e:
            _logger.exception(f"Error creating intake batch: {e}")
            raise UserError(f"Failed to create intake batch: {str(e)}")
    
    def action_open_client_url(self):
        """Open client record URL in new window."""
        self.ensure_one()
        if not self.client_record_url:
            raise UserError('Client Record URL is not available.')
        return {
            'type': 'ir.actions.act_url',
            'url': self.client_record_url,
            'target': 'new',
        }
    
    def action_open_pack_url(self):
        """Open Notion pack URL in new window."""
        self.ensure_one()
        if not self.notion_pack_url:
            raise UserError('Notion Pack URL is not available.')
        return {
            'type': 'ir.actions.act_url',
            'url': self.notion_pack_url,
            'target': 'new',
        }

