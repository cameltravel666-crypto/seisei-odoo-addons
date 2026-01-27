# -*- coding: utf-8 -*-
"""
统一多渠道客服管理模型
在Odoo中显示和管理来自微信、WhatsApp的所有客户消息
"""
from odoo import models, fields, api
from odoo.exceptions import UserError
import requests
import logging
import json

_logger = logging.getLogger(__name__)


class UnifiedChannelConfig(models.Model):
    """多渠道配置"""
    _name = 'unified.channel.config'
    _description = '多渠道客服配置'
    
    name = fields.Char('渠道名称', required=True)
    channel_type = fields.Selection([
        ('wechat', '微信'),
        ('whatsapp', 'WhatsApp'),
    ], string='渠道类型', required=True)
    
    # API配置
    api_url = fields.Char('API地址', default='http://localhost:8000')
    config_json = fields.Text('配置JSON', help='渠道的配置信息（API密钥等）')
    
    is_enabled = fields.Boolean('启用', default=True)
    
    # 统计信息
    total_messages = fields.Integer('总消息数', default=0)
    last_message_at = fields.Datetime('最后消息时间')
    
    # 关联的会话
    conversation_ids = fields.One2many('unified.conversation', 'channel_config_id', string='会话')
    
    @api.model
    def create(self, vals):
        """创建时同步到AI中台"""
        record = super().create(vals)
        record._sync_to_api()
        return record
    
    def write(self, vals):
        """更新时同步到AI中台"""
        result = super().write(vals)
        if 'config_json' in vals or 'is_enabled' in vals:
            self._sync_to_api()
        return result
    
    def _sync_to_api(self):
        """同步配置到AI中台"""
        for record in self:
            if not record.is_enabled:
                continue
            
            try:
                config = json.loads(record.config_json) if record.config_json else {}
                
                payload = {
                    "channel_type": record.channel_type,
                    "channel_name": record.name,
                    "name": record.name,  # 保持兼容性
                    "config": config,
                    "is_enabled": record.is_enabled
                }
                
                # 获取租户信息（从系统参数）
                tenant_id = self.env['ir.config_parameter'].sudo().get_param('ai_companion.tenant_id')
                headers = {}
                if tenant_id:
                    headers['X-Tenant-ID'] = tenant_id
                
                response = requests.post(
                    f"{record.api_url}/api/v1/channels/config",
                    json=payload,
                    headers=headers,
                    timeout=10
                )
                
                if response.status_code == 200:
                    _logger.info(f"✅ 渠道配置同步成功: {record.name}")
                else:
                    _logger.error(f"❌ 渠道配置同步失败: {response.text}")
            except Exception as e:
                _logger.error(f"同步渠道配置异常: {e}")


class UnifiedConversation(models.Model):
    """统一会话（跨渠道）"""
    _name = 'unified.conversation'
    _description = '统一客服会话'
    _order = 'last_message_at desc'
    
    name = fields.Char('会话标题', required=True)
    conversation_id = fields.Char('会话ID', required=True, index=True)
    
    # 渠道信息
    channel_config_id = fields.Many2one('unified.channel.config', string='渠道')
    channel_type = fields.Selection(related='channel_config_id.channel_type', string='渠道类型', store=True)
    
    # 用户信息
    unified_user_id = fields.Char('统一用户ID', index=True)
    channel_user_ids = fields.Text('渠道用户ID映射', help='JSON格式，存储用户在不同渠道的ID')
    
    # 消息
    message_ids = fields.One2many('unified.message', 'conversation_id', string='消息')
    message_count = fields.Integer('消息数', compute='_compute_message_count', store=True)
    last_message_at = fields.Datetime('最后消息时间', compute='_compute_last_message', store=True)
    
    # 状态
    state = fields.Selection([
        ('active', '进行中'),
        ('closed', '已关闭'),
        ('archived', '已归档'),
    ], string='状态', default='active')
    
    assigned_to = fields.Many2one('res.users', string='分配给')
    
    # 计算字段
    @api.depends('message_ids')
    def _compute_message_count(self):
        for record in self:
            record.message_count = len(record.message_ids)
    
    @api.depends('message_ids.created_at')
    def _compute_last_message(self):
        for record in self:
            if record.message_ids:
                record.last_message_at = max(record.message_ids.mapped('created_at'))
            else:
                record.last_message_at = False
    
    def action_view_messages(self):
        """查看消息"""
        return {
            'name': '消息列表',
            'type': 'ir.actions.act_window',
            'res_model': 'unified.message',
            'view_mode': 'list,form',
            'domain': [('conversation_id', '=', self.id)],
            'context': {'default_conversation_id': self.id},
        }
    
    def action_send_message(self):
        """发送消息"""
        return {
            'name': '发送消息',
            'type': 'ir.actions.act_window',
            'res_model': 'unified.message.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_conversation_id': self.id,
                'default_channel_type': self.channel_type,
                'default_user_id': self.unified_user_id,
            },
        }


class UnifiedMessage(models.Model):
    """统一消息"""
    _name = 'unified.message'
    _description = '多渠道消息'
    _order = 'created_at asc'
    
    conversation_id = fields.Many2one('unified.conversation', string='会话', required=True, ondelete='cascade')
    
    # 消息内容
    message_type = fields.Selection([
        ('text', '文本'),
        ('image', '图片'),
        ('video', '视频'),
        ('audio', '音频'),
        ('file', '文件'),
        ('location', '位置'),
        ('sticker', '贴纸'),
    ], string='消息类型', default='text')
    
    content = fields.Text('内容')
    media_url = fields.Char('媒体URL')
    
    # 方向
    direction = fields.Selection([
        ('incoming', '客户消息'),
        ('outgoing', '客服消息'),
    ], string='方向', required=True)
    
    # 时间
    created_at = fields.Datetime('时间', required=True, default=fields.Datetime.now)
    
    # 元数据
    metadata_json = fields.Text('元数据', help='JSON格式的额外信息')
    
    @api.model
    def sync_from_api(self):
        """从AI中台同步消息"""
        # 获取API地址
        api_url = self.env['ir.config_parameter'].sudo().get_param('ai_companion.api_url', 'http://localhost:8000')
        tenant_id = self.env['ir.config_parameter'].sudo().get_param('ai_companion.tenant_id')
        
        headers = {}
        if tenant_id:
            headers['X-Tenant-ID'] = tenant_id
        
        try:
            # 获取会话列表
            response = requests.get(
                f"{api_url}/api/v1/channels/conversations",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                # 处理同步逻辑
                _logger.info(f"同步消息: {len(data.get('conversations', []))} 个会话")
        except Exception as e:
            _logger.error(f"同步消息失败: {e}")
    
    def action_send_reply(self):
        """发送回复"""
        return {
            'name': '发送回复',
            'type': 'ir.actions.act_window',
            'res_model': 'unified.message.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_conversation_id': self.conversation_id.id,
                'default_channel_type': self.conversation_id.channel_type,
                'default_user_id': self.conversation_id.unified_user_id,
            },
        }


class UnifiedMessageWizard(models.TransientModel):
    """发送消息向导"""
    _name = 'unified.message.wizard'
    _description = '发送消息向导'
    
    conversation_id = fields.Many2one('unified.conversation', string='会话', required=True)
    channel_type = fields.Char('渠道类型')
    user_id = fields.Char('用户ID')
    message = fields.Text('消息内容', required=True)
    
    def action_send(self):
        """发送消息"""
        api_url = self.env['ir.config_parameter'].sudo().get_param('ai_companion.api_url', 'http://localhost:8000')
        tenant_id = self.env['ir.config_parameter'].sudo().get_param('ai_companion.tenant_id')
        
        headers = {'Content-Type': 'application/json'}
        if tenant_id:
            headers['X-Tenant-ID'] = tenant_id
        
        try:
            # 获取渠道配置中的用户ID
            conversation = self.conversation_id
            channel_user_ids = json.loads(conversation.channel_user_ids) if conversation.channel_user_ids else {}
            channel_user_id = channel_user_ids.get(self.channel_type, self.user_id)
            
            response = requests.post(
                f"{api_url}/api/v1/channels/send",
                json={
                    "channel_type": self.channel_type,
                    "user_id": channel_user_id,
                    "message": self.message,
                },
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                # 创建消息记录
                self.env['unified.message'].create({
                    'conversation_id': self.conversation_id.id,
                    'message_type': 'text',
                    'content': self.message,
                    'direction': 'outgoing',
                })
                
                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': '成功',
                        'message': '消息已发送',
                        'type': 'success',
                        'sticky': False,
                    }
                }
            else:
                raise UserError(f"发送失败: {response.text}")
        except Exception as e:
            raise UserError(f"发送消息异常: {e}")

