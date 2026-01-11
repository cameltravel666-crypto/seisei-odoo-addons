import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * CRM Lead Detail API - Get and Update individual lead/opportunity
 */

interface CrmLead {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  email_from: string | false;
  phone: string | false;
  mobile: string | false;
  expected_revenue: number;
  probability: number;
  stage_id: [number, string] | false;
  user_id: [number, string] | false;
  team_id: [number, string] | false;
  create_date: string;
  write_date: string;
  date_deadline: string | false;
  priority: string | false;
  type: string;
  active: boolean;
  activity_date_deadline: string | false;
  lost_reason_id: [number, string] | false;
  tag_ids: number[];
  company_id: [number, string] | false;
  description: string | false;
  contact_name: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  state_id: [number, string] | false;
  zip: string | false;
  country_id: [number, string] | false;
  website: string | false;
  function: string | false;
  title: [number, string] | false;
  referred: string | false;
  source_id: [number, string] | false;
  medium_id: [number, string] | false;
  campaign_id: [number, string] | false;
}

interface Activity {
  id: number;
  activity_type_id: [number, string] | false;
  summary: string | false;
  note: string | false;
  date_deadline: string;
  state: string;
  user_id: [number, string] | false;
  create_date: string;
}

interface CrmStage {
  id: number;
  name: string;
  sequence: number;
  is_won: boolean;
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/crm/[id] - Get lead/opportunity details
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('CRM', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'CRM module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const leadId = parseInt(id);
    if (isNaN(leadId)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_ID', message: 'Invalid lead ID' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Fetch lead details
    const leads = await odoo.read<CrmLead>('crm.lead', [leadId], [
      'name', 'partner_id', 'email_from', 'phone', 'mobile',
      'expected_revenue', 'probability', 'stage_id',
      'user_id', 'team_id', 'create_date', 'write_date', 'date_deadline',
      'priority', 'type', 'active', 'activity_date_deadline',
      'lost_reason_id', 'tag_ids', 'company_id', 'description',
      'contact_name', 'street', 'street2', 'city', 'state_id', 'zip', 'country_id',
      'website', 'function', 'title', 'referred',
      'source_id', 'medium_id', 'campaign_id'
    ]);

    if (!leads || leads.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Lead not found' } },
        { status: 404 }
      );
    }

    const lead = leads[0];

    // Fetch stages for stage selection
    const stages = await odoo.searchRead<CrmStage>('crm.stage', [], {
      fields: ['name', 'sequence', 'is_won'],
      order: 'sequence asc',
    });

    // Fetch activities for this lead
    let activities: Activity[] = [];
    try {
      activities = await odoo.searchRead<Activity>('mail.activity', [
        ['res_model', '=', 'crm.lead'],
        ['res_id', '=', leadId]
      ], {
        fields: ['activity_type_id', 'summary', 'note', 'date_deadline', 'state', 'user_id', 'create_date'],
        order: 'date_deadline asc',
        limit: 10,
      });
    } catch (e) {
      console.log('[CRM] Could not fetch activities:', e);
    }

    // Check if overdue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue = (dateStr: string | false) => {
      if (!dateStr) return false;
      return new Date(dateStr) < today;
    };

    return NextResponse.json({
      success: true,
      data: {
        id: lead.id,
        name: lead.name || '',
        partnerId: Array.isArray(lead.partner_id) ? lead.partner_id[0] : null,
        partnerName: Array.isArray(lead.partner_id) ? lead.partner_id[1] : null,
        contactName: lead.contact_name || null,
        email: lead.email_from || null,
        phone: lead.phone || null,
        mobile: lead.mobile || null,
        expectedRevenue: lead.expected_revenue || 0,
        probability: lead.probability || 0,
        stageId: Array.isArray(lead.stage_id) ? lead.stage_id[0] : null,
        stageName: Array.isArray(lead.stage_id) ? lead.stage_id[1] : '',
        userId: Array.isArray(lead.user_id) ? lead.user_id[0] : null,
        userName: Array.isArray(lead.user_id) ? lead.user_id[1] : null,
        teamId: Array.isArray(lead.team_id) ? lead.team_id[0] : null,
        teamName: Array.isArray(lead.team_id) ? lead.team_id[1] : null,
        createdAt: lead.create_date,
        updatedAt: lead.write_date,
        deadline: lead.date_deadline || null,
        activityDeadline: lead.activity_date_deadline || null,
        isOverdue: isOverdue(lead.date_deadline) || isOverdue(lead.activity_date_deadline),
        priority: lead.priority || '0',
        type: lead.type || 'lead',
        active: lead.active,
        description: lead.description || null,
        // Address
        street: lead.street || null,
        street2: lead.street2 || null,
        city: lead.city || null,
        stateId: Array.isArray(lead.state_id) ? lead.state_id[0] : null,
        stateName: Array.isArray(lead.state_id) ? lead.state_id[1] : null,
        zip: lead.zip || null,
        countryId: Array.isArray(lead.country_id) ? lead.country_id[0] : null,
        countryName: Array.isArray(lead.country_id) ? lead.country_id[1] : null,
        // Contact details
        website: lead.website || null,
        jobPosition: lead.function || null,
        titleId: Array.isArray(lead.title) ? lead.title[0] : null,
        titleName: Array.isArray(lead.title) ? lead.title[1] : null,
        // Marketing
        referred: lead.referred || null,
        sourceId: Array.isArray(lead.source_id) ? lead.source_id[0] : null,
        sourceName: Array.isArray(lead.source_id) ? lead.source_id[1] : null,
        mediumId: Array.isArray(lead.medium_id) ? lead.medium_id[0] : null,
        mediumName: Array.isArray(lead.medium_id) ? lead.medium_id[1] : null,
        campaignId: Array.isArray(lead.campaign_id) ? lead.campaign_id[0] : null,
        campaignName: Array.isArray(lead.campaign_id) ? lead.campaign_id[1] : null,
        // Lost reason
        lostReasonId: Array.isArray(lead.lost_reason_id) ? lead.lost_reason_id[0] : null,
        lostReasonName: Array.isArray(lead.lost_reason_id) ? lead.lost_reason_id[1] : null,
        tagIds: lead.tag_ids || [],
        // Activities
        activities: activities.map(a => ({
          id: a.id,
          type: Array.isArray(a.activity_type_id) ? a.activity_type_id[1] : '',
          summary: a.summary || '',
          note: a.note || null,
          deadline: a.date_deadline,
          state: a.state,
          userName: Array.isArray(a.user_id) ? a.user_id[1] : null,
          createdAt: a.create_date,
        })),
        // Available stages
        stages: stages.map(s => ({
          id: s.id,
          name: s.name,
          sequence: s.sequence,
          isWon: s.is_won || false,
        })),
      },
    });
  } catch (error) {
    console.error('[CRM Detail Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch lead' } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/crm/[id] - Update lead/opportunity
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const hasAccess = await isModuleAccessible('CRM', session.userId, session.tenantId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'CRM module not accessible' } },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const leadId = parseInt(id);
    if (isNaN(leadId)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_ID', message: 'Invalid lead ID' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const odoo = await getOdooClientForSession(session);

    // Build update values
    const values: Record<string, unknown> = {};

    // Basic info
    if (body.name !== undefined) values.name = body.name;
    if (body.partnerId !== undefined) values.partner_id = body.partnerId || false;
    if (body.contactName !== undefined) values.contact_name = body.contactName || false;
    if (body.email !== undefined) values.email_from = body.email || false;
    if (body.phone !== undefined) values.phone = body.phone || false;
    if (body.mobile !== undefined) values.mobile = body.mobile || false;
    if (body.expectedRevenue !== undefined) values.expected_revenue = body.expectedRevenue;
    if (body.probability !== undefined) values.probability = body.probability;
    if (body.stageId !== undefined) values.stage_id = body.stageId || false;
    if (body.deadline !== undefined) values.date_deadline = body.deadline || false;
    if (body.priority !== undefined) values.priority = body.priority;
    if (body.description !== undefined) values.description = body.description || false;

    // Address
    if (body.street !== undefined) values.street = body.street || false;
    if (body.street2 !== undefined) values.street2 = body.street2 || false;
    if (body.city !== undefined) values.city = body.city || false;
    if (body.stateId !== undefined) values.state_id = body.stateId || false;
    if (body.zip !== undefined) values.zip = body.zip || false;
    if (body.countryId !== undefined) values.country_id = body.countryId || false;

    // Contact
    if (body.website !== undefined) values.website = body.website || false;
    if (body.jobPosition !== undefined) values.function = body.jobPosition || false;

    // Marketing
    if (body.sourceId !== undefined) values.source_id = body.sourceId || false;
    if (body.mediumId !== undefined) values.medium_id = body.mediumId || false;
    if (body.campaignId !== undefined) values.campaign_id = body.campaignId || false;
    if (body.referred !== undefined) values.referred = body.referred || false;

    if (Object.keys(values).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } },
        { status: 400 }
      );
    }

    await odoo.write('crm.lead', [leadId], values);

    return NextResponse.json({
      success: true,
      data: { id: leadId },
    });
  } catch (error) {
    console.error('[CRM Update Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update lead' } },
      { status: 500 }
    );
  }
}
