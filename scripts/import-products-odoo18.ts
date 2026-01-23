/**
 * 导入产品到 Odoo 18 test001 数据库
 *
 * 使用方法:
 * cd "/Users/taozhang/Projects/Seisei ERP" && npx tsx scripts/import-products-odoo18.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ODOO18_CONFIG = {
  baseUrl: 'https://testodoo.seisei.tokyo',
  db: 'test001',
  username: 'test',
  password: 'test',
};

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

let globalSessionId: string | undefined;

async function jsonRpc(
  endpoint: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (globalSessionId) {
    headers['Cookie'] = `session_id=${globalSessionId}`;
  }

  const response = await fetch(`${ODOO18_CONFIG.baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params,
      id: Date.now(),
    }),
  });

  const data: JsonRpcResponse = await response.json();

  if (data.error) {
    throw new Error(JSON.stringify(data.error, null, 2));
  }

  // Extract session_id from Set-Cookie header
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/session_id=([^;]+)/);
    if (match) {
      globalSessionId = match[1];
    }
  }

  return data.result;
}

// 解析产品名称，提取容量信息
function parseProduct(line: string): { name: string; volume: string | null; unit: string | null } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('?')) return { name: trimmed, volume: null, unit: null };

  // 匹配容量模式: 数字 + 单位 (L, ml, kg, 本)
  const volumeMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(L|ml|kg|本|瓶)$/i);

  if (volumeMatch) {
    return {
      name: trimmed,
      volume: volumeMatch[1],
      unit: volumeMatch[2],
    };
  }

  return { name: trimmed, volume: null, unit: null };
}

// 标准化产品名称用于去重
function normalizeForDedup(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/・/g, '')
    .replace(/　/g, '')
    .toLowerCase();
}

async function main() {
  console.log('🍺 导入饮料产品到 Odoo 18 test001\n');
  console.log('配置:');
  console.log(`  URL: ${ODOO18_CONFIG.baseUrl}`);
  console.log(`  DB: ${ODOO18_CONFIG.db}`);
  console.log(`  User: ${ODOO18_CONFIG.username}\n`);

  try {
    // 1. 读取产品列表
    console.log('1. 读取产品列表...');
    const nextTxtPath = path.join(__dirname, '..', 'next.txt');
    const content = fs.readFileSync(nextTxtPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('?'));

    console.log(`   找到 ${lines.length} 行产品数据`);

    // 2. 去重
    console.log('\n2. 去重处理...');
    const seen = new Map<string, string>();
    const uniqueProducts: string[] = [];

    for (const line of lines) {
      const normalized = normalizeForDedup(line.trim());
      if (!seen.has(normalized)) {
        seen.set(normalized, line.trim());
        uniqueProducts.push(line.trim());
      }
    }

    console.log(`   去重后: ${uniqueProducts.length} 个唯一产品`);

    // 3. 认证
    console.log('\n3. 正在认证...');
    const authResult = await jsonRpc('/web/session/authenticate', {
      db: ODOO18_CONFIG.db,
      login: ODOO18_CONFIG.username,
      password: ODOO18_CONFIG.password,
    }) as Record<string, unknown>;

    if (!authResult.uid) {
      throw new Error('认证失败');
    }
    console.log(`   ✅ 认证成功, uid: ${authResult.uid}`);

    // 4. 检查已存在的产品
    console.log('\n4. 检查已存在的产品...');
    const existingProducts = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.template',
      method: 'search_read',
      args: [[]],
      kwargs: {
        fields: ['id', 'name'],
        limit: 1000,
      },
    }) as Array<{ id: number; name: string }>;

    const existingNames = new Set(existingProducts.map(p => normalizeForDedup(p.name)));
    console.log(`   已存在 ${existingProducts.length} 个产品`);

    // 5. 筛选需要创建的产品
    const toCreate = uniqueProducts.filter(p => !existingNames.has(normalizeForDedup(p)));
    console.log(`   需要创建: ${toCreate.length} 个新产品`);

    if (toCreate.length === 0) {
      console.log('\n✅ 所有产品已存在，无需导入');
      return;
    }

    // 6. 获取或创建产品分类
    console.log('\n5. 获取/创建产品分类...');
    let categoryId: number;

    const categories = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.category',
      method: 'search_read',
      args: [[['name', '=', '飲料・酒類']]],
      kwargs: { fields: ['id'], limit: 1 },
    }) as Array<{ id: number }>;

    if (categories.length > 0) {
      categoryId = categories[0].id;
      console.log(`   使用已有分类: 飲料・酒類 (ID: ${categoryId})`);
    } else {
      categoryId = await jsonRpc('/web/dataset/call_kw', {
        model: 'product.category',
        method: 'create',
        args: [{ name: '飲料・酒類' }],
        kwargs: {},
      }) as number;
      console.log(`   创建新分类: 飲料・酒類 (ID: ${categoryId})`);
    }

    // 7. 创建产品
    console.log('\n6. 创建产品...');
    let created = 0;
    let failed = 0;

    for (const productName of toCreate) {
      try {
        const productId = await jsonRpc('/web/dataset/call_kw', {
          model: 'product.template',
          method: 'create',
          args: [{
            name: productName,
            type: 'consu',  // 消耗品
            categ_id: categoryId,
            sale_ok: true,
            purchase_ok: true,
            list_price: 0,  // 稍后设置价格
          }],
          kwargs: {},
        }) as number;

        created++;
        console.log(`   ✅ [${created}/${toCreate.length}] ${productName} (ID: ${productId})`);
      } catch (error) {
        failed++;
        console.log(`   ❌ 失败: ${productName} - ${error}`);
      }
    }

    // 8. 总结
    console.log('\n' + '='.repeat(50));
    console.log('📊 导入结果');
    console.log('='.repeat(50));
    console.log(`  总产品数: ${uniqueProducts.length}`);
    console.log(`  已存在: ${uniqueProducts.length - toCreate.length}`);
    console.log(`  新创建: ${created}`);
    console.log(`  失败: ${failed}`);
    console.log('\n✅ 导入完成!');
    console.log(`\n访问: ${ODOO18_CONFIG.baseUrl}/web#action=product.product_template_action&model=product.template&view_type=list`);

  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

main();
