/**
 * Check menu translations in Odoo 18
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://demo.nagashiro.top',
  db: 'test001',
  username: 'test',
  password: 'test',
};

let globalSessionId: string | undefined;

async function jsonRpc(endpoint: string, params: Record<string, unknown>): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (globalSessionId) headers['Cookie'] = `session_id=${globalSessionId}`;

  const response = await fetch(`${ODOO18_CONFIG.baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: Date.now() }),
  });

  const data = await response.json();
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/session_id=([^;]+)/);
    if (match) globalSessionId = match[1];
  }
  return data.result;
}

async function callKw(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<unknown> {
  return jsonRpc('/web/dataset/call_kw', { model, method, args, kwargs });
}

async function main() {
  console.log('Checking Menu Translations...\n');

  // Authenticate
  const auth = await jsonRpc('/web/session/authenticate', {
    db: ODOO18_CONFIG.db,
    login: ODOO18_CONFIG.username,
    password: ODOO18_CONFIG.password,
  }) as { uid: number };
  console.log('Authenticated:', auth.uid ? 'OK' : 'Failed');

  // Get payroll menus in different languages
  const payrollMenus = [
    'Employee Payslips',
    'Payslips Batches',
    'Salary Structures',
    'Salary Rules',
    'Salary Rule Categories',
    'Contribution Registers',
    'Contract Advantage Templates',
    'Settings',
    'Configuration',
  ];

  console.log('\n=== English (en_US) ===');
  const enMenus = await callKw(
    'ir.ui.menu',
    'search_read',
    [[['name', 'in', payrollMenus]]],
    { fields: ['name'], limit: 20, context: { lang: 'en_US' } }
  ) as Array<{ name: string }>;
  enMenus.forEach(m => console.log(`  ${m.name}`));

  console.log('\n=== Chinese (zh_CN) ===');
  const zhMenus = await callKw(
    'ir.ui.menu',
    'search_read',
    [[['id', 'in', (await callKw('ir.ui.menu', 'search', [[['name', 'in', payrollMenus]]], { limit: 20 }) as number[])]]],
    { fields: ['name'], limit: 20, context: { lang: 'zh_CN' } }
  ) as Array<{ name: string }>;
  zhMenus.forEach(m => console.log(`  ${m.name}`));

  console.log('\n=== Japanese (ja_JP) ===');
  const jaMenus = await callKw(
    'ir.ui.menu',
    'search_read',
    [[['id', 'in', (await callKw('ir.ui.menu', 'search', [[['name', 'in', payrollMenus]]], { limit: 20 }) as number[])]]],
    { fields: ['name'], limit: 20, context: { lang: 'ja_JP' } }
  ) as Array<{ name: string }>;
  jaMenus.forEach(m => console.log(`  ${m.name}`));

  // Check payroll specific menus
  console.log('\n=== Payroll Module Menus (zh_CN) ===');
  try {
    const payrollModuleMenus = await callKw(
      'ir.ui.menu',
      'search_read',
      [[['parent_id.name', 'ilike', 'payroll']]],
      { fields: ['name', 'parent_id'], limit: 20, context: { lang: 'zh_CN' } }
    ) as Array<{ name: string; parent_id: [number, string] | false }>;
    payrollModuleMenus.forEach(m => console.log(`  ${m.name} (parent: ${m.parent_id ? m.parent_id[1] : 'root'})`));
  } catch (e) {
    console.log('  Could not fetch payroll menus');
  }

  console.log('\n✓ Check complete!');
}

main().catch(console.error);
