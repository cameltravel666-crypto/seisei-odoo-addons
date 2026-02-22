from odoo import http, fields, _
from odoo.exceptions import AccessError
from odoo.http import request
from odoo.addons.portal.controllers.portal import CustomerPortal, pager as portal_pager


class HelpdeskPortal(CustomerPortal):

    def _prepare_home_portal_values(self, counters):
        values = super()._prepare_home_portal_values(counters)
        if 'helpdesk_count' in counters:
            partner = request.env.user.partner_id
            values['helpdesk_count'] = request.env['seisei.helpdesk.ticket'].sudo().search_count([
                ('partner_id', '=', partner.id),
            ])
        return values

    # ------------------------------------------------------------------
    # Ticket list
    # ------------------------------------------------------------------

    @http.route(
        ['/my/helpdesk/tickets', '/my/helpdesk/tickets/page/<int:page>'],
        type='http', auth='user', website=True,
    )
    def portal_helpdesk_tickets(self, page=1, sortby=None, filterby=None, **kw):
        partner = request.env.user.partner_id
        Ticket = request.env['seisei.helpdesk.ticket'].sudo()

        domain = [('partner_id', '=', partner.id)]

        sortings = {
            'date': {'label': _('Newest'), 'order': 'create_date desc'},
            'stage': {'label': _('Stage'), 'order': 'stage_id'},
            'priority': {'label': _('Priority'), 'order': 'priority desc'},
        }
        sortby = sortby or 'date'
        order = sortings[sortby]['order']

        filters = {
            'all': {'label': _('All'), 'domain': []},
            'open': {'label': _('Open'), 'domain': [('is_closed', '=', False)]},
            'closed': {'label': _('Closed'), 'domain': [('is_closed', '=', True)]},
        }
        filterby = filterby or 'all'
        domain += filters[filterby]['domain']

        ticket_count = Ticket.search_count(domain)
        pager = portal_pager(
            url='/my/helpdesk/tickets',
            url_args={'sortby': sortby, 'filterby': filterby},
            total=ticket_count,
            page=page,
            step=15,
        )
        tickets = Ticket.search(
            domain, order=order,
            limit=15, offset=pager['offset'],
        )

        values = {
            'tickets': tickets,
            'page_name': 'helpdesk_tickets',
            'default_url': '/my/helpdesk/tickets',
            'pager': pager,
            'sortings': sortings,
            'sortby': sortby,
            'filters': filters,
            'filterby': filterby,
        }
        return request.render(
            'seisei_helpdesk_portal.portal_my_tickets', values,
        )

    # ------------------------------------------------------------------
    # Ticket detail
    # ------------------------------------------------------------------

    @http.route(
        '/my/helpdesk/ticket/<int:ticket_id>',
        type='http', auth='user', website=True,
    )
    def portal_helpdesk_ticket(self, ticket_id, **kw):
        partner = request.env.user.partner_id
        ticket = request.env['seisei.helpdesk.ticket'].sudo().browse(ticket_id)

        if not ticket.exists() or ticket.partner_id != partner:
            raise AccessError(_('You do not have access to this ticket.'))

        values = {
            'ticket': ticket,
            'page_name': 'helpdesk_ticket',
        }
        return request.render(
            'seisei_helpdesk_portal.portal_ticket_detail', values,
        )

    # ------------------------------------------------------------------
    # Submit ticket
    # ------------------------------------------------------------------

    @http.route(
        '/my/helpdesk/submit',
        type='http', auth='user', website=True,
    )
    def portal_helpdesk_submit(self, **kw):
        teams = request.env['seisei.helpdesk.team'].sudo().search([])
        values = {
            'teams': teams,
            'page_name': 'helpdesk_submit',
        }
        return request.render(
            'seisei_helpdesk_portal.portal_submit_ticket', values,
        )

    @http.route(
        '/my/helpdesk/submit/create',
        type='http', auth='user', website=True,
        methods=['POST'],
    )
    def portal_helpdesk_submit_create(self, **post):
        partner = request.env.user.partner_id
        team_id = int(post.get('team_id', 0))

        if not team_id or not post.get('name'):
            return request.redirect('/my/helpdesk/submit')

        ticket = request.env['seisei.helpdesk.ticket'].sudo().create({
            'name': post.get('name', ''),
            'description': post.get('description', ''),
            'team_id': team_id,
            'partner_id': partner.id,
            'partner_name': partner.name,
            'partner_email': partner.email,
            'partner_phone': partner.phone,
            'channel_type': 'form',
        })

        return request.redirect('/my/helpdesk/ticket/%d' % ticket.id)
