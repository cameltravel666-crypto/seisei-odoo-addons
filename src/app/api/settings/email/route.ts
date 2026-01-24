import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

interface MailServer {
  id: number;
  name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_encryption: 'none' | 'starttls' | 'ssl';
  smtp_ssl: boolean;
  active: boolean;
  sequence: number;
}

// GET - Fetch current email server configuration
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Search for existing mail servers
    const servers = await odoo.searchRead<MailServer>(
      'ir.mail_server',
      [],
      {
        fields: ['id', 'name', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_encryption', 'smtp_ssl', 'active', 'sequence'],
        order: 'sequence asc',
        limit: 10,
      }
    );

    // Return the primary (first active) server or empty config
    const primaryServer = servers.find(s => s.active) || servers[0];

    if (primaryServer) {
      return NextResponse.json({
        success: true,
        data: {
          id: primaryServer.id,
          name: primaryServer.name,
          host: primaryServer.smtp_host,
          port: primaryServer.smtp_port,
          user: primaryServer.smtp_user,
          encryption: primaryServer.smtp_encryption || (primaryServer.smtp_ssl ? 'ssl' : 'none'),
          active: primaryServer.active,
          configured: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        configured: false,
        host: '',
        port: 587,
        user: '',
        encryption: 'starttls',
        active: true,
      },
    });
  } catch (error) {
    console.error('[Email Settings GET Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch email settings',
        },
      },
      { status: 500 }
    );
  }
}

// POST - Create or update email server configuration
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, name, host, port, user, password, encryption } = body;

    if (!host || !port) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Host and port are required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Prepare server values
    const serverValues: Record<string, unknown> = {
      name: name || `SMTP - ${host}`,
      smtp_host: host,
      smtp_port: parseInt(port),
      smtp_user: user || false,
      smtp_encryption: encryption || 'starttls',
      active: true,
      sequence: 10,
    };

    // Only set password if provided (don't clear existing)
    if (password) {
      serverValues.smtp_pass = password;
    }

    let serverId: number;

    if (id) {
      // Update existing server
      await odoo.callKw('ir.mail_server', 'write', [[id], serverValues]);
      serverId = id;
    } else {
      // Create new server
      serverId = await odoo.callKw<number>('ir.mail_server', 'create', [serverValues]);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: serverId,
        message: 'Email server configuration saved',
      },
    });
  } catch (error) {
    console.error('[Email Settings POST Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to save email settings',
        },
      },
      { status: 500 }
    );
  }
}
