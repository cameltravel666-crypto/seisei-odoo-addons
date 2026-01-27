# -*- coding: utf-8 -*-
{
    'name': 'AI Companion - Dify Integration',
    'version': '18.0.3.0.0',
    'category': 'Productivity',
    'summary': 'Standalone AI chat with Dify integration',
    'description': """
AI Companion - Dify Integration
================================

This module provides a standalone AI chat interface integrated with Dify AI, allowing users to have intelligent conversations.

Features:
---------
* Standalone chat sessions (no Discuss dependency)
* Seamless integration with Dify API
* Configurable API settings in General Settings
* Clean chat interface
* Enhanced error handling with user-friendly messages
* Per-session conversation context
* Per-user identification for personalized responses

Configuration:
--------------
1. Go to Settings > General Settings > AI Companion
2. Enable AI Companion
3. Enter your Dify API Key
4. Configure Base URL (default: https://api.dify.ai/v1)
5. Adjust timeout and user identifier prefix as needed

Usage:
------
1. Go to AI Companion menu
2. Create a new chat session
3. Start chatting with the AI!

Technical Implementation:
------------------------
* Independent chat session model
* Direct Dify API integration
* Comprehensive logging
* Error recovery mechanisms
    """,
    'author': 'Your Company',
    'website': 'https://www.yourcompany.com',
    'license': 'LGPL-3',
    'depends': ['base', 'base_setup', 'mail'],
    'data': [
        'data/res_partner_data.xml',
        'views/ai_chat_views.xml',
        'views/discuss_channel_views.xml',
        'views/res_config_settings_views.xml',
        'security/ir.model.access.csv',
    ],
    'external_dependencies': {
        'python': ['requests'],
    },
    'images': ['static/description/banner.png'],
    'installable': True,
    'application': False,
    'auto_install': False,
}
