/**
 * Email Service for Billing Notifications
 * Supports multiple providers: AWS SES, Resend, SMTP
 */

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send email using configured provider
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const provider = process.env.EMAIL_PROVIDER || 'console';

  switch (provider) {
    case 'ses':
    case 'aws':
      return sendWithSES(options);
    case 'resend':
      return sendWithResend(options);
    case 'smtp':
      return sendWithSMTP(options);
    default:
      return logToConsole(options);
  }
}

/**
 * Send via AWS SES
 */
async function sendWithSES(options: EmailOptions): Promise<EmailResult> {
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'ap-northeast-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'noreply@seisei.tokyo';

  if (!accessKeyId || !secretAccessKey) {
    console.error('[Email] AWS credentials not configured');
    return { success: false, error: 'AWS credentials not configured' };
  }

  try {
    // Use AWS SDK v3
    const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');

    const client = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: [options.to],
      },
      Message: {
        Subject: {
          Data: options.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: options.html,
            Charset: 'UTF-8',
          },
          ...(options.text && {
            Text: {
              Data: options.text,
              Charset: 'UTF-8',
            },
          }),
        },
      },
    });

    const result = await client.send(command);
    console.log('[Email] Sent via AWS SES:', result.MessageId);
    return { success: true, messageId: result.MessageId };
  } catch (error) {
    console.error('[Email] AWS SES error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'SES error' };
  }
}

/**
 * Send via Resend API
 */
async function sendWithResend(options: EmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[Email] RESEND_API_KEY not configured');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Seisei BizNexus <noreply@seisei.tokyo>',
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to send email' };
    }

    return { success: true, messageId: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Send via SMTP (using nodemailer if available)
 * Note: nodemailer must be installed separately if using SMTP
 */
async function sendWithSMTP(options: EmailOptions): Promise<EmailResult> {
  try {
    // Dynamic import to avoid build issues if nodemailer not installed
    const nodemailerModule = await import('nodemailer').catch(() => null);

    if (!nodemailerModule) {
      console.warn('[Email] nodemailer not installed, falling back to console');
      return logToConsole(options);
    }

    const transporter = nodemailerModule.default.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const result = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Seisei BizNexus <noreply@seisei.tokyo>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    return { success: true, messageId: result.messageId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'SMTP error' };
  }
}

/**
 * Log to console (development mode)
 */
function logToConsole(options: EmailOptions): EmailResult {
  console.log('[Email] Would send:');
  console.log('  To:', options.to);
  console.log('  Subject:', options.subject);
  console.log('  Body:', options.html.substring(0, 200) + '...');
  return { success: true, messageId: 'console-' + Date.now() };
}

// ============================================
// Email Templates
// ============================================

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
    .content { background: #fff; border-radius: 8px; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
    .amount { font-size: 28px; font-weight: bold; color: #2563eb; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0; }
    .success { background: #d1fae5; border: 1px solid #10b981; border-radius: 6px; padding: 15px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Seisei BizNexus</div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Seisei BizNexus - 店舗運営支援プラットフォーム</p>
      <p>© ${new Date().getFullYear()} SHINKYO SEISEI CO.,LTD. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Trial starting email
 */
export function trialStartedEmail(params: {
  tenantName: string;
  planName: string;
  trialDays: number;
  trialEndDate: Date;
}): { subject: string; html: string } {
  const endDateStr = params.trialEndDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    subject: `【Seisei BizNexus】${params.trialDays}日間無料トライアル開始`,
    html: baseTemplate(`
      <h2>無料トライアルが開始されました</h2>
      <p>${params.tenantName} 様</p>
      <p>Seisei BizNexusをお選びいただき、ありがとうございます。</p>
      <p><strong>${params.planName}</strong> の ${params.trialDays}日間無料トライアルが開始されました。</p>

      <div class="warning">
        <strong>トライアル終了日: ${endDateStr}</strong><br>
        トライアル期間中は全ての機能をご利用いただけます。
      </div>

      <p>トライアル期間終了前にお支払い方法を設定いただくと、サービスが継続されます。</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription" class="button">
        サブスクリプション設定へ
      </a>
    `),
  };
}

/**
 * Trial ending soon email
 */
export function trialEndingSoonEmail(params: {
  tenantName: string;
  daysRemaining: number;
  trialEndDate: Date;
  hasPaymentMethod: boolean;
}): { subject: string; html: string } {
  const endDateStr = params.trialEndDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const paymentWarning = params.hasPaymentMethod
    ? '<div class="success">✓ お支払い方法が設定済みです。トライアル終了後、自動的に課金が開始されます。</div>'
    : '<div class="warning">⚠ お支払い方法が未設定です。サービス継続にはお支払い方法の設定が必要です。</div>';

  return {
    subject: `【重要】トライアル終了まであと${params.daysRemaining}日 - Seisei BizNexus`,
    html: baseTemplate(`
      <h2>トライアル終了のお知らせ</h2>
      <p>${params.tenantName} 様</p>
      <p>ご利用中のトライアル期間があと<strong>${params.daysRemaining}日</strong>で終了します。</p>

      <div style="text-align: center; margin: 20px 0;">
        <div class="amount">${params.daysRemaining}日</div>
        <p>終了予定日: ${endDateStr}</p>
      </div>

      ${paymentWarning}

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription" class="button">
        ${params.hasPaymentMethod ? 'サブスクリプション詳細を確認' : 'お支払い方法を設定する'}
      </a>
    `),
  };
}

/**
 * Payment successful email
 */
export function paymentSuccessEmail(params: {
  tenantName: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  nextBillingDate: Date;
}): { subject: string; html: string } {
  const amountStr = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: params.currency,
  }).format(params.amount);

  const nextDateStr = params.nextBillingDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    subject: `【Seisei BizNexus】お支払い完了 - ${amountStr}`,
    html: baseTemplate(`
      <h2>お支払いが完了しました</h2>
      <p>${params.tenantName} 様</p>

      <div class="success">✓ お支払いが正常に処理されました</div>

      <div style="text-align: center; margin: 20px 0;">
        <div class="amount">${amountStr}</div>
        <p>請求書番号: ${params.invoiceNumber}</p>
      </div>

      <p>次回請求日: ${nextDateStr}</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription" class="button">
        請求履歴を確認
      </a>
    `),
  };
}

/**
 * Payment failed email
 */
export function paymentFailedEmail(params: {
  tenantName: string;
  amount: number;
  currency: string;
  failureReason?: string;
  retryDate?: Date;
}): { subject: string; html: string } {
  const amountStr = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: params.currency,
  }).format(params.amount);

  return {
    subject: `【重要】お支払いに失敗しました - Seisei BizNexus`,
    html: baseTemplate(`
      <h2>お支払いに失敗しました</h2>
      <p>${params.tenantName} 様</p>

      <div class="warning">
        ⚠ ${amountStr} のお支払いが処理できませんでした。
        ${params.failureReason ? `<br>理由: ${params.failureReason}` : ''}
      </div>

      <p>お支払い方法を更新してください。更新されない場合、サービスが一時停止される可能性があります。</p>

      ${params.retryDate ? `<p>次回自動リトライ: ${params.retryDate.toLocaleDateString('ja-JP')}</p>` : ''}

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription" class="button">
        お支払い方法を更新
      </a>
    `),
  };
}

/**
 * Subscription cancelled email
 */
export function subscriptionCancelledEmail(params: {
  tenantName: string;
  endDate: Date;
}): { subject: string; html: string } {
  const endDateStr = params.endDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    subject: `【Seisei BizNexus】サブスクリプション解約のお知らせ`,
    html: baseTemplate(`
      <h2>サブスクリプションが解約されました</h2>
      <p>${params.tenantName} 様</p>

      <p>サブスクリプションの解約を承りました。</p>

      <div class="warning">
        サービス終了日: ${endDateStr}<br>
        この日までは引き続きサービスをご利用いただけます。
      </div>

      <p>再度ご利用をご希望の場合は、いつでも再登録いただけます。</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription" class="button">
        サブスクリプションを再開
      </a>

      <p style="margin-top: 20px; font-size: 14px; color: #6b7280;">
        ご利用いただき、ありがとうございました。<br>
        またのご利用をお待ちしております。
      </p>
    `),
  };
}

/**
 * Invoice created email
 */
export function invoiceCreatedEmail(params: {
  tenantName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: Date;
  items: Array<{ name: string; quantity: number; amount: number }>;
}): { subject: string; html: string } {
  const amountStr = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: params.currency,
  }).format(params.amount);

  const dueDateStr = params.dueDate.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const itemsHtml = params.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">
          ${new Intl.NumberFormat('ja-JP', { style: 'currency', currency: params.currency }).format(item.amount)}
        </td>
      </tr>
    `
    )
    .join('');

  return {
    subject: `【Seisei BizNexus】請求書 ${params.invoiceNumber}`,
    html: baseTemplate(`
      <h2>請求書のお知らせ</h2>
      <p>${params.tenantName} 様</p>

      <p>請求書が発行されました。</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 10px; text-align: left;">項目</th>
            <th style="padding: 10px; text-align: center;">数量</th>
            <th style="padding: 10px; text-align: right;">金額</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding: 10px; text-align: right; font-weight: bold;">合計</td>
            <td style="padding: 10px; text-align: right; font-weight: bold;">${amountStr}</td>
          </tr>
        </tfoot>
      </table>

      <p><strong>請求書番号:</strong> ${params.invoiceNumber}</p>
      <p><strong>お支払い期限:</strong> ${dueDateStr}</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/subscription" class="button">
        請求書を確認
      </a>
    `),
  };
}

/**
 * Email verification code
 */
export function verificationCodeEmail(params: {
  code: string;
  locale?: string;
}): { subject: string; html: string } {
  const locale = params.locale || 'ja';

  const texts = {
    ja: {
      subject: '【Seisei BizNexus】メール認証コード',
      title: 'メール認証',
      greeting: 'Seisei BizNexusへようこそ',
      instruction: '以下の認証コードを入力して、メールアドレスを確認してください。',
      codeLabel: '認証コード',
      expiry: 'このコードは10分間有効です。',
      warning: 'このメールに心当たりがない場合は、無視してください。',
    },
    zh: {
      subject: '【Seisei BizNexus】邮箱验证码',
      title: '邮箱验证',
      greeting: '欢迎使用 Seisei BizNexus',
      instruction: '请输入以下验证码完成邮箱验证。',
      codeLabel: '验证码',
      expiry: '此验证码10分钟内有效。',
      warning: '如果这不是您的操作，请忽略此邮件。',
    },
    en: {
      subject: '【Seisei BizNexus】Email Verification Code',
      title: 'Email Verification',
      greeting: 'Welcome to Seisei BizNexus',
      instruction: 'Please enter the verification code below to verify your email address.',
      codeLabel: 'Verification Code',
      expiry: 'This code is valid for 10 minutes.',
      warning: 'If you did not request this, please ignore this email.',
    },
  };

  const t = texts[locale as keyof typeof texts] || texts.ja;

  return {
    subject: t.subject,
    html: baseTemplate(`
      <h2>${t.title}</h2>
      <p>${t.greeting}</p>
      <p>${t.instruction}</p>

      <div style="text-align: center; margin: 30px 0;">
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">${t.codeLabel}</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb; background: #f3f4f6; padding: 20px; border-radius: 8px; font-family: monospace;">
          ${params.code}
        </div>
      </div>

      <p style="font-size: 14px; color: #6b7280;">${t.expiry}</p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">${t.warning}</p>
    `),
  };
}

/**
 * Welcome email after registration
 */
export function welcomeEmail(params: {
  tenantName: string;
  contactName: string;
  tenantCode: string;
  locale?: string;
}): { subject: string; html: string } {
  const locale = params.locale || 'ja';

  const texts = {
    ja: {
      subject: '【Seisei BizNexus】ご登録ありがとうございます',
      title: 'ご登録完了',
      greeting: `${params.contactName} 様`,
      welcome: 'Seisei BizNexusへようこそ！ご登録いただき、誠にありがとうございます。',
      info: 'アカウント情報',
      company: '会社名',
      code: '企業コード',
      codeNote: '※ 従業員を招待する際に必要なコードです',
      start: '早速始めましょう',
      button: 'ダッシュボードへ',
    },
    zh: {
      subject: '【Seisei BizNexus】感谢注册',
      title: '注册完成',
      greeting: `${params.contactName} 您好`,
      welcome: '欢迎使用 Seisei BizNexus！感谢您的注册。',
      info: '账户信息',
      company: '公司名称',
      code: '企业代码',
      codeNote: '※ 邀请员工时需要使用此代码',
      start: '开始使用',
      button: '进入控制台',
    },
    en: {
      subject: '【Seisei BizNexus】Thank you for registering',
      title: 'Registration Complete',
      greeting: `Dear ${params.contactName}`,
      welcome: 'Welcome to Seisei BizNexus! Thank you for registering.',
      info: 'Account Information',
      company: 'Company Name',
      code: 'Enterprise Code',
      codeNote: '※ This code is needed when inviting employees',
      start: 'Get Started',
      button: 'Go to Dashboard',
    },
  };

  const t = texts[locale as keyof typeof texts] || texts.ja;

  return {
    subject: t.subject,
    html: baseTemplate(`
      <h2>${t.title}</h2>
      <p>${t.greeting}</p>
      <p>${t.welcome}</p>

      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; font-size: 16px;">${t.info}</h3>
        <p><strong>${t.company}:</strong> ${params.tenantName}</p>
        <p><strong>${t.code}:</strong> <code style="background: #e5e7eb; padding: 2px 8px; border-radius: 4px; font-family: monospace;">${params.tenantCode}</code></p>
        <p style="font-size: 12px; color: #6b7280;">${t.codeNote}</p>
      </div>

      <p>${t.start}</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/home" class="button">
        ${t.button}
      </a>
    `),
  };
}
