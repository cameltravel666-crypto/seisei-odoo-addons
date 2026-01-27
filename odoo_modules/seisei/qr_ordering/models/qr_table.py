# -*- coding: utf-8 -*-

import hashlib
import secrets
import string
import base64
from io import BytesIO
from datetime import datetime, timedelta
from odoo import models, fields, api
from odoo.exceptions import UserError

import logging
_logger = logging.getLogger(__name__)

try:
    import qrcode
    QRCODE_AVAILABLE = True
except ImportError:
    QRCODE_AVAILABLE = False
    _logger.warning("qrcode library not installed. QR code image generation disabled.")


class QrTable(models.Model):
    """二维码餐桌模型 - 每个餐桌对应一个二维码"""
    _name = 'qr.table'
    _description = 'QR Code Table'
    _order = 'sequence, name'

    name = fields.Char(
        string='Table Name',
        required=True,
        help='餐桌的显示名称，如 A1, A2, 包厢1 等'
    )
    sequence = fields.Integer(
        string='Sequence',
        default=10
    )

    # 关联 POS 餐厅餐桌（如果使用 pos_restaurant）
    pos_table_id = fields.Many2one(
        'restaurant.table',
        string='POS Table',
        ondelete='set null',
        help='关联的 POS 餐厅餐桌'
    )

    # 关联 POS 配置
    pos_config_id = fields.Many2one(
        'pos.config',
        string='POS Config',
        required=True,
        help='订单将同步到此 POS 配置'
    )

    # 二维码相关
    qr_token = fields.Char(
        string='QR Token',
        readonly=True,
        copy=False,
        help='二维码中的唯一标识（长格式）'
    )

    # 短代码 - 6位字母数字
    short_code = fields.Char(
        string='Short Code',
        size=4,
        readonly=True,
        copy=False,
        index=True,
        help='6位短代码，用于快速访问（如 ABC123）'
    )

    qr_url = fields.Char(
        string='Order URL',
        compute='_compute_qr_url',
        store=False,
        help='扫码后打开的点餐链接 (V1 原版)'
    )
    qr_url_v2 = fields.Char(
        string='Order URL V2',
        compute='_compute_qr_url',
        store=False,
        help='扫码后打开的点餐链接 (V2 移动端优化版)'
    )
    short_url = fields.Char(
        string='Short URL',
        compute='_compute_qr_url',
        store=False,
        help='使用短代码的点餐链接'
    )
    qr_code_image = fields.Binary(
        string='QR Code',
        compute='_compute_qr_code_image',
        store=False,
        help='二维码图片（自动生成）'
    )

    # 状态
    active = fields.Boolean(
        string='Active',
        default=True
    )
    state = fields.Selection([
        ('available', 'Available'),
        ('occupied', 'Occupied'),
        ('reserved', 'Reserved'),
    ], string='Status', default='available')

    # 当前会话
    current_session_id = fields.Many2one(
        'qr.session',
        string='Current Session',
        readonly=True,
        help='当前正在使用的点餐会话'
    )

    # 统计
    order_count = fields.Integer(
        string='Order Count',
        compute='_compute_order_count'
    )

    _sql_constraints = [
        ('qr_token_unique', 'unique(qr_token)', 'QR Token must be unique!'),
        ('short_code_unique', 'unique(short_code)', 'Short code must be unique!'),
        ('name_pos_config_unique', 'unique(name, pos_config_id)', 'Table name must be unique per POS config!'),
    ]

    @api.model_create_multi
    def create(self, vals_list):
        """创建时自动生成 QR Token 和短代码"""
        for vals in vals_list:
            if not vals.get('qr_token'):
                vals['qr_token'] = self._generate_qr_token()
            if not vals.get('short_code'):
                vals['short_code'] = self._generate_short_code()
        return super().create(vals_list)

    def write(self, vals):
        """
        拦截 write，保护 qr_token 和 short_code 不被意外修改。
        """
        protected_fields = ['qr_token', 'short_code']
        if not self.env.context.get('allow_regenerate_qr_token'):
            for field in protected_fields:
                if field in vals:
                    _logger.warning(
                        f"Attempt to modify {field} blocked for tables {self.ids}. "
                        "Use action_regenerate_token() or set context allow_regenerate_qr_token=True"
                    )
                    vals = {k: v for k, v in vals.items() if k not in protected_fields}
                    break
        return super().write(vals)

    def copy(self, default=None):
        """复制餐桌时，强制生成新的 qr_token 和 short_code"""
        default = dict(default or {})
        default['qr_token'] = self._generate_qr_token()
        default['short_code'] = self._generate_short_code()
        return super().copy(default)

    def _generate_qr_token(self):
        """生成唯一的 QR Token"""
        return secrets.token_urlsafe(16)

    def _generate_short_code(self):
        """生成唯一的6位短代码（大写字母+数字）"""
        chars = string.ascii_uppercase + string.digits
        for _ in range(100):  # 最多尝试100次
            code = ''.join(secrets.choice(chars) for _ in range(4))
            # 检查是否已存在
            if not self.sudo().search_count([('short_code', '=', code)]):
                return code
        raise UserError('Unable to generate unique short code. Please try again.')

    def action_regenerate_token(self):
        """重新生成 QR Token 和短代码（使旧二维码失效）"""
        for record in self:
            record.with_context(allow_regenerate_qr_token=True).write({
                'qr_token': self._generate_qr_token(),
                'short_code': self._generate_short_code(),
            })
            _logger.info(f"QR token and short code regenerated for table {record.name} (id={record.id})")
            if record.current_session_id:
                record.current_session_id.action_close()
        return True

    @api.depends('qr_token', 'short_code')
    def _compute_qr_url(self):
        """计算点餐链接 (V1, V2 和短链接)"""
        qr_base_url = self.env['ir.config_parameter'].sudo().get_param(
            'qr_ordering.base_url',
            default='https://demo.nagashiro.top'
        )
        # 获取当前数据库名称，用于多租户环境下正确路由
        db_name = self.env.cr.dbname
        for record in self:
            if record.qr_token:
                record.qr_url = f"{qr_base_url}/qr/order/{record.qr_token}?db={db_name}"
                record.qr_url_v2 = f"{qr_base_url}/qr/order/{record.qr_token}?db={db_name}&menu_ui_v2=1"
            else:
                record.qr_url = False
                record.qr_url_v2 = False

            if record.short_code:
                record.short_url = f"{qr_base_url}/qr/s/{record.short_code}?db={db_name}"
            else:
                record.short_url = False

    @api.depends('short_code', 'qr_token')
    def _compute_qr_code_image(self):
        """生成二维码图片（使用短链接）"""
        for record in self:
            # 优先使用短链接生成二维码
            url = record.short_url or record.qr_url
            if not url or not QRCODE_AVAILABLE:
                record.qr_code_image = False
                continue
            try:
                qr = qrcode.QRCode(
                    version=1,
                    error_correction=qrcode.constants.ERROR_CORRECT_M,
                    box_size=10,
                    border=2,
                )
                qr.add_data(url)
                qr.make(fit=True)

                img = qr.make_image(fill_color="black", back_color="white")

                buffer = BytesIO()
                img.save(buffer, format='PNG')
                record.qr_code_image = base64.b64encode(buffer.getvalue())
            except Exception as e:
                _logger.error(f"Failed to generate QR code for table {record.name}: {e}")
                record.qr_code_image = False

    def _compute_order_count(self):
        """计算订单数量"""
        for record in self:
            record.order_count = self.env['qr.order'].search_count([
                ('table_id', '=', record.id)
            ])

    def action_view_orders(self):
        """查看该餐桌的所有订单"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': f'Orders - {self.name}',
            'res_model': 'qr.order',
            'view_mode': 'tree,form',
            'domain': [('table_id', '=', self.id)],
            'context': {'default_table_id': self.id},
        }

    def action_open_table(self):
        """开台 - 创建新的点餐会话"""
        self.ensure_one()
        if self.state == 'occupied' and self.current_session_id:
            raise UserError('餐桌正在使用中，请先结账或关闭当前会话')

        session = self.env['qr.session'].create({
            'table_id': self.id,
        })
        self.write({
            'state': 'occupied',
            'current_session_id': session.id,
        })
        return session

    def action_close_table(self):
        """结账/关台 - 关闭当前会话"""
        self.ensure_one()
        if self.current_session_id:
            self.current_session_id.action_close()
        self.write({
            'state': 'available',
            'current_session_id': False,
        })
        return True

    def action_print_qr_code(self):
        """打印二维码"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url': f'/qr/print/{self.qr_token}',
            'target': 'new',
        }
