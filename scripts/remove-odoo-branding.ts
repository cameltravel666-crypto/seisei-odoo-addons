/**
 * Remove "Powered by Odoo" branding from email templates
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

  // 1. Get the mail.mail_notification_layout view
  const layoutViews = await client.searchRead<{ id: number; key: string; arch_db: string }>(
    'ir.ui.view',
    [['key', '=', 'mail.mail_notification_layout']],
    ['id', 'key', 'arch_db']
  );

  if (layoutViews.length === 0) {
    console.log('View not found!');
    return;
  }

  const view = layoutViews[0];
  console.log('Found view ID:', view.id);

  // Check if already modified
  if (!view.arch_db.includes('Powered by')) {
    console.log('View already modified or does not contain Odoo branding');
    return;
  }

  // Replace the Odoo footer line with empty span
  // Original: Powered by <a target="_blank" href="https://www.odoo.com?...">Odoo</a>
  const newArch = view.arch_db.replace(
    /Powered by <a[^>]*odoo\.com[^>]*>[^<]*<\/a>/gi,
    ''
  ).replace(
    /技术提供\s*<a[^>]*odoo\.com[^>]*>[^<]*<\/a>/gi,
    ''
  );

  // Update the view
  await client.write('ir.ui.view', [view.id], { arch_db: newArch });
  console.log('Updated mail.mail_notification_layout - removed Odoo branding');

  // 2. Get and update mail.mail_notification_light
  const lightViews = await client.searchRead<{ id: number; key: string; arch_db: string }>(
    'ir.ui.view',
    [['key', '=', 'mail.mail_notification_light']],
    ['id', 'key', 'arch_db']
  );

  if (lightViews.length > 0) {
    const lightView = lightViews[0];
    if (lightView.arch_db.includes('Powered by') || lightView.arch_db.includes('odoo')) {
      const newLightArch = lightView.arch_db.replace(
        /Powered by <a[^>]*odoo\.com[^>]*>[^<]*<\/a>/gi,
        ''
      ).replace(
        /技术提供\s*<a[^>]*odoo\.com[^>]*>[^<]*<\/a>/gi,
        ''
      );
      await client.write('ir.ui.view', [lightView.id], { arch_db: newLightArch });
      console.log('Updated mail.mail_notification_light - removed Odoo branding');
    }
  }

  // 3. Update subscription templates
  const subTemplates = [43, 44, 45];
  for (const templateId of subTemplates) {
    const templates = await client.searchRead<{ id: number; body_html: string }>(
      'mail.template',
      [['id', '=', templateId]],
      ['id', 'body_html']
    );

    if (templates.length > 0 && templates[0].body_html) {
      const newBody = templates[0].body_html
        .replace(/Powered by <a[^>]*odoo\.com[^>]*>[^<]*<\/a>/gi, '')
        .replace(/技术提供\s*<a[^>]*odoo\.com[^>]*>[^<]*<\/a>/gi, '')
        .replace(/sent by <a[^>]*odoo\.com[^>]*>[^<]*<\/a>/gi, 'sent by Seisei');

      await client.write('mail.template', [templateId], { body_html: newBody });
      console.log('Updated template ID:', templateId);
    }
  }

  console.log('\n=== Odoo Branding Removed ===');
  console.log('Modified views and templates to remove "Powered by Odoo" text');
}

main().catch(console.error);
