# -*- coding: utf-8 -*-
"""
AI Companion - Configuration Settings
Adds Dify API configuration to General Settings
"""

from odoo import models, fields


class ResConfigSettings(models.TransientModel):
    """扩展通用设置以添加 AI Companion 配置"""

    _inherit = 'res.config.settings'

    # AI Companion 启用开关
    dify_enabled = fields.Boolean(
        string='Enable AI Companion',
        config_parameter='ai_companion.dify_enabled',
        help='Enable AI Assistant integration with Dify API',
    )

    # Dify API Key (使用 Text 字段支持多行)
    dify_api_key = fields.Text(
        string='Dify API Key',
        config_parameter='ai_companion.dify_api_key',
        help='Your Dify API Key. 获取方式：1) 访问 http://54.65.127.141:3000/apps 2) 选择应用 → API 访问 → 复制 API Key',
    )

    # Dify Base URL (使用 Text 字段支持多行)
    dify_base_url = fields.Text(
        string='Dify Base URL',
        default='http://54.65.127.141:5001/v1',
        config_parameter='ai_companion.dify_base_url',
        help='Dify API base URL (default: http://54.65.127.141:5001/v1). 注意：端口 5001 是 API 后端，端口 3000 是 Web 前端。',
    )

    # API 超时设置
    dify_timeout = fields.Integer(
        string='API Timeout (seconds)',
        default=30,
        config_parameter='ai_companion.dify_timeout',
        help='Timeout for Dify API requests in seconds',
    )

    # 用户标识符前缀
    dify_user_identifier = fields.Char(
        string='User Identifier Prefix',
        default='odoo_user',
        config_parameter='ai_companion.dify_user_identifier',
        help='Prefix for user identifiers sent to Dify (will be followed by user ID)',
    )
