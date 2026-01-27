# -*- coding: utf-8 -*-

from odoo import models, fields, api

import logging
_logger = logging.getLogger(__name__)


class ProductTemplate(models.Model):
    """产品模板扩展 - 添加视频支持"""
    _inherit = 'product.template'

    # 视频支持
    qr_video = fields.Binary(
        string='Product Video / 菜品视频',
        attachment=True,
        help='上传菜品展示视频（建议小于30MB）'
    )
    qr_video_filename = fields.Char(
        string='Video Filename / 视频文件名'
    )
    qr_video_url = fields.Char(
        string='Video URL / 视频链接',
        help='外部视频链接（如 YouTube、阿里云等）'
    )
    
    # 扫码点餐专用字段
    qr_short_desc = fields.Text(
        string='Short Description / 简短描述',
        translate=True,
        help='扫码点餐界面显示的简短描述'
    )
    qr_available = fields.Boolean(
        string='Available for QR Ordering / 可扫码点餐',
        default=True,
        help='是否在扫码点餐界面显示'
    )
    qr_highlight = fields.Boolean(
        string='Highlight / 推荐',
        default=False,
        help='是否在扫码点餐界面突出显示'
    )
    qr_pinned = fields.Boolean(
        string='Pinned / 置顶',
        default=False,
        help='是否在置顶视频区展示（视频轮播）'
    )
    qr_pinned_sequence = fields.Integer(
        string='Pinned Sequence / 置顶排序',
        default=10,
        help='置顶区排序，数字越小越靠前'
    )
    qr_sold_out = fields.Boolean(
        string='Sold Out / 售罄',
        default=False,
        help='临时售罄状态'
    )
    
    # 多语言标签
    qr_tags = fields.Many2many(
        'qr.product.tag',
        string='Tags / 标签',
        help='菜品标签：辣、素食、推荐等'
    )

    def get_qr_video_url(self):
        """获取视频 URL"""
        self.ensure_one()
        if self.qr_video_url:
            return self.qr_video_url
        elif self.qr_video:
            # 返回 Odoo 附件 URL
            attachment = self.env['ir.attachment'].search([
                ('res_model', '=', 'product.template'),
                ('res_id', '=', self.id),
                ('res_field', '=', 'qr_video'),
            ], limit=1)
            if attachment:
                return f'/web/content/{attachment.id}'
        return None


class ProductProduct(models.Model):
    """产品变体扩展"""
    _inherit = 'product.product'

    def get_qr_ordering_data(self, lang='zh_CN', pos_config=None):
        """获取扫码点餐数据

        Args:
            lang: 语言代码
            pos_config: POS 配置，用于获取税率和财务位置
        """
        self.ensure_one()

        # 切换语言上下文
        product = self.with_context(lang=lang)
        template = product.product_tmpl_id

        # 基础价格（不含税）
        price = self.lst_price

        # 如果提供了 POS 配置，计算含税价格
        price_with_tax = price
        tax_rate = 0.0
        if pos_config:
            company = pos_config.company_id
            fiscal_position = pos_config.default_fiscal_position_id
            taxes = self.taxes_id.filtered(lambda t: t.company_id == company)
            if fiscal_position:
                taxes = fiscal_position.map_tax(taxes)
            if taxes:
                # 计算含税价格
                tax_result = taxes.compute_all(price, product=self)
                price_with_tax = tax_result['total_included']
                if price > 0:
                    tax_rate = (price_with_tax - price) / price * 100

        return {
            'id': self.id,
            'name': product.name,
            'price': price,  # 不含税价格
            'price_with_tax': price_with_tax,  # 含税价格
            'tax_rate': tax_rate,  # 税率百分比
            'description': template.qr_short_desc or template.description_sale or '',
            # 使用公开图片 URL（无需认证）
            'image_url': f'/qr/image/product/{self.id}?size=256',
            'video_url': template.get_qr_video_url(),
            'category_id': self.pos_categ_ids[0].id if self.pos_categ_ids else False,
            'category_name': self.pos_categ_ids[0].name if self.pos_categ_ids else '',
            'available': template.qr_available and not template.qr_sold_out,
            'sold_out': template.qr_sold_out,
            'highlight': template.qr_highlight,
            'pinned': template.qr_pinned,
            'pinned_sequence': template.qr_pinned_sequence,
            'tags': [{'id': t.id, 'name': t.name, 'color': t.color} for t in template.qr_tags],
        }


class QrProductTag(models.Model):
    """菜品标签"""
    _name = 'qr.product.tag'
    _description = 'Product Tag / 菜品标签'
    _order = 'sequence, name'

    name = fields.Char(
        string='Tag Name / 标签名',
        required=True,
        translate=True
    )
    sequence = fields.Integer(
        string='Sequence / 排序',
        default=10
    )
    color = fields.Char(
        string='Color / 颜色',
        default='#FF6B6B',
        help='标签显示颜色（十六进制）'
    )
    icon = fields.Char(
        string='Icon / 图标',
        help='图标名称或 emoji'
    )
    
    # 预设标签
    tag_type = fields.Selection([
        ('spicy', 'Spicy / 辣'),
        ('vegetarian', 'Vegetarian / 素食'),
        ('recommended', 'Recommended / 推荐'),
        ('new', 'New / 新品'),
        ('popular', 'Popular / 人气'),
        ('healthy', 'Healthy / 健康'),
        ('custom', 'Custom / 自定义'),
    ], string='Tag Type / 标签类型', default='custom')

    _sql_constraints = [
        ('name_unique', 'unique(name)', 'Tag name must be unique!'),
    ]

