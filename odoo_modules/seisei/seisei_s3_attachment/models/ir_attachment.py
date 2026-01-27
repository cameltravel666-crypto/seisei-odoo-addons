# -*- coding: utf-8 -*-
import base64
import hashlib
import logging
import os

from odoo import api, models, fields

_logger = logging.getLogger(__name__)

try:
    import boto3
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    _logger.warning("boto3 not installed. S3 storage will not be available.")


class IrAttachment(models.Model):
    _inherit = 'ir.attachment'

    s3_key = fields.Char('S3 Object Key', index=True, readonly=True)

    def _get_s3_config(self):
        """Get S3 configuration from environment variables (priority) or system parameters.

        Environment variables (recommended for multi-tenant):
        - SEISEI_S3_ENABLED: 'true' to enable (default if bucket is set)
        - SEISEI_S3_BUCKET: S3 bucket name (required)
        - SEISEI_S3_REGION: AWS region (default: ap-northeast-1)
        - SEISEI_S3_ENDPOINT_URL: Custom endpoint for S3-compatible storage
        - SEISEI_S3_ACCESS_KEY: Access key ID
        - SEISEI_S3_SECRET_KEY: Secret access key
        - SEISEI_S3_PREFIX: Object key prefix (default: odoo-attachments)
        """
        # Try environment variables first (system-wide config)
        bucket = os.environ.get('SEISEI_S3_BUCKET', '')

        if bucket:
            # Environment variables take priority - auto-enable if bucket is configured
            enabled_env = os.environ.get('SEISEI_S3_ENABLED', 'true').lower()
            return {
                'enabled': enabled_env == 'true' and bool(bucket),
                'bucket': bucket,
                'region': os.environ.get('SEISEI_S3_REGION', 'ap-northeast-1'),
                'endpoint_url': os.environ.get('SEISEI_S3_ENDPOINT_URL', ''),
                'access_key': os.environ.get('SEISEI_S3_ACCESS_KEY', ''),
                'secret_key': os.environ.get('SEISEI_S3_SECRET_KEY', ''),
                'prefix': os.environ.get('SEISEI_S3_PREFIX', 'odoo-attachments'),
            }

        # Fallback to system parameters (for backwards compatibility)
        ICP = self.env['ir.config_parameter'].sudo()
        return {
            'enabled': ICP.get_param('seisei.s3.enabled', 'False').lower() == 'true',
            'bucket': ICP.get_param('seisei.s3.bucket', ''),
            'region': ICP.get_param('seisei.s3.region', 'ap-northeast-1'),
            'endpoint_url': ICP.get_param('seisei.s3.endpoint_url', ''),
            'access_key': ICP.get_param('seisei.s3.access_key', ''),
            'secret_key': ICP.get_param('seisei.s3.secret_key', ''),
            'prefix': ICP.get_param('seisei.s3.prefix', 'odoo-attachments'),
        }

    def _get_s3_client(self, config=None):
        """Create boto3 S3 client."""
        if not BOTO3_AVAILABLE:
            return None

        if config is None:
            config = self._get_s3_config()

        if not config['enabled'] or not config['bucket']:
            return None

        client_kwargs = {
            'region_name': config['region'],
            'aws_access_key_id': config['access_key'],
            'aws_secret_access_key': config['secret_key'],
        }

        if config['endpoint_url']:
            client_kwargs['endpoint_url'] = config['endpoint_url']

        try:
            return boto3.client('s3', **client_kwargs)
        except Exception as e:
            _logger.error("Failed to create S3 client: %s", e)
            return None

    def _compute_s3_key(self, checksum):
        """Compute S3 object key from checksum."""
        config = self._get_s3_config()
        prefix = config['prefix'].strip('/')
        # Use checksum as key to ensure deduplication
        # Format: prefix/ab/cd/abcdef123456...
        return f"{prefix}/{checksum[:2]}/{checksum[2:4]}/{checksum}"

    def _file_read(self, fname):
        """Override to read from S3 if s3_key is set."""
        # Check if this is an S3 file (fname starts with 's3://')
        if fname and fname.startswith('s3://'):
            s3_key = fname[5:]  # Remove 's3://' prefix
            return self._s3_read(s3_key)
        return super()._file_read(fname)

    def _s3_read(self, s3_key):
        """Read file content from S3."""
        config = self._get_s3_config()
        client = self._get_s3_client(config)

        if not client:
            _logger.error("S3 client not available for reading: %s", s3_key)
            return b''

        try:
            response = client.get_object(Bucket=config['bucket'], Key=s3_key)
            return response['Body'].read()
        except ClientError as e:
            _logger.error("Failed to read from S3 (%s): %s", s3_key, e)
            return b''
        except Exception as e:
            _logger.error("Unexpected error reading from S3 (%s): %s", s3_key, e)
            return b''

    def _file_write(self, bin_data, checksum):
        """Override to write to S3 if enabled."""
        config = self._get_s3_config()

        if config['enabled'] and config['bucket']:
            s3_key = self._compute_s3_key(checksum)
            if self._s3_write(bin_data, s3_key, config):
                # Return s3:// prefix to indicate S3 storage
                return f"s3://{s3_key}"

        # Fallback to filestore
        return super()._file_write(bin_data, checksum)

    def _s3_write(self, bin_data, s3_key, config=None):
        """Write file content to S3."""
        if config is None:
            config = self._get_s3_config()

        client = self._get_s3_client(config)

        if not client:
            _logger.error("S3 client not available for writing")
            return False

        try:
            # Check if object already exists (deduplication)
            try:
                client.head_object(Bucket=config['bucket'], Key=s3_key)
                _logger.debug("S3 object already exists: %s", s3_key)
                return True
            except ClientError as e:
                if e.response['Error']['Code'] != '404':
                    raise

            # Upload new object
            client.put_object(
                Bucket=config['bucket'],
                Key=s3_key,
                Body=bin_data,
            )
            _logger.info("Uploaded to S3: %s (%d bytes)", s3_key, len(bin_data))
            return True
        except ClientError as e:
            _logger.error("Failed to write to S3 (%s): %s", s3_key, e)
            return False
        except Exception as e:
            _logger.error("Unexpected error writing to S3 (%s): %s", s3_key, e)
            return False

    def _file_delete(self, fname):
        """Override to delete from S3 if s3_key is set."""
        if fname and fname.startswith('s3://'):
            s3_key = fname[5:]
            self._s3_delete(s3_key)
        else:
            super()._file_delete(fname)

    def _s3_delete(self, s3_key):
        """Delete file from S3."""
        config = self._get_s3_config()
        client = self._get_s3_client(config)

        if not client:
            _logger.warning("S3 client not available for deletion: %s", s3_key)
            return

        try:
            # Check if any other attachment uses this S3 key
            count = self.sudo().search_count([
                ('store_fname', '=', f's3://{s3_key}'),
            ])
            if count > 1:
                _logger.debug("S3 object still referenced by %d attachments, skipping delete: %s", count, s3_key)
                return

            client.delete_object(Bucket=config['bucket'], Key=s3_key)
            _logger.info("Deleted from S3: %s", s3_key)
        except ClientError as e:
            _logger.error("Failed to delete from S3 (%s): %s", s3_key, e)
        except Exception as e:
            _logger.error("Unexpected error deleting from S3 (%s): %s", s3_key, e)

    def _to_http_stream(self):
        """Override to handle S3 files - return data stream instead of path."""
        self.ensure_one()

        # Import Stream here to avoid circular imports
        from odoo.http import Stream

        # Check if this is an S3 file
        if self.store_fname and self.store_fname.startswith('s3://'):
            s3_key = self.store_fname[5:]  # Remove 's3://' prefix
            data = self._s3_read(s3_key)

            stream = Stream(
                mimetype=self.mimetype or 'application/octet-stream',
                download_name=self.name,
                etag=self.checksum,
                public=self.public,
            )
            stream.type = 'data'
            stream.data = data
            stream.last_modified = self.write_date
            stream.size = len(data)
            return stream

        # Fall back to default behavior for non-S3 files
        return super()._to_http_stream()

    def _get_s3_presigned_url(self, s3_key, expiration=3600):
        """Generate presigned URL for S3 object."""
        config = self._get_s3_config()
        client = self._get_s3_client(config)

        if not client:
            return None

        try:
            url = client.generate_presigned_url(
                'get_object',
                Params={'Bucket': config['bucket'], 'Key': s3_key},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            _logger.error("Failed to generate presigned URL: %s", e)
            return None

    @api.model
    def _s3_test_connection(self):
        """Test S3 connection and return result."""
        config = self._get_s3_config()

        if not BOTO3_AVAILABLE:
            return {'success': False, 'message': 'boto3 library not installed'}

        if not config['enabled']:
            return {'success': False, 'message': 'S3 storage is not enabled'}

        if not config['bucket']:
            return {'success': False, 'message': 'S3 bucket name is not configured'}

        client = self._get_s3_client(config)
        if not client:
            return {'success': False, 'message': 'Failed to create S3 client'}

        try:
            # Try to list objects (limited to 1) to test connection
            client.list_objects_v2(Bucket=config['bucket'], MaxKeys=1)
            return {
                'success': True,
                'message': f"Successfully connected to bucket: {config['bucket']}"
            }
        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_msg = e.response['Error']['Message']
            return {
                'success': False,
                'message': f"S3 Error ({error_code}): {error_msg}"
            }
        except Exception as e:
            return {'success': False, 'message': str(e)}
