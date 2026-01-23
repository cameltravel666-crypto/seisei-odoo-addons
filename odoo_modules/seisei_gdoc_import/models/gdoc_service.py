# -*- coding: utf-8 -*-
import json
import logging
import os

from odoo import api, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False
    _logger.warning("Google API libraries not installed. Google Doc import will not be available.")


class GdocService(models.AbstractModel):
    """Google Docs API Service for fetching and parsing documents."""
    _name = 'seisei.gdoc.service'
    _description = 'Google Docs API Service'

    SCOPES = ['https://www.googleapis.com/auth/documents.readonly']

    def _get_config(self):
        """Get Google Doc configuration from environment or system parameters."""
        # Try environment variable first
        service_account_json = os.environ.get('SEISEI_GDOC_SERVICE_ACCOUNT_JSON', '')

        if not service_account_json:
            # Fallback to system parameter
            ICP = self.env['ir.config_parameter'].sudo()
            service_account_json = ICP.get_param('seisei.gdoc.service_account_json', '')

        enabled_env = os.environ.get('SEISEI_GDOC_ENABLED', '')
        if enabled_env:
            enabled = enabled_env.lower() == 'true'
        else:
            ICP = self.env['ir.config_parameter'].sudo()
            enabled = ICP.get_param('seisei.gdoc.enabled', 'False').lower() == 'true'

        return {
            'enabled': enabled,
            'service_account_json': service_account_json,
        }

    def _get_credentials(self):
        """Get Google API credentials from service account JSON."""
        if not GOOGLE_API_AVAILABLE:
            raise UserError(_('Google API libraries are not installed. Please install google-api-python-client and google-auth.'))

        config = self._get_config()

        if not config['enabled']:
            raise UserError(_('Google Doc import is not enabled. Please enable it in Settings.'))

        if not config['service_account_json']:
            raise UserError(_('Google service account credentials are not configured.'))

        try:
            # Parse JSON credentials
            if config['service_account_json'].startswith('{'):
                # Direct JSON string
                creds_info = json.loads(config['service_account_json'])
            else:
                # File path
                with open(config['service_account_json'], 'r') as f:
                    creds_info = json.load(f)

            credentials = service_account.Credentials.from_service_account_info(
                creds_info,
                scopes=self.SCOPES
            )
            return credentials
        except json.JSONDecodeError as e:
            raise UserError(_('Invalid service account JSON: %s') % str(e))
        except FileNotFoundError:
            raise UserError(_('Service account file not found: %s') % config['service_account_json'])
        except Exception as e:
            raise UserError(_('Failed to load credentials: %s') % str(e))

    def _get_docs_service(self):
        """Get Google Docs API service instance."""
        credentials = self._get_credentials()
        return build('docs', 'v1', credentials=credentials)

    @api.model
    def fetch_document(self, doc_id):
        """Fetch a Google Doc by its ID.

        Args:
            doc_id: Google Doc ID (from URL)

        Returns:
            dict: Document content from Google Docs API
        """
        try:
            service = self._get_docs_service()
            document = service.documents().get(documentId=doc_id).execute()
            return document
        except HttpError as e:
            if e.resp.status == 404:
                raise UserError(_('Document not found: %s. Make sure the Doc ID is correct and the service account has access.') % doc_id)
            elif e.resp.status == 403:
                raise UserError(_('Access denied to document: %s. Please share the document with the service account email.') % doc_id)
            else:
                raise UserError(_('Google API error: %s') % str(e))
        except Exception as e:
            raise UserError(_('Failed to fetch document: %s') % str(e))

    @api.model
    def parse_document_tables(self, document):
        """Parse tables from a Google Doc.

        Args:
            document: Document content from Google Docs API

        Returns:
            dict: Parsed sections with table data
                {
                    'section_name': [
                        {'column1': 'value1', 'column2': 'value2'},
                        ...
                    ],
                    ...
                }
        """
        sections = {}
        current_section = 'default'

        content = document.get('body', {}).get('content', [])

        for element in content:
            # Check for paragraph (might be a heading)
            if 'paragraph' in element:
                paragraph = element['paragraph']
                style = paragraph.get('paragraphStyle', {}).get('namedStyleType', '')

                # Extract heading text
                if style.startswith('HEADING'):
                    text = self._extract_paragraph_text(paragraph)
                    if text:
                        current_section = text.strip()
                        if current_section not in sections:
                            sections[current_section] = []

            # Check for table
            elif 'table' in element:
                table_data = self._parse_table(element['table'])
                if table_data:
                    if current_section not in sections:
                        sections[current_section] = []
                    sections[current_section].extend(table_data)

        return sections

    def _extract_paragraph_text(self, paragraph):
        """Extract text from a paragraph element."""
        text_parts = []
        for elem in paragraph.get('elements', []):
            if 'textRun' in elem:
                text_parts.append(elem['textRun'].get('content', ''))
        return ''.join(text_parts).strip()

    def _parse_table(self, table):
        """Parse a table element into list of dicts.

        Args:
            table: Table element from Google Docs API

        Returns:
            list: List of dicts, each representing a row
        """
        rows = table.get('tableRows', [])
        if len(rows) < 2:
            return []

        # First row is header
        headers = []
        for cell in rows[0].get('tableCells', []):
            header_text = self._extract_cell_text(cell)
            headers.append(header_text.strip().lower().replace(' ', '_'))

        # Parse data rows
        data = []
        for row in rows[1:]:
            row_data = {}
            cells = row.get('tableCells', [])
            for i, cell in enumerate(cells):
                if i < len(headers):
                    cell_text = self._extract_cell_text(cell)
                    row_data[headers[i]] = cell_text.strip()

            # Skip empty rows
            if any(row_data.values()):
                data.append(row_data)

        return data

    def _extract_cell_text(self, cell):
        """Extract text from a table cell."""
        text_parts = []
        for content in cell.get('content', []):
            if 'paragraph' in content:
                text_parts.append(self._extract_paragraph_text(content['paragraph']))
        return '\n'.join(text_parts)

    @api.model
    def test_connection(self):
        """Test Google Docs API connection.

        Returns:
            dict: {'success': bool, 'message': str}
        """
        if not GOOGLE_API_AVAILABLE:
            return {
                'success': False,
                'message': _('Google API libraries not installed.')
            }

        config = self._get_config()

        if not config['enabled']:
            return {
                'success': False,
                'message': _('Google Doc import is not enabled.')
            }

        if not config['service_account_json']:
            return {
                'success': False,
                'message': _('Service account credentials not configured.')
            }

        try:
            credentials = self._get_credentials()
            service = build('docs', 'v1', credentials=credentials)
            # Just building the service validates credentials
            return {
                'success': True,
                'message': _('Successfully authenticated with Google Docs API.')
            }
        except Exception as e:
            return {
                'success': False,
                'message': str(e)
            }
