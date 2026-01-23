/**
 * Verify Payroll translations in Odoo 18
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

async function main() {
  console.log('Verifying Payroll Translations...\n');

  // Authenticate
  const auth = await jsonRpc('/web/session/authenticate', {
    db: ODOO18_CONFIG.db,
    login: ODOO18_CONFIG.username,
    password: ODOO18_CONFIG.password,
  }) as { uid: number };
  console.log('Authenticated:', auth.uid ? 'OK' : 'Failed');

  // Get salary rules in Chinese
  console.log('\n=== Chinese (zh_CN) ===');
  const zhRules = await jsonRpc('/web/dataset/call_kw', {
    model: 'hr.salary.rule',
    method: 'search_read',
    args: [[]],
    kwargs: { fields: ['name', 'code'], limit: 10, context: { lang: 'zh_CN' } },
  }) as Array<{ name: string; code: string }>;
  zhRules.forEach(r => console.log(`  ${r.code}: ${r.name}`));

  // Get in Japanese
  console.log('\n=== Japanese (ja_JP) ===');
  const jaRules = await jsonRpc('/web/dataset/call_kw', {
    model: 'hr.salary.rule',
    method: 'search_read',
    args: [[]],
    kwargs: { fields: ['name', 'code'], limit: 10, context: { lang: 'ja_JP' } },
  }) as Array<{ name: string; code: string }>;
  jaRules.forEach(r => console.log(`  ${r.code}: ${r.name}`));

  // Get categories in Chinese
  console.log('\n=== Categories (zh_CN) ===');
  const zhCats = await jsonRpc('/web/dataset/call_kw', {
    model: 'hr.salary.rule.category',
    method: 'search_read',
    args: [[]],
    kwargs: { fields: ['name'], limit: 10, context: { lang: 'zh_CN' } },
  }) as Array<{ name: string }>;
  zhCats.forEach(c => console.log(`  ${c.name}`));

  console.log('\n✓ Verification complete!');
}

main().catch(console.error);
