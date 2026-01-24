import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

// POST - Test email configuration by sending a test email
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
    const { serverId, testEmail } = body;

    if (!testEmail) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Test email address is required' } },
        { status: 400 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Try to test the connection using Odoo's test_smtp_connection method
    if (serverId) {
      try {
        await odoo.callKw('ir.mail_server', 'test_smtp_connection', [[serverId]]);
      } catch (testError) {
        // Connection test might fail, but we can still try to send
        console.log('[Email Test] SMTP connection test:', testError);
      }
    }

    // Send a test email using mail.mail model
    const mailId = await odoo.callKw<number>('mail.mail', 'create', [{
      subject: 'BizNexus 邮件测试 / Email Test',
      body_html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>邮件配置测试成功！</h2>
          <p>如果您收到此邮件，说明您的 SMTP 邮件服务器配置正确。</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <h2>Email Configuration Test Successful!</h2>
          <p>If you receive this email, your SMTP mail server is configured correctly.</p>
          <p style="color: #666; margin-top: 30px; font-size: 12px;">
            Sent from BizNexus ERP<br>
            ${new Date().toLocaleString('ja-JP')}
          </p>
        </div>
      `,
      email_to: testEmail,
      auto_delete: true,
    }]);

    // Send the email immediately
    await odoo.callKw('mail.mail', 'send', [[mailId]]);

    return NextResponse.json({
      success: true,
      data: {
        message: `Test email sent to ${testEmail}`,
        mailId,
      },
    });
  } catch (error) {
    console.error('[Email Test Error]', error);

    // Parse Odoo error message for better user feedback
    let errorMessage = 'Failed to send test email';
    if (error instanceof Error) {
      const msg = error.message;
      if (msg.includes('Authentication') || msg.includes('auth')) {
        errorMessage = 'SMTP authentication failed. Please check username and password.';
      } else if (msg.includes('Connection') || msg.includes('connect')) {
        errorMessage = 'Cannot connect to SMTP server. Please check host and port.';
      } else if (msg.includes('SSL') || msg.includes('TLS')) {
        errorMessage = 'SSL/TLS error. Please check encryption settings.';
      } else {
        errorMessage = msg;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EMAIL_TEST_FAILED',
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
