/**
 * 分析 Odoo 18 产品现状
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://testodoo.seisei.tokyo',
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

  const data = await response.json() as { result?: unknown; error?: unknown };
  if (data.error) throw new Error(JSON.stringify(data.error));

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/session_id=([^;]+)/);
    if (match) globalSessionId = match[1];
  }
  return data.result;
}

async function main() {
  // 认证
  const auth = await jsonRpc('/web/session/authenticate', {
    db: ODOO18_CONFIG.db,
    login: ODOO18_CONFIG.username,
    password: ODOO18_CONFIG.password,
  }) as Record<string, unknown>;

  console.log('=== 当前产品分类结构 ===\n');

  // 获取所有分类
  const categories = await jsonRpc('/web/dataset/call_kw', {
    model: 'product.category',
    method: 'search_read',
    args: [[]],
    kwargs: { fields: ['id', 'name', 'parent_id', 'complete_name'], order: 'complete_name' },
  }) as Array<{ id: number; name: string; parent_id: [number, string] | false; complete_name: string }>;

  console.log('产品分类:');
  categories.forEach(c => {
    const indent = (c.complete_name?.match(/\//g) || []).length;
    console.log('  '.repeat(indent) + `[${c.id}] ${c.name}`);
  });

  // 获取所有产品及其分类
  const products = await jsonRpc('/web/dataset/call_kw', {
    model: 'product.template',
    method: 'search_read',
    args: [[]],
    kwargs: { fields: ['id', 'name', 'categ_id', 'list_price', 'active', 'default_code'], limit: 1000 },
  }) as Array<{ id: number; name: string; categ_id: [number, string] | false; list_price: number; active: boolean; default_code: string | false }>;

  console.log(`\n=== 产品统计 (共 ${products.length} 个) ===\n`);

  // 按分类统计
  const byCategory: Record<string, typeof products> = {};
  products.forEach(p => {
    const catName = p.categ_id ? p.categ_id[1] : '未分类';
    if (!byCategory[catName]) byCategory[catName] = [];
    byCategory[catName].push(p);
  });

  Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length).forEach(([cat, prods]) => {
    console.log(`\n【${cat}】(${prods.length}个)`);
    prods.slice(0, 8).forEach(p => {
      const price = p.list_price > 0 ? `¥${p.list_price}` : '无价格';
      console.log(`  - ${p.name} ${price}`);
    });
    if (prods.length > 8) console.log(`  ... 还有 ${prods.length - 8} 个`);
  });

  // 检查重复
  console.log('\n=== 可能的重复产品 ===\n');
  const nameCount: Record<string, number> = {};
  products.forEach(p => {
    const normalized = p.name.replace(/\s+/g, '').replace(/　/g, '').toLowerCase();
    nameCount[normalized] = (nameCount[normalized] || 0) + 1;
  });

  const duplicates = Object.entries(nameCount).filter(([_, count]) => count > 1);
  if (duplicates.length > 0) {
    console.log(`发现 ${duplicates.length} 组重复:`);
    duplicates.forEach(([normalizedName, count]) => {
      const matches = products.filter(p =>
        p.name.replace(/\s+/g, '').replace(/　/g, '').toLowerCase() === normalizedName
      );
      console.log(`  [x${count}] ${matches.map(m => `"${m.name}" (ID:${m.id})`).join(' / ')}`);
    });
  } else {
    console.log('无重复产品');
  }

  // 检查无价格产品
  console.log('\n=== 无价格产品 ===\n');
  const noPrice = products.filter(p => p.list_price === 0);
  console.log(`共 ${noPrice.length} 个产品无价格`);
  noPrice.slice(0, 10).forEach(p => {
    console.log(`  - ${p.name}`);
  });
}

main().catch(console.error);
