# -*- coding: utf-8 -*-

import secrets
from datetime import datetime, timedelta
from odoo import models, fields, api
from odoo.exceptions import UserError, ValidationError

import logging
_logger = logging.getLogger(__name__)


class QrSession(models.Model):
    """点餐会话模型 - 用于防恶意点餐和状态管理"""
    _name = 'qr.session'
    _description = 'QR Ordering Session / 点餐会话'
    _order = 'create_date desc'

    name = fields.Char(
        string='Session ID / 会话ID',
        required=True,
        readonly=True,
        default=lambda self: self._generate_session_id(),
        copy=False
    )
    
    # 关联餐桌
    table_id = fields.Many2one(
        'qr.table',
        string='Table / 餐桌',
        required=True,
        ondelete='cascade'
    )
    
    # 动态 Token（防止二维码被分享）
    access_token = fields.Char(
        string='Access Token / 访问令牌',
        required=True,
        readonly=True,
        default=lambda self: secrets.token_urlsafe(32),
        copy=False,
        help='客户端访问令牌，每次扫码生成新的'
    )
    
    # 会话状态
    state = fields.Selection([
        ('active', 'Active / 活跃'),
        ('ordering', 'Ordering / 点餐中'),
        ('waiting', 'Waiting / 等待上菜'),
        ('serving', 'Serving / 用餐中'),
        ('closed', 'Closed / 已关闭'),
    ], string='Status / 状态', default='active', required=True)
    
    # 时间控制
    expire_time = fields.Datetime(
        string='Expire Time / 过期时间',
        required=True,
        default=lambda self: fields.Datetime.now() + timedelta(hours=4),
        help='会话过期时间，默认4小时'
    )
    end_time = fields.Datetime(
        string='End Time / 结束时间',
        readonly=True,
        help='会话实际结束时间'
    )
    
    # 客户端信息
    client_ip = fields.Char(
        string='Client IP / 客户端IP',
        help='首次访问的客户端IP'
    )
    user_agent = fields.Char(
        string='User Agent / 浏览器信息'
    )
    
    # 关联订单
    order_ids = fields.One2many(
        'qr.order',
        'session_id',
        string='Orders / 订单'
    )
    order_count = fields.Integer(
        string='Order Count / 订单数',
        compute='_compute_order_count'
    )
    
    # 总金额
    total_amount = fields.Float(
        string='Total Amount / 总金额',
        compute='_compute_total_amount',
        store=True
    )

    _sql_constraints = [
        ('access_token_unique', 'unique(access_token)', 'Access token must be unique!'),
    ]

    @api.model
    def _generate_session_id(self):
        """生成会话ID"""
        return f"QRS-{fields.Datetime.now().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4).upper()}"

    def _compute_order_count(self):
        """计算订单数量"""
        for record in self:
            record.order_count = len(record.order_ids)

    @api.depends('order_ids.total_amount')
    def _compute_total_amount(self):
        """计算总金额"""
        for record in self:
            record.total_amount = sum(record.order_ids.mapped('total_amount'))

    def action_close(self):
        """关闭会话"""
        for record in self:
            record.state = 'closed'
            record.end_time = fields.Datetime.now()
            
            # 清除餐桌的当前会话引用
            if record.table_id.current_session_id == record:
                record.table_id.current_session_id = False
                # 如果没有未完成订单，将餐桌状态设为可用
                if not record.order_ids.filtered(lambda o: o.state not in ['cancelled', 'paid']):
                    record.table_id.state = 'available'
                    
                    # 注意：Odoo 18 中 restaurant.table 没有 state 字段
                    # POS 通过检查是否有 draft 状态的 pos.order 来判断餐桌是否被占用
                    # 当 POS 订单支付后，POS 端会自动显示餐桌空闲
                    _logger.info(f"QR session closed for table {record.table_id.name}")
        return True

    def action_extend(self, hours=2):
        """延长会话有效期"""
        for record in self:
            record.expire_time = fields.Datetime.now() + timedelta(hours=hours)
        return True

    @api.model
    def validate_access(self, table_token, access_token, client_ip=None):
        """
        验证访问权限
        返回: (session, error_code, error_message)

        多人点餐支持：
        - 同一个桌台可以有多人同时扫码点餐
        - 所有人共享同一个会话（current_session_id）
        - access_token 用于区分不同客户端，但不阻止新客户加入
        """
        # 查找餐桌
        table = self.env['qr.table'].sudo().search([
            ('qr_token', '=', table_token),
            ('active', '=', True)
        ], limit=1)

        if not table:
            return None, 'TABLE_NOT_FOUND', '餐桌不存在或已禁用'

        # 检查餐桌是否有活跃会话
        if table.current_session_id and table.current_session_id.state != 'closed':
            current_session = table.current_session_id

            # 检查会话是否过期
            if current_session.expire_time < fields.Datetime.now():
                current_session.action_close()
                # 会话过期，创建新会话
                return self._create_new_session(table, client_ip)

            # 如果提供了 access_token，验证是否匹配
            if access_token:
                if current_session.access_token == access_token:
                    # token 匹配，返回现有会话
                    return current_session, None, None

            # 多人点餐：允许新客户加入现有会话
            # 直接返回当前会话，让所有人共享
            _logger.info(f"New client joined existing session {current_session.name} for table {table.name}")
            return current_session, None, None

        # 没有活跃会话，创建新会话
        return self._create_new_session(table, client_ip)

    def _create_new_session(self, table, client_ip=None):
        """创建新的点餐会话"""
        # 关闭餐桌的旧会话
        if table.current_session_id and table.current_session_id.state != 'closed':
            # 如果有活跃订单，不允许创建新会话
            if table.current_session_id.order_ids.filtered(lambda o: o.state not in ['cancelled', 'paid']):
                return None, 'TABLE_HAS_ORDERS', '该餐桌有未完成的订单，请联系服务员'
            table.current_session_id.action_close()
        
        # 创建新会话
        session = self.sudo().create({
            'table_id': table.id,
            'client_ip': client_ip,
        })
        
        # 更新餐桌状态
        table.sudo().write({
            'state': 'occupied',
            'current_session_id': session.id,
        })
        
        # 注意：Odoo 18 中 restaurant.table 没有 state 字段
        # POS 通过检查是否有 draft 状态的 pos.order 来判断餐桌是否被占用
        # QR 订单提交时会自动创建关联到餐桌的 POS 订单，从而在 POS 端显示餐桌被占用
        _logger.info(f"Created QR session {session.name} for table {table.name}")
        
        return session, None, None

    @api.model
    def cleanup_expired_sessions(self):
        """定时任务：清理过期会话"""
        expired = self.search([
            ('state', 'not in', ['closed']),
            ('expire_time', '<', fields.Datetime.now()),
        ])
        for session in expired:
            _logger.info(f"Closing expired session: {session.name}")
            session.action_close()
        return True

