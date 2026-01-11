import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

/**
 * CRM API - Compatible with Odoo 18
 * Syncs with crm.lead, crm.stage, and mail.activity models
 */

interface CrmLead {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  email_from: string | false;
  phone: string | false;
  expected_revenue: number;
  probability: number;
  stage_id: [number, string] | false;
  user_id: [number, string] | false;
  create_date: string;
  write_date: string;
  date_deadline: string | false;
  priority: string | false;
  type: string; // 'lead' or 'opportunity'
  active: boolean;
  activity_date_deadline: string | false;
  lost_reason_id: [number, string] | false;
  tag_ids: number[];
  company_id: [number, string] | false;
  team_id: [number, string] | false;
  description: string | false;
  contact_name: string | false;
  city: string | false;
  country_id: [number, string] | false;
}

interface CrmStage {
  id: number;
  name: string;
  sequence: number;
  is_won: boolean;
  fold: boolean;
}

interface Activity {
  id: number;
  res_id: number;
  date_deadline: string;
  activity_type_id: [number, string] | false;
  summary: string | false;
  state: string; // 'overdue', 'today', 'planned'
}

// Check if a date is overdue
function isDateOverdue(dateStr: string | false): boolean {
  if (!dateStr) return false;
  const deadline = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadline < today;
}

export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const stageId = searchParams.get('stage_id');
    const sortBy = searchParams.get('sort') || 'date';

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    // Fetch stages from Odoo 18 with is_won flag
    let stages: CrmStage[] = [];
    try {
      stages = await odoo.searchRead<CrmStage>('crm.stage', [], {
        fields: ['name', 'sequence', 'is_won', 'fold'],
        order: 'sequence asc',
      });
    } catch (e) {
      console.log('[CRM] Could not fetch stages:', e);
    }

    // Build search domain
    const domain: unknown[] = [];
    if (search) {
      domain.push('|', '|', '|',
        ['name', 'ilike', search],
        ['email_from', 'ilike', search],
        ['phone', 'ilike', search],
        ['partner_id', 'ilike', search]
      );
    }
    if (stageId) {
      domain.push(['stage_id', '=', parseInt(stageId)]);
    }

    // Sort order - map frontend sort options to Odoo fields
    let orderStr = 'write_date desc'; // default: recently updated
    switch (sortBy) {
      case 'date':
        orderStr = 'write_date desc';
        break;
      case 'revenue':
        orderStr = 'expected_revenue desc';
        break;
      case 'revenue_asc':
        orderStr = 'expected_revenue asc';
        break;
      case 'probability':
        orderStr = 'probability desc';
        break;
      case 'create_date':
        orderStr = 'create_date desc';
        break;
    }

    // Fields to fetch
    const leadFields = [
      'name', 'partner_id', 'email_from', 'phone',
      'expected_revenue', 'probability', 'stage_id',
      'user_id', 'create_date', 'write_date', 'date_deadline',
      'priority', 'type', 'active', 'activity_date_deadline',
      'contact_name', 'city', 'country_id', 'team_id', 'tag_ids'
    ];

    // Fetch leads with pagination
    const totalCount = await odoo.searchCount('crm.lead', domain);
    const leads = await odoo.searchRead<CrmLead>('crm.lead', domain, {
      fields: leadFields,
      limit,
      offset,
      order: orderStr,
    });

    // Fetch KPI data using read_group for efficiency
    const wonStageIds = stages.filter(s => s.is_won).map(s => s.id);

    // Total revenue and count
    let totalRevenue = 0;
    let wonRevenue = 0;
    let wonCount = 0;
    let totalLeads = 0;
    let newThisMonth = 0;
    let avgProbability = 0;

    try {
      // Get total stats
      const totalStats = await odoo.readGroup<{
        __count: number;
        expected_revenue: number;
        probability: number;
      }>('crm.lead', [], ['expected_revenue:sum', 'probability:avg'], []);

      if (totalStats.length > 0) {
        totalLeads = totalStats[0].__count || 0;
        totalRevenue = totalStats[0].expected_revenue || 0;
        avgProbability = Math.round(totalStats[0].probability || 0);
      }

      // Get won stats
      if (wonStageIds.length > 0) {
        const wonStats = await odoo.readGroup<{
          __count: number;
          expected_revenue: number;
        }>('crm.lead', [['stage_id', 'in', wonStageIds]], ['expected_revenue:sum'], []);

        if (wonStats.length > 0) {
          wonCount = wonStats[0].__count || 0;
          wonRevenue = wonStats[0].expected_revenue || 0;
        }
      }

      // Get new this month
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      const thisMonthStr = thisMonth.toISOString().split('T')[0];

      newThisMonth = await odoo.searchCount('crm.lead', [
        ['create_date', '>=', thisMonthStr]
      ]);
    } catch (e) {
      console.log('[CRM] Could not fetch KPI stats:', e);
      // Fallback to simple count
      totalLeads = totalCount;
    }

    // Calculate stage stats using read_group
    let stageStats: Array<{
      id: number;
      name: string;
      sequence: number;
      count: number;
      expectedRevenue: number;
      isWon: boolean;
    }> = [];

    try {
      const stageGroups = await odoo.readGroup<{
        stage_id: [number, string] | false;
        __count: number;
        expected_revenue: number;
      }>('crm.lead', [], ['stage_id', 'expected_revenue:sum'], ['stage_id']);

      const stageMap = new Map(stageGroups.map(g => [
        Array.isArray(g.stage_id) ? g.stage_id[0] : 0,
        { count: g.__count || 0, revenue: g.expected_revenue || 0 }
      ]));

      stageStats = stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        sequence: stage.sequence,
        count: stageMap.get(stage.id)?.count || 0,
        expectedRevenue: stageMap.get(stage.id)?.revenue || 0,
        isWon: stage.is_won || false,
      }));
    } catch (e) {
      console.log('[CRM] Could not fetch stage stats:', e);
      stageStats = stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        sequence: stage.sequence,
        count: 0,
        expectedRevenue: 0,
        isWon: stage.is_won || false,
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          totalLeads,
          totalRevenue,
          wonRevenue,
          wonCount,
          newThisMonth,
          avgProbability,
        },
        stages: stageStats,
        items: leads.map(item => ({
          id: item.id,
          name: item.name || '',
          partnerName: Array.isArray(item.partner_id) ? item.partner_id[1] : null,
          contactName: item.contact_name || null,
          email: item.email_from || null,
          phone: item.phone || null,
          expectedRevenue: item.expected_revenue || 0,
          probability: item.probability || 0,
          stageId: Array.isArray(item.stage_id) ? item.stage_id[0] : null,
          stageName: Array.isArray(item.stage_id) ? item.stage_id[1] : '',
          userName: Array.isArray(item.user_id) ? item.user_id[1] : null,
          teamName: Array.isArray(item.team_id) ? item.team_id[1] : null,
          createdAt: item.create_date,
          updatedAt: item.write_date,
          deadline: item.date_deadline || null,
          activityDeadline: item.activity_date_deadline || null,
          isOverdue: isDateOverdue(item.date_deadline) || isDateOverdue(item.activity_date_deadline),
          priority: item.priority || '0',
          type: item.type || 'lead',
          city: item.city || null,
          countryName: Array.isArray(item.country_id) ? item.country_id[1] : null,
          tagIds: item.tag_ids || [],
        })),
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error('[CRM Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch leads' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/crm - Create a new lead/opportunity
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      name,
      partnerId,
      contactName,
      email,
      phone,
      expectedRevenue,
      probability,
      stageId,
      deadline,
      priority,
      type = 'opportunity',
      description,
      city,
      countryId,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    const values: Record<string, unknown> = {
      name,
      type,
    };

    if (partnerId) values.partner_id = partnerId;
    if (contactName) values.contact_name = contactName;
    if (email) values.email_from = email;
    if (phone) values.phone = phone;
    if (expectedRevenue !== undefined) values.expected_revenue = expectedRevenue;
    if (probability !== undefined) values.probability = probability;
    if (stageId) values.stage_id = stageId;
    if (deadline) values.date_deadline = deadline;
    if (priority) values.priority = priority;
    if (description) values.description = description;
    if (city) values.city = city;
    if (countryId) values.country_id = countryId;

    const leadId = await odoo.create('crm.lead', values);

    return NextResponse.json({
      success: true,
      data: { id: leadId },
    });
  } catch (error) {
    console.error('[CRM Create Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create lead' } },
      { status: 500 }
    );
  }
}
