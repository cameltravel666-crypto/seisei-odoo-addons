# -*- coding: utf-8 -*-
"""
AI Companion - 独立聊天会话模型
简化版本，不依赖 discuss.channel
"""

from odoo import models, fields, api
import logging
import requests
import json
import re

_logger = logging.getLogger(__name__)


class AIChatSession(models.Model):
    """AI 聊天会话"""
    _name = 'ai.chat.session'
    _description = 'AI Chat Session'
    _order = 'create_date desc'

    name = fields.Char('会话名称', required=True, default='新会话')
    user_id = fields.Many2one('res.users', '用户', required=True, default=lambda self: self.env.user)
    partner_id = fields.Many2one('res.partner', '联系人', related='user_id.partner_id', store=True)
    state = fields.Selection([
        ('active', '进行中'),
        ('closed', '已关闭'),
    ], string='状态', default='active')
    
    message_ids = fields.One2many('ai.chat.message', 'session_id', '消息')
    message_count = fields.Integer('消息数量', compute='_compute_message_count', store=True)
    last_message_date = fields.Datetime('最后消息时间', compute='_compute_last_message', store=True)

    @api.depends('message_ids')
    def _compute_message_count(self):
        for record in self:
            record.message_count = len(record.message_ids)

    @api.depends('message_ids.create_date')
    def _compute_last_message(self):
        for record in self:
            if record.message_ids:
                record.last_message_date = max(record.message_ids.mapped('create_date'))
            else:
                record.last_message_date = record.create_date

    def action_close(self):
        """关闭会话"""
        self.write({'state': 'closed'})

    def action_reopen(self):
        """重新打开会话"""
        self.write({'state': 'active'})


class AIChatMessage(models.Model):
    """AI 聊天消息"""
    _name = 'ai.chat.message'
    _description = 'AI Chat Message'
    _order = 'create_date asc'

    session_id = fields.Many2one('ai.chat.session', '会话', required=True, ondelete='cascade')
    role = fields.Selection([
        ('user', '用户'),
        ('assistant', 'AI助手'),
    ], string='角色', required=True)
    content = fields.Text('内容', required=True)
    create_date = fields.Datetime('创建时间', default=fields.Datetime.now)

    def _call_dify_api(self, user_message):
        """
        调用 Dify API 获取 AI 响应
        
        Args:
            user_message (str): 用户消息（纯文本）
        
        Returns:
            str: AI 响应文本，如果失败返回错误消息
        """
        params = self.env['ir.config_parameter'].sudo()

        # 获取配置
        api_key = params.get_param('ai_companion.dify_api_key', default='')
        base_url = params.get_param('ai_companion.dify_base_url', default='http://13.114.99.38:5001/v1')
        timeout = int(params.get_param('ai_companion.dify_timeout', default=30))
        user_prefix = params.get_param('ai_companion.dify_user_identifier', default='odoo_user')

        # 验证配置
        if not api_key:
            _logger.warning('⚠️  Dify API Key not configured')
            return (
                "⚠️ <b>AI Companion 未配置</b><br/><br/>"
                "请按以下步骤配置：<br/>"
                "1. 进入 <b>Settings > General Settings > AI Companion</b><br/>"
                "2. 启用 <b>Enable AI Companion</b><br/>"
                "3. 获取 API Key：<br/>"
                "   - 访问 <a href='http://13.114.99.38:3000/apps' target='_blank'>http://13.114.99.38:3000/apps</a><br/>"
                "   - 选择应用 → <b>API 访问</b> → 复制 API Key<br/>"
                "4. 设置 <b>Dify Base URL</b> 为：<code>http://13.114.99.38:5001/v1</code><br/>"
                "5. 保存设置"
            )

        # 准备 API 请求
        if '/v1' not in base_url:
            url = f"{base_url.rstrip('/')}/v1/chat-messages"
        else:
            url = f"{base_url.rstrip('/')}/chat-messages"
        
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        }

        # 用户标识符
        user_id = self.session_id.user_id.id
        user_identifier = f"{user_prefix}_{user_id}"

        payload = {
            "inputs": {},
            "query": user_message,
            "response_mode": "blocking",
            "user": user_identifier,
        }

        try:
            _logger.info('📤 Calling Dify API: user=%s, session=%s, message=%s...',
                        user_identifier, self.session_id.name, user_message[:50])

            # 调用 API
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=timeout,
                stream=False
            )

            # 检查 HTTP 状态
            response.raise_for_status()

            # 解析响应
            result = response.json()
            
            # 提取答案
            if isinstance(result, dict):
                answer = result.get('answer', '') or result.get('text', '')
                if result.get('event') == 'message':
                    answer = result.get('answer', '')
            else:
                answer = ''

            if not answer:
                _logger.warning('⚠️  Empty answer from Dify API. Response: %s', result)
                return (
                    "🤔 <b>无法生成回复</b><br/><br/>"
                    "我收到了你的消息，但 Dify API 返回了空响应。<br/><br/>"
                    "可能的原因：<br/>"
                    "1. Dify 应用配置问题<br/>"
                    "2. 模型服务暂时不可用<br/>"
                    "3. 请求参数不正确<br/><br/>"
                    "建议：<br/>"
                    "1. 检查 Dify 应用配置：<a href='http://13.114.99.38:3000/apps' target='_blank'>http://13.114.99.38:3000/apps</a><br/>"
                    "2. 稍后重试<br/>"
                    "3. 查看 Odoo 日志获取详细错误信息"
                )

            _logger.info('✅ AI response received: %s chars', len(answer))
            
            # 清理文本
            answer = re.sub(r'\*\*(.+?)\*\*', r'\1', answer)
            answer = re.sub(r'\*(.+?)\*', r'\1', answer)
            answer = re.sub(r'\[.+?\]', '', answer)
            answer = re.sub(r'[【】（）()]', '', answer)
            answer = re.sub(r'[-—]{2,}', ' ', answer)
            answer = re.sub(r'\s+', ' ', answer).strip()
            
            return answer

        except requests.exceptions.Timeout:
            _logger.error('⏱️  Dify API timeout after %s seconds', timeout)
            return (
                "⏱️ <b>请求超时</b><br/><br/>"
                "AI 服务响应时间过长（超过 %d 秒）。<br/>"
                "建议：<br/>"
                "1. 检查网络连接<br/>"
                "2. 在 Settings 中增加 <b>API Timeout</b> 值<br/>"
                "3. 检查 Dify 服务状态：<a href='http://13.114.99.38:5001/health' target='_blank'>http://13.114.99.38:5001/health</a>"
            ) % timeout

        except requests.exceptions.HTTPError as e:
            status_code = response.status_code if response else 'unknown'
            _logger.error('❌ Dify API HTTP error %s: %s', status_code, str(e))

            if status_code == 401 or status_code == 403:
                return (
                    "🔑 <b>API 认证失败 (HTTP %s)</b><br/><br/>"
                    "请检查 Dify API Key 是否正确。<br/><br/>"
                    "<b>获取 API Key 步骤：</b><br/>"
                    "1. 访问 Dify Web 界面：<a href='http://13.114.99.38:3000/apps' target='_blank'>http://13.114.99.38:3000/apps</a><br/>"
                    "2. 选择你的应用<br/>"
                    "3. 点击 <b>API 访问</b> 标签页<br/>"
                    "4. 复制 <b>API Key</b><br/>"
                    "5. 在 Odoo 中：<b>Settings > General Settings > AI Companion</b><br/>"
                    "6. 粘贴 API Key 并保存<br/><br/>"
                    "<b>检查 Base URL：</b><br/>"
                    "确保 <b>Dify Base URL</b> 设置为：<code>http://13.114.99.38:5001/v1</code>"
                ) % status_code
            elif status_code == 404:
                return (
                    "❌ <b>API 端点未找到 (HTTP 404)</b><br/><br/>"
                    "请检查 <b>Dify Base URL</b> 配置是否正确：<br/>"
                    "当前配置：<code>%s</code><br/>"
                    "应该设置为：<code>http://13.114.99.38:5001/v1</code><br/><br/>"
                    "检查步骤：<br/>"
                    "1. 确认 Dify API 服务运行在端口 5001<br/>"
                    "2. 测试 API：<a href='http://13.114.99.38:5001/health' target='_blank'>http://13.114.99.38:5001/health</a>"
                ) % base_url
            elif status_code == 500:
                return (
                    "❌ <b>服务器内部错误 (HTTP 500)</b><br/><br/>"
                    "Dify 服务器遇到了问题。请：<br/>"
                    "1. 稍后重试<br/>"
                    "2. 检查 Dify 服务状态：<a href='http://13.114.99.38:5001/health' target='_blank'>http://13.114.99.38:5001/health</a><br/>"
                    "3. 查看 Dify 日志排查问题"
                )
            else:
                return (
                    "❌ <b>API 请求失败 (HTTP %s)</b><br/><br/>"
                    "错误信息：%s<br/><br/>"
                    "建议：<br/>"
                    "1. 检查网络连接<br/>"
                    "2. 验证 Dify Base URL：<code>%s</code><br/>"
                    "3. 检查 Dify 服务状态：<a href='http://13.114.99.38:5001/health' target='_blank'>http://13.114.99.38:5001/health</a>"
                ) % (status_code, str(e), base_url)

        except requests.exceptions.RequestException as e:
            _logger.error('❌ Dify API request failed: %s', str(e), exc_info=True)
            error_msg = str(e)
            return (
                "❌ <b>无法连接到 AI 服务</b><br/><br/>"
                "错误详情：<code>%s</code><br/><br/>"
                "<b>排查步骤：</b><br/>"
                "1. 检查网络连接是否正常<br/>"
                "2. 验证 Dify Base URL 配置：<br/>"
                "   - 当前配置：<code>%s</code><br/>"
                "   - 应该设置为：<code>http://13.114.99.38:5001/v1</code><br/>"
                "3. 测试 API 连接：<a href='http://13.114.99.38:5001/health' target='_blank'>http://13.114.99.38:5001/health</a><br/>"
                "4. 确认 Dify 服务正在运行（端口 5001）<br/>"
                "5. 检查防火墙设置是否允许访问端口 5001"
            ) % (error_msg, base_url)

        except json.JSONDecodeError as e:
            _logger.error('❌ Failed to parse Dify API response: %s', str(e))
            return (
                "❌ <b>响应格式错误</b><br/><br/>"
                "AI 服务返回了无效的 JSON 响应。<br/><br/>"
                "可能的原因：<br/>"
                "1. Dify API 版本不兼容<br/>"
                "2. API 端点配置错误<br/>"
                "3. 服务器返回了非 JSON 响应<br/><br/>"
                "建议：<br/>"
                "1. 检查 Dify Base URL：<code>%s</code><br/>"
                "2. 确认应设置为：<code>http://13.114.99.38:5001/v1</code><br/>"
                "3. 查看 Odoo 日志获取详细错误信息"
            ) % base_url

        except Exception as e:
            _logger.error('❌ Unexpected error calling Dify API: %s', str(e), exc_info=True)
            return (
                "❌ <b>发生意外错误</b><br/><br/>"
                "错误信息：<code>%s</code><br/><br/>"
                "请检查：<br/>"
                "1. Odoo 日志文件获取详细错误信息<br/>"
                "2. Dify 服务状态：<a href='http://13.114.99.38:5001/health' target='_blank'>http://13.114.99.38:5001/health</a><br/>"
                "3. 配置是否正确：<br/>"
                "   - API Key 已配置<br/>"
                "   - Base URL: <code>%s</code><br/>"
                "4. 联系系统管理员"
            ) % (str(e), base_url)

    def send_user_message(self, content):
        """发送用户消息并获取AI回复"""
        self.ensure_one()
        
        # 检查AI是否启用
        params = self.env['ir.config_parameter'].sudo()
        enabled = params.get_param('ai_companion.dify_enabled', default='False')
        if enabled not in ('True', 'true', '1', True):
            return {
                'error': 'AI Companion 未启用。请在 Settings > General Settings > AI Companion 中启用。'
            }
        
        # 创建用户消息
        user_msg = self.env['ai.chat.message'].create({
            'session_id': self.id,
            'role': 'user',
            'content': content,
        })
        
        # 调用Dify API获取回复
        ai_response = user_msg._call_dify_api(content)
        
        # 创建AI回复消息
        ai_msg = self.env['ai.chat.message'].create({
            'session_id': self.id,
            'role': 'assistant',
            'content': ai_response,
        })
        
        return {
            'user_message': user_msg.read(['id', 'content', 'create_date'])[0],
            'ai_message': ai_msg.read(['id', 'content', 'create_date'])[0],
        }

