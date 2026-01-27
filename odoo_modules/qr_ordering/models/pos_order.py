# -*- coding: utf-8 -*-

from odoo import models, fields, api
import logging

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    """继承 pos.order，处理 QR 订单双向同步和餐桌释放"""
    _inherit = 'pos.order'

    # 关联的 QR 订单（One2many，支持多个 QR 订单合并到一个 POS 订单）
    # 注意：这些字段不会加载到 POS 前端，仅用于后端关联
    qr_order_ids = fields.One2many(
        'qr.order',
        'pos_order_id',
        string='QR Orders / QR订单',
        readonly=True,
        help='关联的 QR 扫码订单（可能有多个）'
    )
    qr_order_count = fields.Integer(
        string='QR Order Count',
        compute='_compute_qr_order_count',
        store=True
    )
    qr_source = fields.Boolean(
        string='From QR / 来自QR',
        default=False,
        help='是否来自 QR 扫码点餐（由 QR 订单同步时显式设置）'
    )

    @api.depends('qr_order_ids')
    def _compute_qr_order_count(self):
        for order in self:
            order.qr_order_count = len(order.qr_order_ids)

    @api.model_create_multi
    def create(self, vals_list):
        """
        Override create to handle QR order integration.

        When POS tries to create a new order for a table that already has a
        draft QR order with lines, we merge the QR order's lines into the
        new order instead of creating a duplicate.
        """
        result = super().create(vals_list)

        for order in result:
            if order.table_id and not order.lines:
                # Check if there's an existing draft order with lines for this table
                existing_order = self.env['pos.order'].sudo().search([
                    ('table_id', '=', order.table_id.id),
                    ('session_id', '=', order.session_id.id),
                    ('state', '=', 'draft'),
                    ('id', '!=', order.id),
                ], order='create_date desc', limit=1)

                if existing_order and existing_order.lines:
                    # Found an existing order with lines - copy them to the new order
                    _logger.info(f"[QR Merge] Merging lines from order {existing_order.name} ({len(existing_order.lines)} lines) to {order.name}")

                    for line in existing_order.lines:
                        # Copy the line to the new order
                        line.sudo().copy({
                            'order_id': order.id,
                        })

                    # Copy amount fields
                    order.sudo().write({
                        'amount_total': existing_order.amount_total,
                        'amount_tax': existing_order.amount_tax,
                        'qr_source': existing_order.qr_source,
                    })

                    # Update QR order link to point to the new order
                    for qr_order in existing_order.qr_order_ids:
                        qr_order.sudo().write({'pos_order_id': order.id})

                    # Cancel the old order to avoid duplicates
                    existing_order.sudo().write({'state': 'cancel'})
                    _logger.info(f"[QR Merge] Cancelled old order {existing_order.name}")

                    # Refresh the order to get updated line count
                    order.invalidate_recordset(['lines', 'amount_total', 'amount_tax'])
                    _logger.info(f"[QR Merge] Completed merge, new order {order.name} now has {len(order.lines)} lines")

        return result

    def write(self, vals):
        """Override write to sync changes back to QR orders"""
        result = super().write(vals)

        # 同步状态变化到关联的 QR 订单
        if 'state' in vals:
            self._sync_state_to_qr_orders(vals['state'])

        return result

    def _sync_state_to_qr_orders(self, pos_state):
        """同步 POS 订单状态到所有关联的 QR 订单"""
        # POS 状态到 QR 状态的映射
        state_mapping = {
            'draft': None,  # draft 状态不同步
            'paid': 'paid',
            'done': 'paid',
            'invoiced': 'paid',
            'cancel': 'cancelled',
        }

        qr_state = state_mapping.get(pos_state)
        if not qr_state:
            return

        for order in self:
            # 同步到所有关联的 QR 订单
            for qr_order in order.qr_order_ids:
                if qr_order.state not in ['paid', 'cancelled']:
                    try:
                        qr_order.sudo().write({'state': qr_state})
                        _logger.info(f"Synced POS order {order.name} state '{pos_state}' -> QR order {qr_order.name} state '{qr_state}'")
                    except Exception as e:
                        _logger.warning(f"Failed to sync state to QR order {qr_order.name}: {e}")

    def _export_for_ui(self, order):
        """Override to exclude qr fields from POS frontend, but add qr_source"""
        result = super()._export_for_ui(order)
        # 移除 qr 相关字段，避免 POS 前端尝试加载 qr.order 模型
        result.pop('qr_order_ids', None)
        result.pop('qr_order_count', None)
        # 直接添加 qr_source 值，用于 POS 前端过滤浮动订单按钮
        result['qr_source'] = order.qr_source
        return result

    def action_pos_order_paid(self):
        """支付完成后同步 QR 订单状态并释放餐桌"""
        res = super().action_pos_order_paid()

        for order in self:
            # 1. 同步所有关联的 QR 订单状态为已支付
            for qr_order in order.qr_order_ids:
                try:
                    qr_order.sudo().write({'state': 'paid'})
                    _logger.info(f"Synced QR order {qr_order.name} state to 'paid'")
                except Exception as e:
                    _logger.warning(f"Failed to sync QR order {qr_order.name} state: {e}")

            # 2. 如果订单关联了餐桌，处理同桌台的所有订单
            if order.table_id:
                try:
                    # 2a. 查找同桌台的其他 draft 订单并取消
                    other_draft_orders = self.env['pos.order'].sudo().search([
                        ('table_id', '=', order.table_id.id),
                        ('session_id', '=', order.session_id.id),
                        ('state', '=', 'draft'),
                        ('id', '!=', order.id)
                    ])

                    if other_draft_orders:
                        # 先同步这些订单关联的所有 QR 订单状态
                        for draft_order in other_draft_orders:
                            for qr_order in draft_order.qr_order_ids:
                                qr_order.sudo().write({'state': 'paid'})

                        # 取消这些 draft 订单
                        other_draft_orders.write({'state': 'cancel'})
                        _logger.info(f"Cancelled {len(other_draft_orders)} other draft orders for table {order.table_id.id}")

                    # 2b. 查找对应的 QR 餐桌并释放
                    qr_table = self.env['qr.table'].sudo().search([
                        ('pos_table_id', '=', order.table_id.id)
                    ], limit=1)

                    if qr_table and qr_table.current_session_id:
                        # 检查该餐桌是否还有其他未支付的 POS 订单
                        remaining_unpaid = self.env['pos.order'].sudo().search([
                            ('table_id', '=', order.table_id.id),
                            ('state', 'not in', ['paid', 'cancel']),
                            ('id', '!=', order.id)
                        ])

                        if not remaining_unpaid:
                            # 将该会话的所有未完成 QR 订单标记为已支付
                            qr_orders = self.env['qr.order'].sudo().search([
                                ('session_id', '=', qr_table.current_session_id.id),
                                ('state', 'not in', ['paid', 'cancelled'])
                            ])
                            if qr_orders:
                                qr_orders.write({'state': 'paid'})
                                _logger.info(f"Marked {len(qr_orders)} QR orders as paid")

                            # 关闭会话并释放餐桌
                            qr_table.current_session_id.sudo().action_close()
                            qr_table.sudo().write({
                                'state': 'available',
                                'current_session_id': False,
                            })
                            _logger.info(f"Released QR table {qr_table.name} after payment")

                except Exception as e:
                    _logger.warning(f"Failed to process table cleanup after payment: {e}")

        return res
