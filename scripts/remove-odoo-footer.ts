/**
 * Remove "Powered by Odoo" footer from emails
 */

import { Odoo19Client } from '../src/lib/odoo19';

async function main() {
  const client = new Odoo19Client({
    baseUrl: process.env.ODOO19_URL || 'http://13.159.193.191:8069',
    db: process.env.ODOO19_DB || 'ERP',
    username: process.env.ODOO19_USERNAME || 'Josh',
    password: process.env.ODOO19_PASSWORD || 'wind1982',
  });

  await client.authenticate();
  console.log('Connected to Odoo 19');

  // 1. Search for email layout views to check which ones have Odoo branding
  const views = await client.searchRead<{ id: number; name: string; key: string; arch_db: string }>(
    'ir.ui.view',
    [
      ['type', '=', 'qweb'],
      ['key', 'ilike', 'mail.'],
    ],
    ['id', 'name', 'key', 'arch_db'],
    { limit: 20 }
  );

  console.log('Mail layout views:');
  for (const v of views) {
    if (v.key && (v.key.includes('layout') || v.key.includes('footer'))) {
      console.log(`  - ${v.id}: ${v.key} (${v.name})`);
    }
  }

  // 2. Look for mail_notification_light layout which has the footer
  const layoutViews = await client.searchRead<{ id: number; key: string; arch_db: string }>(
    'ir.ui.view',
    [
      ['key', 'in', ['mail.mail_notification_light', 'mail.mail_notification_layout', 'mail.mail_notification_border']],
    ],
    ['id', 'key', 'arch_db'],
    { limit: 10 }
  );

  console.log('\nFound layout views:', layoutViews.length);

  // 3. Update company settings to remove external email server signature
  const companies = await client.searchRead<{ id: number; name: string }>(
    'res.company',
    [],
    ['id', 'name']
  );

  console.log('\nCompanies:', companies);

  // 4. Check for 'web.external_layout_footer' which often contains Odoo branding
  const footerViews = await client.searchRead<{ id: number; key: string; name: string }>(
    'ir.ui.view',
    [
      ['key', 'ilike', '%footer%'],
    ],
    ['id', 'key', 'name'],
    { limit: 20 }
  );

  console.log('\nFooter views:');
  for (const v of footerViews) {
    console.log(`  - ${v.id}: ${v.key} (${v.name})`);
  }

  // 5. Set parameter to disable the Odoo watermark
  // mail.force.no_watermark parameter
  const paramResult = await client.searchRead<{ id: number }>(
    'ir.config_parameter',
    [['key', '=', 'mail.force.no_watermark']],
    ['id']
  );

  if (paramResult.length > 0) {
    await client.write('ir.config_parameter', [paramResult[0].id], { value: 'True' });
    console.log('\nSet mail.force.no_watermark = True');
  } else {
    await client.create('ir.config_parameter', { key: 'mail.force.no_watermark', value: 'True' });
    console.log('\nCreated mail.force.no_watermark = True');
  }

  // 6. Disable Odoo branding in base setup
  // Check for base.default_template setting
  const baseParams = await client.searchRead<{ id: number; key: string; value: string }>(
    'ir.config_parameter',
    [['key', 'ilike', 'mail.%']],
    ['id', 'key', 'value']
  );

  console.log('\nMail parameters:');
  for (const p of baseParams) {
    console.log(`  - ${p.key} = ${p.value}`);
  }

  console.log('\n=== Odoo Footer Settings Checked ===');
}

main().catch(console.error);
