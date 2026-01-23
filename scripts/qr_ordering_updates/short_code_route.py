# Add this route to qr_ordering_controller.py after the existing /qr/order route

    @http.route('/qr/s/<string:short_code>', type='http', auth='public', website=False)
    def qr_order_short(self, short_code, menu_ui_v2=None, **kwargs):
        """短代码点餐入口 - 重定向到完整链接"""
        try:
            # 通过短代码查找餐桌
            table = request.env['qr.table'].sudo().search([
                ('short_code', '=', short_code.upper()),
                ('active', '=', True)
            ], limit=1)

            if not table:
                return request.render('qr_ordering.qr_error', {
                    'error_title': 'Invalid Code / 无效代码',
                    'error_message': f'Short code "{short_code}" not found. 短代码 "{short_code}" 不存在。'
                })

            # 重定向到完整的点餐链接
            if menu_ui_v2:
                return request.redirect(f'/qr/order/{table.qr_token}?menu_ui_v2=1')
            return request.redirect(f'/qr/order/{table.qr_token}')

        except Exception as e:
            _logger.error(f"Short code lookup error: {e}")
            return request.render('qr_ordering.qr_error', {
                'error_title': 'Error / 错误',
                'error_message': str(e)
            })
