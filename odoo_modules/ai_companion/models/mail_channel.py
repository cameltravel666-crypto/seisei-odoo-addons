# -*- coding: utf-8 -*-
"""
AI Companion - Mail Channel Integration
使用 message_post() 拦截（推荐方式）+ 完善的错误处理
"""

from odoo import models, api
import logging
import requests
import json
import re

_logger = logging.getLogger(__name__)


class MailChannel(models.Model):
    """扩展 discuss.channel 以支持 AI 助手（Odoo 18 使用 discuss.channel）"""
    
    # Odoo 18 中，mail.channel 已重命名为 discuss.channel（但仍在 mail 模块中）
    _inherit = 'discuss.channel'

    def _get_ai_partner(self):
        """获取 AI 助手伙伴"""
        ai_partner = self.env.ref('ai_companion.partner_ai_assistant', raise_if_not_found=False)
        if not ai_partner:
            # 降级：按名称搜索
            ai_partner = self.env['res.partner'].search([('name', '=', 'AI Assistant')], limit=1)
        return ai_partner

    def _is_ai_enabled(self):
        """检查 AI Companion 是否启用"""
        params = self.env['ir.config_parameter'].sudo()
        enabled = params.get_param('ai_companion.dify_enabled', default='False')
        # 处理字符串 'True'/'False'
        return enabled in ('True', 'true', '1', True)

    def _has_ai_partner(self):
        """检查当前频道是否包含 AI 助手"""
        self.ensure_one()
        ai_partner = self._get_ai_partner()
        if not ai_partner:
            _logger.debug('AI partner not found')
            return False
        
        # Odoo 18 中，discuss.channel 有多种方式检查成员
        # 方法1: 使用 channel_partner_ids (计算字段，包含所有成员)
        if hasattr(self, 'channel_partner_ids'):
            has_partner = ai_partner.id in self.channel_partner_ids.ids
            _logger.debug('Checked channel_partner_ids: %s (AI partner ID: %s, Channel partner IDs: %s)', 
                         has_partner, ai_partner.id, self.channel_partner_ids.ids)
            return has_partner
        
        # 方法2: 使用 channel_member_ids (关系字段)
        if hasattr(self, 'channel_member_ids'):
            partner_ids = self.channel_member_ids.mapped('partner_id').ids
            has_partner = ai_partner.id in partner_ids
            _logger.debug('Checked channel_member_ids: %s (AI partner ID: %s, Member partner IDs: %s)', 
                         has_partner, ai_partner.id, partner_ids)
            return has_partner
        
        # 方法3: 直接查询 channel_member 模型
        try:
            member = self.env['discuss.channel.member'].search([
                ('channel_id', '=', self.id),
                ('partner_id', '=', ai_partner.id)
            ], limit=1)
            has_partner = bool(member)
            _logger.debug('Checked channel_member model: %s (AI partner ID: %s)', has_partner, ai_partner.id)
            return has_partner
        except Exception as e:
            _logger.warning('Error checking channel member: %s', str(e))
            return False

    def _add_ai_partner_to_channel(self):
        """自动将 AI 助手添加到当前频道"""
        self.ensure_one()
        ai_partner = self._get_ai_partner()
        if not ai_partner:
            _logger.warning('Cannot add AI partner: partner not found')
            return False
        
        try:
            # 检查是否已经在频道中
            if self._has_ai_partner():
                _logger.debug('AI partner already in channel %s', self.name)
                return True
            
            # 方法1: 使用 channel_member_ids 添加
            if hasattr(self, 'channel_member_ids'):
                # 检查是否需要创建 channel member
                member = self.env['discuss.channel.member'].search([
                    ('channel_id', '=', self.id),
                    ('partner_id', '=', ai_partner.id)
                ], limit=1)
                
                if not member:
                    # 创建新的 channel member
                    self.env['discuss.channel.member'].sudo().create({
                        'channel_id': self.id,
                        'partner_id': ai_partner.id,
                    })
                    _logger.info('✅ Added AI partner to channel "%s" via channel_member', self.name)
                else:
                    _logger.debug('AI partner already has channel member record')
            
            # 方法2: 如果是私聊频道，可能需要特殊处理
            # 对于群聊频道，上面的方法应该足够
            
            return True
        except Exception as e:
            _logger.error('❌ Failed to add AI partner to channel: %s', str(e), exc_info=True)
            return False

    def _strip_html_tags(self, html_text):
        """去除 HTML 标签，只保留纯文本"""
        if not html_text:
            return ''
        # 去除所有 HTML 标签
        clean_text = re.sub(r'<[^>]+>', '', html_text)
        # 去除多余空白
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
        return clean_text

    def _call_dify_api(self, user_message, author):
        """
        调用 Dify API 获取 AI 响应

        Args:
            user_message (str): 用户消息（纯文本）
            author (res.partner): 消息作者

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
        # 确保 base_url 包含 /v1 路径
        if '/v1' not in base_url:
            url = f"{base_url.rstrip('/')}/v1/chat-messages"
        else:
            url = f"{base_url.rstrip('/')}/chat-messages"
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        }

        # 用户标识符（基于作者的 user_ids）
        user_id = author.user_ids[0].id if author.user_ids else self.env.user.id
        user_identifier = f"{user_prefix}_{user_id}"

        # 对话 ID：Dify 要求 conversation_id 必须是有效的 UUID 或为空
        # 如果为空，Dify 会自动创建新的对话
        # 如果需要保持上下文，可以在后续请求中使用 Dify 返回的 conversation_id
        conversation_id = None  # 不传递 conversation_id，让 Dify 自动管理

        payload = {
            "inputs": {},
            "query": user_message,
            "response_mode": "blocking",
            "user": user_identifier,
        }
        
        # 只在有有效 UUID 格式的 conversation_id 时添加
        # 如果需要保持对话上下文，可以在 Dify 应用中配置对话管理

        try:
            _logger.info('📤 Calling Dify API: user=%s, channel=%s, message=%s...',
                        user_identifier, self.name, user_message[:50])

            # 调用 API
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=timeout,
                stream=False  # 非流式模式
            )

            # 检查 HTTP 状态
            response.raise_for_status()

            # 解析响应
            result = response.json()
            
            # Dify API 可能返回流式格式（event: message）或标准 JSON
            # 处理流式响应格式
            if isinstance(result, dict):
                # 标准 JSON 格式
                answer = result.get('answer', '') or result.get('text', '')
                
                # 如果是流式格式（event: message）
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
            
            # 清理和格式化文本（保留内容，只清理格式）
            import re
            from html import escape
            
            # 如果答案已经是 HTML 格式，先提取纯文本
            if '<' in answer and '>' in answer:
                # 可能是 HTML，先提取文本内容
                from html import unescape
                # 去除 HTML 标签但保留内容
                answer = re.sub(r'<[^>]+>', '', answer)
                answer = unescape(answer)
            
            # 规范化换行
            answer = answer.replace('\r\n', '\n').replace('\r', '\n')
            
            # 清理 Markdown 格式（转换为 HTML 而不是删除）
            # Markdown 粗体 **text** -> <b>text</b>
            answer = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', answer)
            # Markdown 斜体 *text* -> <i>text</i>（但只处理单个星号，避免误删）
            answer = re.sub(r'(?<!\*)\*([^*\n]+?)\*(?!\*)', r'<i>\1</i>', answer)
            
            # 保留方括号和括号中的内容（可能是重要信息）
            # 只清理明显是格式标记的空括号
            answer = re.sub(r'\[\s*\]', '', answer)  # 只删除空方括号
            
            # 清理多余的连续破折号（但保留单个破折号）
            answer = re.sub(r'[-—]{3,}', '—', answer)  # 3个或更多破折号替换为单个
            
            # 处理换行：双换行变成段落，单换行变成 <br/>
            # 先处理双换行
            paragraphs = answer.split('\n\n')
            formatted_paragraphs = []
            for para in paragraphs:
                para = para.strip()
                if para:
                    # 单换行变成 <br/>
                    para = para.replace('\n', '<br/>')
                    # 转义 HTML 特殊字符（防止 XSS），但保留我们已经添加的 HTML 标签
                    # 使用临时标记保护我们的 HTML 标签
                    para = para.replace('<b>', '___BOLD_START___')
                    para = para.replace('</b>', '___BOLD_END___')
                    para = para.replace('<i>', '___ITALIC_START___')
                    para = para.replace('</i>', '___ITALIC_END___')
                    
                    # 转义 HTML
                    para = escape(para)
                    
                    # 恢复我们的 HTML 标签
                    para = para.replace('___BOLD_START___', '<b>')
                    para = para.replace('___BOLD_END___', '</b>')
                    para = para.replace('___ITALIC_START___', '<i>')
                    para = para.replace('___ITALIC_END___', '</i>')
                    
                    formatted_paragraphs.append(f'<p>{para}</p>')
            
            if formatted_paragraphs:
                answer = ''.join(formatted_paragraphs)
            else:
                # 如果没有段落，直接处理单换行
                # 保护 HTML 标签
                answer = answer.replace('<b>', '___BOLD_START___')
                answer = answer.replace('</b>', '___BOLD_END___')
                answer = answer.replace('<i>', '___ITALIC_START___')
                answer = answer.replace('</i>', '___ITALIC_END___')
                
                # 转义
                answer = escape(answer)
                
                # 恢复 HTML 标签
                answer = answer.replace('___BOLD_START___', '<b>')
                answer = answer.replace('___BOLD_END___', '</b>')
                answer = answer.replace('___ITALIC_START___', '<i>')
                answer = answer.replace('___ITALIC_END___', '</i>')
                
                answer = answer.replace('\n', '<br/>')
                answer = f'<p>{answer}</p>'
            
            # 确保至少有一个 <p> 标签
            if not answer.strip().startswith('<'):
                answer = f'<p>{answer}</p>'
            
            _logger.debug('Formatted AI response: %s chars, preview: %s', len(answer), answer[:100])
            
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

    def action_add_ai_assistant(self):
        """
        手动添加 AI 助手到当前频道（公共方法，可在视图中调用）
        """
        self.ensure_one()
        result = self._add_ai_partner_to_channel()
        if result:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': '成功',
                    'message': 'AI Assistant 已添加到频道',
                    'type': 'success',
                    'sticky': False,
                }
            }
        else:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': '错误',
                    'message': '无法添加 AI Assistant 到频道，请检查日志',
                    'type': 'danger',
                    'sticky': True,
                }
            }

    def action_check_ai_config(self):
        """
        检查 AI Companion 配置状态（诊断工具）
        """
        self.ensure_one()
        issues = []
        checks = []
        
        # 检查1: AI 是否启用
        is_enabled = self._is_ai_enabled()
        checks.append(('AI Companion 已启用', is_enabled))
        if not is_enabled:
            issues.append('请在 Settings > General Settings > AI Companion 中启用 AI Companion')
        
        # 检查2: AI Partner 是否存在
        ai_partner = self._get_ai_partner()
        checks.append(('AI Assistant Partner 存在', bool(ai_partner)))
        if not ai_partner:
            issues.append('AI Assistant Partner 未找到，请检查模块是否正确安装')
        
        # 检查3: API Key 是否配置
        params = self.env['ir.config_parameter'].sudo()
        api_key = params.get_param('ai_companion.dify_api_key', default='')
        checks.append(('Dify API Key 已配置', bool(api_key)))
        if not api_key:
            issues.append('请在 Settings > General Settings > AI Companion 中配置 Dify API Key')
        
        # 检查4: Base URL 是否配置
        base_url = params.get_param('ai_companion.dify_base_url', default='')
        checks.append(('Dify Base URL 已配置', bool(base_url)))
        if not base_url:
            issues.append('请在 Settings > General Settings > AI Companion 中配置 Dify Base URL')
        
        # 检查5: AI Partner 是否在频道中
        has_ai = self._has_ai_partner()
        checks.append(('AI Assistant 在频道中', has_ai))
        if not has_ai:
            issues.append('AI Assistant 不在当前频道中，请点击"添加 AI Assistant"按钮')
        
        # 生成报告
        report_lines = ['<b>AI Companion 配置检查报告</b><br/><br/>']
        report_lines.append('<table border="1" cellpadding="5">')
        report_lines.append('<tr><th>检查项</th><th>状态</th></tr>')
        for check_name, status in checks:
            status_icon = '✅' if status else '❌'
            status_text = '通过' if status else '失败'
            report_lines.append(f'<tr><td>{check_name}</td><td>{status_icon} {status_text}</td></tr>')
        report_lines.append('</table>')
        
        if issues:
            report_lines.append('<br/><b>需要修复的问题：</b><br/><ul>')
            for issue in issues:
                report_lines.append(f'<li>{issue}</li>')
            report_lines.append('</ul>')
        else:
            report_lines.append('<br/><b>✅ 所有检查通过！AI Companion 应该可以正常工作。</b>')
        
        report = ''.join(report_lines)
        
        # 发送报告到频道
        ai_partner = self._get_ai_partner()
        if ai_partner:
            self.sudo().message_post(
                body=report,
                author_id=ai_partner.id,
                message_type='comment',
                subtype_xmlid='mail.mt_comment',
            )
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': '配置检查完成',
                'message': f'发现 {len(issues)} 个问题，已发送详细报告到频道',
                'type': 'warning' if issues else 'success',
                'sticky': bool(issues),
            }
        }

    def message_post(self, **kwargs):
        """
        重写 message_post 以拦截消息并触发 AI 响应

        推荐的实现方式：
        - 在频道层面拦截，逻辑清晰
        - 所有通过 UI 发送的消息都会经过这里
        - 易于维护和调试
        """
        # 检查是否应该跳过 AI 处理（避免 AI 回复再次触发）
        if self.env.context.get('ai_companion_skip'):
            _logger.debug('Skipping AI processing (ai_companion_skip flag set)')
            return super(MailChannel, self).message_post(**kwargs)
        
        # 首先正常发送消息
        message = super(MailChannel, self).message_post(**kwargs)

        # 检查是否需要触发 AI 响应
        try:
            # 1. 检查 AI 是否启用
            if not self._is_ai_enabled():
                _logger.debug('AI Companion disabled, skipping')
                return message

            # 2. 获取 AI 伙伴
            ai_partner = self._get_ai_partner()
            if not ai_partner:
                _logger.debug('AI Assistant partner not found')
                return message

            # 3. 避免死循环：如果发送者是 AI 自己，停止
            if message.author_id == ai_partner:
                _logger.debug('Message from AI itself, skipping to avoid loop')
                return message

            # 4. 检查频道是否包含 AI 助手，如果没有则自动添加
            if not self._has_ai_partner():
                _logger.info('🤖 Channel "%s" does not have AI Assistant, attempting to add...', self.name)
                # 尝试自动添加 AI partner 到频道
                if self._add_ai_partner_to_channel():
                    _logger.info('✅ Successfully added AI Assistant to channel "%s"', self.name)
                else:
                    _logger.warning('⚠️  Failed to add AI Assistant to channel "%s". Please manually add "AI Assistant" partner to the channel.', self.name)
                    # 即使添加失败，也继续处理，因为可能是权限问题
                    # 但记录警告以便用户知道需要手动添加

            # 5. 检查消息类型和子类型
            # Odoo 18 中，用户消息通常是 'comment' 类型，子类型是 'mail.mt_comment'
            # 但某些情况下可能是 'notification' 类型
            skip_message = False
            
            # 检查是否是系统通知（应该跳过）
            if message.subtype_id:
                # 如果有子类型，检查是否是系统通知类型
                subtype_name = message.subtype_id.xml_id or ''
                if 'note' in subtype_name.lower() or 'notification' in subtype_name.lower():
                    # 但排除 mail.mt_comment（这是用户评论）
                    if 'mail.mt_comment' not in subtype_name:
                        skip_message = True
                        _logger.debug('Skipping system notification subtype: %s', subtype_name)
            
            # 如果消息类型不是 comment，检查是否是用户消息
            if message.message_type != 'comment':
                # notification 类型可能是用户消息（如果没有子类型或子类型是 comment）
                if message.message_type == 'notification':
                    if message.subtype_id and 'mail.mt_comment' not in (message.subtype_id.xml_id or ''):
                        skip_message = True
                else:
                    # 其他类型（如 email）跳过
                    skip_message = True
            
            if skip_message:
                _logger.debug('Skipping message type "%s" (subtype: %s)', 
                             message.message_type, 
                             message.subtype_id.name if message.subtype_id else 'None')
                return message

            # 6. 提取消息文本（去除 HTML 标签）
            message_text = self._strip_html_tags(message.body)
            if not message_text or len(message_text.strip()) == 0:
                _logger.debug('Empty message text after HTML stripping')
                return message

            _logger.info('🤖 Triggering AI response for message in channel "%s" (author: %s, message: "%s...")', 
                        self.name, message.author_id.name if message.author_id else 'Unknown', 
                        message_text[:50])

            # 7. 调用 Dify API（同步处理）
            ai_response = self._call_dify_api(message_text, message.author_id)
            
            if not ai_response:
                _logger.warning('⚠️  Empty AI response received, skipping message post')
                return message

            # 8. 发送 AI 响应
            # 使用 with_context 设置标志，避免 AI 回复再次触发 message_post
            # 使用 sudo() 以 AI 伙伴身份发送消息
            self.sudo().with_context(
                mail_create_nosubscribe=True,
                ai_companion_skip=True  # 自定义标志，在 message_post 中检查
            ).message_post(
                body=ai_response,
                author_id=ai_partner.id,
                message_type='comment',
                subtype_xmlid='mail.mt_comment',
            )
            _logger.info('✅ AI response posted to channel "%s"', self.name)

        except Exception as e:
            # 捕获所有异常，避免影响正常消息发送
            _logger.error('❌ Error in AI response handler for channel "%s": %s', self.name, str(e), exc_info=True)
            # 不抛出异常，避免阻止用户发送消息
            # 但可以发送一个友好的错误消息给用户（可选）
            try:
                ai_partner = self._get_ai_partner()
                if ai_partner and self._has_ai_partner():
                    error_msg = (
                        "⚠️ <b>AI 响应失败</b><br/><br/>"
                        "抱歉，处理您的消息时遇到了问题。<br/>"
                        "错误信息：<code>%s</code><br/><br/>"
                        "请检查：<br/>"
                        "1. AI Companion 配置是否正确<br/>"
                        "2. Dify API 服务是否正常运行<br/>"
                        "3. 查看系统日志获取详细信息"
                    ) % str(e)[:100]  # 限制错误消息长度
                    self.sudo().message_post(
                        body=error_msg,
                        author_id=ai_partner.id,
                        message_type='comment',
                        subtype_xmlid='mail.mt_comment',
                    )
            except Exception as inner_e:
                _logger.error('❌ Failed to post error message: %s', str(inner_e))

        return message
