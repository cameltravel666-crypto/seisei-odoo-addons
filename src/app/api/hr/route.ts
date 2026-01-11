import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';
import { isModuleAccessible } from '@/lib/features';

interface Employee {
  id: number;
  name: string;
  job_title: string | false;
  department_id: [number, string] | false;
  work_email: string | false;
  work_phone: string | false;
  mobile_phone: string | false;
}

interface Payslip {
  id: number;
  name: string;
  number?: string; // Reference like SLIP/001
  employee_id: [number, string];
  date_from: string;
  date_to: string;
  state: string;
  company_id?: [number, string] | false;
  // Odoo 18 standard payroll fields
  net_wage?: number;
  basic_wage?: number;
  gross_wage?: number;
  // Alternative field names used by some payroll modules
  net?: number;
  gross?: number;
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

    const accessResult = await isModuleAccessible('HR', session.userId, session.tenantId);
    if (!accessResult.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: accessResult.reason || 'HR module not accessible' } },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const view = searchParams.get('view') || 'employees'; // employees or payslips

    const offset = (page - 1) * limit;
    const odoo = await getOdooClientForSession(session);

    if (view === 'payslips') {
      // Fetch payslips - try multiple model names for compatibility
      const domain: unknown[] = [];
      if (search) {
        domain.push('|');
        domain.push(['name', 'ilike', search]);
        domain.push(['employee_id', 'ilike', search]);
      }

      // Try different payslip model names (bi_hr_payroll may use standard model or custom)
      const modelNames = ['hr.payslip', 'bi.hr.payslip', 'bi.payslip'];

      for (const modelName of modelNames) {
        try {
          console.log(`[HR] Trying model: ${modelName}`);
          const totalCount = await odoo.searchCount(modelName, domain);
          console.log(`[HR] ${modelName} has ${totalCount} records`);

          // Only fetch basic fields that are guaranteed to exist
          // Wage fields may not exist in all Odoo versions/modules
          const items = await odoo.searchRead<Payslip>(modelName, domain, {
            fields: ['name', 'employee_id', 'date_from', 'date_to', 'state'],
            limit,
            offset,
            order: 'id desc', // Use id for ordering as date_from might not be sortable
          });

          console.log(`[HR] Successfully fetched ${items.length} payslips from ${modelName}`);

          // Try to fetch wage info separately (may fail if fields don't exist)
          const wageInfo: Record<number, { net_wage?: number; company_id?: [number, string] | false }> = {};
          try {
            const wageFields = await odoo.searchRead<Payslip>(modelName, [['id', 'in', items.map(i => i.id)]], {
              fields: ['id', 'net_wage', 'company_id'],
            });
            for (const w of wageFields) {
              wageInfo[w.id] = { net_wage: w.net_wage, company_id: w.company_id };
            }
          } catch {
            console.log(`[HR] Wage fields not available for ${modelName}`);
          }

          return NextResponse.json({
            success: true,
            data: {
              items: items.map((item) => {
                const wage = wageInfo[item.id] || {};
                return {
                  id: item.id,
                  name: item.name,
                  reference: item.name,
                  employeeName: Array.isArray(item.employee_id) ? item.employee_id[1] : '',
                  employeeId: Array.isArray(item.employee_id) ? item.employee_id[0] : 0,
                  dateFrom: item.date_from,
                  dateTo: item.date_to,
                  state: item.state,
                  companyName: Array.isArray(wage.company_id) ? wage.company_id[1] : null,
                  netWage: wage.net_wage || 0,
                  basicWage: 0,
                  grossWage: 0,
                };
              }),
              pagination: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
            },
          });
        } catch (modelError) {
          const errMsg = (modelError as Error).message;
          console.error(`[HR] Model ${modelName} failed:`, errMsg);
          // If it's an access denied error, log more details
          if (errMsg.includes('Access Denied') || errMsg.includes('AccessError')) {
            console.error(`[HR] User does not have permission to access ${modelName}`);
          }
          continue; // Try next model name
        }
      }

      // All models failed - return error with details
      console.error('[HR] No payslip model available - all attempts failed');
      return NextResponse.json({
        success: false,
        error: {
          code: 'MODEL_NOT_FOUND',
          message: 'Payroll module not available. Please ensure hr_payroll is installed in Odoo.'
        },
      }, { status: 404 });
    }

    // Default: Fetch employees
    const domain: unknown[] = [];
    if (search) {
      domain.push('|');
      domain.push(['name', 'ilike', search]);
      domain.push(['work_email', 'ilike', search]);
    }

    const totalCount = await odoo.searchCount('hr.employee', domain);
    const items = await odoo.searchRead<Employee>('hr.employee', domain, {
      fields: ['name', 'job_title', 'department_id', 'work_email', 'work_phone', 'mobile_phone'],
      limit,
      offset,
      order: 'name asc',
    });

    return NextResponse.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          jobTitle: item.job_title || null,
          departmentName: Array.isArray(item.department_id) ? item.department_id[1] : null,
          email: item.work_email || null,
          phone: item.work_phone || item.mobile_phone || null,
        })),
        pagination: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error) {
    console.error('[HR Error]', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch HR data' } },
      { status: 500 }
    );
  }
}
