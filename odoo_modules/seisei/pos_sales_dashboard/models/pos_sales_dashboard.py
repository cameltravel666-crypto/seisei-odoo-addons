import logging
from datetime import datetime, timedelta

import pytz

from odoo import api, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

# Keywords to auto-detect drink categories (case-insensitive)
DRINK_KEYWORDS = [
    'drink', 'drinks', 'beverage', 'beverages',
    'ドリンク', '飲み物', '飲料',
    '酒', 'アルコール', 'ビール', 'ワイン', 'カクテル', 'サワー', 'ハイボール',
    'ソフトドリンク', 'ジュース', 'お茶', 'コーヒー',
]


class PosSalesDashboard(models.AbstractModel):
    _name = 'pos.sales.dashboard'
    _description = 'POS Sales Dashboard'

    @api.model
    def get_dashboard_data(self, date_str, mode='day', config_ids=None):
        """Main RPC endpoint for the dashboard.

        Args:
            date_str: Date string in 'YYYY-MM-DD' format (local date).
            mode: 'day' or 'month'.
            config_ids: List of pos.config IDs to filter, or None/[] for all.

        Returns:
            dict with 'kpis', 'comparison', 'ranking', 'configs' keys.
        """
        if mode not in ('day', 'month'):
            raise UserError("Invalid mode: %r. Expected 'day' or 'month'." % mode)
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
        except (ValueError, TypeError):
            raise UserError("Invalid date format: %r. Expected YYYY-MM-DD." % date_str)

        config_ids = config_ids or []
        current_start, current_end = self._get_date_range(date_str, mode)
        prev_start, prev_end = self._get_prev_date_range(date_str, mode)

        drink_category_ids = self._get_drink_category_ids()
        drink_product_ids = self._get_drink_product_ids(drink_category_ids)

        current_kpis = self._compute_kpis(
            current_start, current_end, config_ids, drink_product_ids,
        )
        prev_kpis = self._compute_kpis(
            prev_start, prev_end, config_ids, drink_product_ids,
        )

        comparison = {}
        for key in ('total_sales', 'order_count', 'avg_amount', 'food_sales', 'drink_sales'):
            comparison[key] = self._pct_change(
                current_kpis.get(key, 0), prev_kpis.get(key, 0),
            )

        ranking = self._compute_ranking(
            current_start, current_end, config_ids,
        )

        configs = self._get_pos_configs()

        return {
            'kpis': current_kpis,
            'comparison': comparison,
            'ranking': ranking,
            'configs': configs,
            'currency': self._get_currency_info(),
        }

    @api.model
    def _get_date_range(self, date_str, mode):
        """Convert local date string to UTC datetime range."""
        tz = pytz.timezone(
            self.env.user.tz or self.env.company.partner_id.tz or 'Asia/Tokyo'
        )
        local_date = datetime.strptime(date_str, '%Y-%m-%d')

        if mode == 'month':
            start_local = local_date.replace(day=1, hour=0, minute=0, second=0)
            if start_local.month == 12:
                end_local = start_local.replace(year=start_local.year + 1, month=1)
            else:
                end_local = start_local.replace(month=start_local.month + 1)
        else:
            start_local = local_date.replace(hour=0, minute=0, second=0)
            end_local = start_local + timedelta(days=1)

        start_utc = tz.localize(start_local).astimezone(pytz.utc)
        end_utc = tz.localize(end_local).astimezone(pytz.utc)
        return (
            start_utc.strftime('%Y-%m-%d %H:%M:%S'),
            end_utc.strftime('%Y-%m-%d %H:%M:%S'),
        )

    @api.model
    def _get_prev_date_range(self, date_str, mode):
        """Get the comparison period date range."""
        local_date = datetime.strptime(date_str, '%Y-%m-%d')

        if mode == 'month':
            if local_date.month == 1:
                prev_date = local_date.replace(year=local_date.year - 1, month=12)
            else:
                prev_date = local_date.replace(month=local_date.month - 1)
        else:
            prev_date = local_date - timedelta(days=1)

        return self._get_date_range(prev_date.strftime('%Y-%m-%d'), mode)

    @api.model
    def _get_drink_category_ids(self):
        """Auto-detect drink categories by name matching."""
        categories = self.env['pos.category'].sudo().search([])
        drink_ids = []
        for cat in categories:
            cat_name = (cat.name or '').lower().strip()
            if any(kw.lower() in cat_name for kw in DRINK_KEYWORDS):
                drink_ids.append(cat.id)
        return drink_ids

    @api.model
    def _get_drink_product_ids(self, drink_category_ids):
        """Get product IDs that belong to drink categories."""
        if not drink_category_ids:
            return []
        products = self.env['product.product'].sudo().search([
            ('pos_categ_ids', 'in', drink_category_ids),
            ('available_in_pos', '=', True),
        ])
        return products.ids

    @api.model
    def _compute_kpis(self, date_from, date_to, config_ids, drink_product_ids):
        """Compute sales KPIs for a given period using SQL."""
        # Query 1: totals from pos_order
        query = """
            SELECT
                COALESCE(SUM(po.amount_total), 0) AS total_sales,
                COUNT(po.id) AS order_count,
                COALESCE(AVG(po.amount_total), 0) AS avg_amount
            FROM pos_order po
            JOIN pos_session ps ON po.session_id = ps.id
            WHERE po.date_order >= %s
              AND po.date_order < %s
              AND po.state IN ('paid', 'done', 'invoiced')
        """
        params = [date_from, date_to]
        if config_ids:
            query += " AND ps.config_id = ANY(%s)"
            params.append(config_ids)

        self.env.cr.execute(query, params)
        row = self.env.cr.dictfetchone()

        total_sales = float(row['total_sales'])
        order_count = int(row['order_count'])
        avg_amount = float(row['avg_amount'])

        # Query 2: food vs drink split from order lines
        food_sales = 0.0
        drink_sales = 0.0

        if drink_product_ids:
            # Drink sales
            drink_query = """
                SELECT COALESCE(SUM(pol.price_subtotal_incl), 0) AS drink_total
                FROM pos_order_line pol
                JOIN pos_order po ON pol.order_id = po.id
                JOIN pos_session ps ON po.session_id = ps.id
                WHERE po.date_order >= %s
                  AND po.date_order < %s
                  AND po.state IN ('paid', 'done', 'invoiced')
                  AND pol.product_id = ANY(%s)
            """
            drink_params = [date_from, date_to, drink_product_ids]
            if config_ids:
                drink_query += " AND ps.config_id = ANY(%s)"
                drink_params.append(config_ids)

            self.env.cr.execute(drink_query, drink_params)
            drink_row = self.env.cr.dictfetchone()
            drink_sales = float(drink_row['drink_total'])

            # Food = total line sales - drink sales
            line_query = """
                SELECT COALESCE(SUM(pol.price_subtotal_incl), 0) AS line_total
                FROM pos_order_line pol
                JOIN pos_order po ON pol.order_id = po.id
                JOIN pos_session ps ON po.session_id = ps.id
                WHERE po.date_order >= %s
                  AND po.date_order < %s
                  AND po.state IN ('paid', 'done', 'invoiced')
            """
            line_params = [date_from, date_to]
            if config_ids:
                line_query += " AND ps.config_id = ANY(%s)"
                line_params.append(config_ids)

            self.env.cr.execute(line_query, line_params)
            line_row = self.env.cr.dictfetchone()
            food_sales = float(line_row['line_total']) - drink_sales
        else:
            # No drink categories detected - all sales are food
            line_query = """
                SELECT COALESCE(SUM(pol.price_subtotal_incl), 0) AS line_total
                FROM pos_order_line pol
                JOIN pos_order po ON pol.order_id = po.id
                JOIN pos_session ps ON po.session_id = ps.id
                WHERE po.date_order >= %s
                  AND po.date_order < %s
                  AND po.state IN ('paid', 'done', 'invoiced')
            """
            line_params = [date_from, date_to]
            if config_ids:
                line_query += " AND ps.config_id = ANY(%s)"
                line_params.append(config_ids)

            self.env.cr.execute(line_query, line_params)
            line_row = self.env.cr.dictfetchone()
            food_sales = float(line_row['line_total'])

        return {
            'total_sales': total_sales,
            'order_count': order_count,
            'avg_amount': avg_amount,
            'food_sales': food_sales,
            'drink_sales': drink_sales,
        }

    @api.model
    def _compute_ranking(self, date_from, date_to, config_ids):
        """Compute top 10 products by quantity sold."""
        query = """
            SELECT
                pol.product_id,
                SUM(pol.qty) AS total_qty,
                SUM(pol.price_subtotal_incl) AS total_amount
            FROM pos_order_line pol
            JOIN pos_order po ON pol.order_id = po.id
            JOIN pos_session ps ON po.session_id = ps.id
            WHERE po.date_order >= %s
              AND po.date_order < %s
              AND po.state IN ('paid', 'done', 'invoiced')
        """
        params = [date_from, date_to]
        if config_ids:
            query += " AND ps.config_id = ANY(%s)"
            params.append(config_ids)
        query += """
            GROUP BY pol.product_id
            ORDER BY total_qty DESC
            LIMIT 10
        """

        self.env.cr.execute(query, params)
        rows = self.env.cr.dictfetchall()

        # Fetch product names via ORM to get proper translations
        product_ids = [r['product_id'] for r in rows]
        products = {
            p.id: p.display_name
            for p in self.env['product.product'].sudo().browse(product_ids)
        }

        return [
            {
                'product_id': r['product_id'],
                'product_name': products.get(r['product_id'], ''),
                'qty': float(r['total_qty']),
                'amount': float(r['total_amount']),
            }
            for r in rows
        ]

    @api.model
    def _get_pos_configs(self):
        """Return list of POS configurations for the filter dropdown."""
        configs = self.env['pos.config'].sudo().search([])
        return [{'id': c.id, 'name': c.name} for c in configs]

    @api.model
    def _get_currency_info(self):
        """Return company currency info for formatting."""
        currency = self.env.company.currency_id
        return {
            'symbol': currency.symbol,
            'position': currency.position,
            'decimal_places': currency.decimal_places,
        }

    @staticmethod
    def _pct_change(current, previous):
        """Calculate percentage change between two values."""
        if not previous:
            return 0.0 if not current else 100.0
        return round((current - previous) / abs(previous) * 100, 1)
