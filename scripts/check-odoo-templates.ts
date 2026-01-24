/**
 * Check and modify Odoo email templates to remove "Powered by Odoo" text
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

  // 1. Check the mail notification layout view
  const layoutView = await client.searchRead<{ id: number; key: string; arch_db: string }>(
    'ir.ui.view',
    [['key', '=', 'mail.mail_notification_layout']],
    ['id', 'key', 'arch_db']
  );

  if (layoutView.length > 0) {
    console.log('=== mail.mail_notification_layout ===');
    console.log('ID:', layoutView[0].id);
    // Check if it contains Odoo text
    const archDb = layoutView[0].arch_db || '';
    const hasOdoo = archDb.includes('Odoo') || archDb.includes('odoo');
    console.log('Contains Odoo text:', hasOdoo);

    if (hasOdoo) {
      console.log('\nRelevant excerpt:');
      const lines = archDb.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('odoo')) {
          console.log('Line ' + i + ': ' + lines[i].substring(0, 200));
        }
      }
    }
  }

  // 2. Check mail notification light layout
  const lightView = await client.searchRead<{ id: number; key: string; arch_db: string }>(
    'ir.ui.view',
    [['key', '=', 'mail.mail_notification_light']],
    ['id', 'key', 'arch_db']
  );

  if (lightView.length > 0) {
    console.log('\n=== mail.mail_notification_light ===');
    console.log('ID:', lightView[0].id);
    const archDb = lightView[0].arch_db || '';
    const hasOdoo = archDb.includes('Odoo') || archDb.includes('odoo');
    console.log('Contains Odoo text:', hasOdoo);
  }

  // 3. Check for sale order template specifically
  const saleTemplates = await client.searchRead<{ id: number; name: string; model: string; body_html: string }>(
    'mail.template',
    [['model', '=', 'sale.order']],
    ['id', 'name', 'model', 'body_html'],
    { limit: 10 }
  );

  console.log('\n=== Sale Order Templates ===');
  for (const t of saleTemplates) {
    console.log('\n' + t.id + ': ' + t.name);
    const bodyHtml = t.body_html || '';
    const hasOdoo = bodyHtml.toLowerCase().includes('odoo');
    console.log('  Contains Odoo:', hasOdoo);
    if (hasOdoo) {
      // Find and show the Odoo reference
      const idx = bodyHtml.toLowerCase().indexOf('odoo');
      const start = Math.max(0, idx - 50);
      const end = Math.min(bodyHtml.length, idx + 100);
      console.log('  Context:', bodyHtml.substring(start, end).replace(/\n/g, ' '));
    }
  }

  // 4. Check base.group_sale_salesman email signature
  console.log('\n=== Checking other potential sources ===');

  // Check web.external_layout views
  const externalViews = await client.searchRead<{ id: number; key: string }>(
    'ir.ui.view',
    [['key', 'ilike', 'web.external_layout%']],
    ['id', 'key'],
    { limit: 10 }
  );

  console.log('External layout views:', externalViews.map(v => v.key));

  // 5. Check ir.actions.server for email actions
  const emailActions = await client.searchRead<{ id: number; name: string; state: string }>(
    'ir.actions.server',
    [['state', '=', 'email']],
    ['id', 'name', 'state'],
    { limit: 5 }
  );

  console.log('\nEmail server actions:', emailActions.map(a => a.id + ': ' + a.name));
}

main().catch(console.error);
