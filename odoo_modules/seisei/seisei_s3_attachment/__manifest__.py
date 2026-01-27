# -*- coding: utf-8 -*-
{
    'name': 'Seisei S3 Attachment Storage',
    'version': '18.0.1.0.0',
    'category': 'Technical',
    'summary': 'Store attachments in AWS S3 or S3-compatible storage',
    'description': """
Seisei S3 Attachment Storage
============================

Store Odoo attachments in Amazon S3 or S3-compatible storage (MinIO, etc).

Features:
- Configure S3 via System Parameters (runtime configurable)
- New attachments automatically stored in S3
- Download/preview attachments from S3
- Test connection button in settings
- Migration wizard for existing attachments
- Rollback support (disable S3 without data loss)
- Support for private buckets with presigned URLs

Configuration:
- seisei.s3.enabled: Enable/disable S3 storage
- seisei.s3.bucket: S3 bucket name
- seisei.s3.region: AWS region
- seisei.s3.endpoint_url: Custom endpoint (for S3-compatible)
- seisei.s3.access_key: Access key ID
- seisei.s3.secret_key: Secret access key
- seisei.s3.prefix: Object key prefix
    """,
    'author': 'Seisei',
    'website': 'https://seisei.tokyo',
    'depends': [
        'base',
        'base_setup',
    ],
    'external_dependencies': {
        'python': ['boto3'],
    },
    'data': [
        'security/ir.model.access.csv',
        'views/res_config_settings_views.xml',
        'wizard/s3_migration_wizard_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'LGPL-3',
}
