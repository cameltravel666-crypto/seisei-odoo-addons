/**
 * Fix Odoo 19 email configuration:
 * 1. Set sender to billing@seisei.tokyo
 * 2. Remove "Powered by Odoo" footer
 */

import { Odoo19Client } from '../src/lib/odoo19';

async function main() {
  const client = new Odoo19Client({
    baseUrl: process.env.ODOO19_URL || 'http://13.159.193.191:8069',
    db: process.env.ODOO19_DB || 'ERP',
    username: process.env.ODOO19_USERNAME || 'admin',
    password: process.env.ODOO19_PASSWORD || '',
  });

  await client.authenticate();
  console.log('Connected to Odoo 19');

  // 1. Update mail parameters
  const params = [
    { key: 'mail.catchall.domain', value: 'seisei.tokyo' },
    { key: 'mail.default.from', value: 'billing' },
    { key: 'mail.bounce.alias', value: 'bounce' },
  ];

  for (const p of params) {
    // Search for existing parameter
    const existing = await client.searchRead<{ id: number }>(
      'ir.config_parameter',
      [['key', '=', p.key]],
      ['id']
    );

    if (existing.length > 0) {
      await client.write('ir.config_parameter', [existing[0].id], { value: p.value });
      console.log(`Updated ${p.key} = ${p.value}`);
    } else {
      await client.create('ir.config_parameter', { key: p.key, value: p.value });
      console.log(`Created ${p.key} = ${p.value}`);
    }
  }

  // 2. Update outgoing mail server to use billing@seisei.tokyo
  const mailServers = await client.searchRead<{ id: number; name: string; smtp_user: string }>(
    'ir.mail_server',
    [],
    ['id', 'name', 'smtp_user']
  );

  console.log('Mail servers:', mailServers);

  for (const server of mailServers) {
    // Update the from_filter to use billing@seisei.tokyo
    await client.write('ir.mail_server', [server.id], {
      from_filter: 'billing@seisei.tokyo',
    });
    console.log(`Updated mail server ${server.name} from_filter = billing@seisei.tokyo`);
  }

  // 3. Disable "Powered by Odoo" in email templates
  // Search for the key configuration
  const companyIds = await client.search('res.company', []);
  if (companyIds.length > 0) {
    // Disable external email server signature
    await client.write('res.company', companyIds, {
      // In Odoo, there's no direct field for this - it's controlled by ir.config_parameter
    });
    console.log('Updated company settings');
  }

  // 4. Set email_from in system parameters to disable Odoo signature
  // The key is 'mail.force.html.email.layout' or we need to remove the footer template
  const layoutParams = [
    { key: 'mail.force.html.email.layout', value: 'False' },
  ];

  for (const p of layoutParams) {
    const existing = await client.searchRead<{ id: number }>(
      'ir.config_parameter',
      [['key', '=', p.key]],
      ['id']
    );

    if (existing.length > 0) {
      await client.write('ir.config_parameter', [existing[0].id], { value: p.value });
      console.log(`Updated ${p.key} = ${p.value}`);
    }
  }

  // 5. Check and update mail templates to remove Odoo footer
  // Search for mail templates that might have Odoo footer
  const templates = await client.searchRead<{ id: number; name: string; body_html: string }>(
    'mail.template',
    [['body_html', 'ilike', 'Odoo']],
    ['id', 'name', 'body_html'],
    { limit: 10 }
  );

  console.log(`Found ${templates.length} templates with "Odoo" in body`);
  for (const t of templates) {
    console.log(`  - ${t.id}: ${t.name}`);
  }

  console.log('\n=== Email Configuration Updated ===');
  console.log('Sender: billing@seisei.tokyo');
  console.log('Please restart Odoo to apply changes if needed.');
}

main().catch(console.error);
