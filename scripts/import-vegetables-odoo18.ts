/**
 * 导入蔬菜水果产品到 Odoo 18 test001 数据库
 * 数据来源: 8-17.pdf 请求明细书 (豊華商事)
 *
 * 使用方法:
 * cd "/Users/taozhang/Projects/Seisei ERP" && npx tsx scripts/import-vegetables-odoo18.ts
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://testodoo.seisei.tokyo',
  db: 'test001',
  username: 'test',
  password: 'test',
};

interface Product {
  code: string;
  name: string;
  price: number;
  unit: string;
  taxRate: number;
}

// 从 PDF 提取的产品列表 (去重后)
const PRODUCTS: Product[] = [
  // 蔬菜类
  { code: '100-1', name: '胡瓜A', price: 65, unit: '本', taxRate: 8 },
  { code: '083', name: '小ネギ', price: 168, unit: '束', taxRate: 8 },
  { code: '071', name: 'サニーレタス', price: 158, unit: '束', taxRate: 8 },
  { code: '001', name: '木綿豆腐（丁）', price: 58, unit: '丁', taxRate: 8 },
  { code: '009', name: '成田もやし', price: 39, unit: '袋', taxRate: 8 },
  { code: '0211', name: '大根3L', price: 198, unit: '本', taxRate: 8 },
  { code: '021-11', name: '大根3L（6本入）', price: 1150, unit: '箱', taxRate: 8 },
  { code: '019-1', name: 'キャベツ（大）', price: 198, unit: '個', taxRate: 8 },
  { code: '019-3', name: 'キャベツ6〜10人', price: 1380, unit: '箱', taxRate: 8 },
  { code: '025', name: '真空玉葱', price: 150, unit: 'kg', taxRate: 8 },
  { code: '036', name: '長ねぎL', price: 48, unit: '本', taxRate: 8 },
  { code: '036-332', name: '長ねぎ太H 中国産', price: 1380, unit: '箱', taxRate: 8 },
  { code: '030-1', name: '紫玉葱大', price: 85, unit: '個', taxRate: 8 },
  { code: '017-1', name: '白菜大', price: 280, unit: '個', taxRate: 8 },
  { code: '017', name: '白菜', price: 280, unit: '個', taxRate: 8 },
  { code: '017-4', name: '白菜（箱）', price: 1380, unit: '箱', taxRate: 8 },
  { code: '081', name: 'パプリカ赤', price: 238, unit: '個', taxRate: 8 },
  { code: '082', name: 'パプリカ黄', price: 238, unit: '個', taxRate: 8 },
  { code: '022-1', name: '人参（本）', price: 45, unit: '本', taxRate: 8 },
  { code: '106', name: 'トマトL', price: 158, unit: '個', taxRate: 8 },
  { code: '106-2', name: 'トマトLL', price: 168, unit: '個', taxRate: 8 },
  { code: '107', name: 'ミニトマト赤（パック）', price: 258, unit: 'pc', taxRate: 8 },
  { code: '056', name: 'にら', price: 138, unit: '束', taxRate: 8 },
  { code: '050', name: '水菜', price: 115, unit: '束', taxRate: 8 },
  { code: '046-2', name: '小松菜（中束）', price: 180, unit: '束', taxRate: 8 },
  { code: '023-2', name: 'じゃが芋（3L）', price: 380, unit: 'kg', taxRate: 8 },
  { code: '104', name: '長茄子A', price: 550, unit: 'kg', taxRate: 8 },

  // 水果类
  { code: '035', name: 'レモン CL産 140s', price: 59, unit: '個', taxRate: 8 },
  { code: '035-1', name: 'レモン USA産 140s', price: 65, unit: '個', taxRate: 8 },
  { code: '142-1', name: 'グレープフルーツ', price: 128, unit: '個', taxRate: 8 },
  { code: '150-1', name: 'ゴールドキウイ', price: 138, unit: '個', taxRate: 8 },

  // 其他
  { code: '189', name: '真空笹100枚', price: 680, unit: '袋', taxRate: 8 },
  { code: '013', name: '玉子 入荷激減', price: 3950, unit: '箱', taxRate: 8 },
];

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

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/session_id=([^;]+)/);
    if (match) {
      globalSessionId = match[1];
    }
  }

  return data.result;
}

function normalizeForDedup(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/・/g, '')
    .replace(/　/g, '')
    .toLowerCase();
}

async function main() {
  console.log('🥬 导入蔬菜水果产品到 Odoo 18 test001\n');
  console.log('数据来源: 8-17.pdf (豊華商事 请求明细书)');
  console.log('配置:');
  console.log(`  URL: ${ODOO18_CONFIG.baseUrl}`);
  console.log(`  DB: ${ODOO18_CONFIG.db}`);
  console.log(`  User: ${ODOO18_CONFIG.username}`);
  console.log(`  产品数量: ${PRODUCTS.length}\n`);

  try {
    // 1. 认证
    console.log('1. 正在认证...');
    const authResult = await jsonRpc('/web/session/authenticate', {
      db: ODOO18_CONFIG.db,
      login: ODOO18_CONFIG.username,
      password: ODOO18_CONFIG.password,
    }) as Record<string, unknown>;

    if (!authResult.uid) {
      throw new Error('认证失败');
    }
    console.log(`   ✅ 认证成功, uid: ${authResult.uid}\n`);

    // 2. 检查已存在的产品
    console.log('2. 检查已存在的产品...');
    const existingProducts = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.template',
      method: 'search_read',
      args: [[]],
      kwargs: {
        fields: ['id', 'name', 'default_code'],
        limit: 1000,
      },
    }) as Array<{ id: number; name: string; default_code: string | false }>;

    const existingNames = new Set(existingProducts.map(p => normalizeForDedup(p.name)));
    const existingCodes = new Set(existingProducts.filter(p => p.default_code).map(p => p.default_code));
    console.log(`   已存在 ${existingProducts.length} 个产品\n`);

    // 3. 获取或创建产品分类
    console.log('3. 获取/创建产品分类...');
    let categoryId: number;

    const categories = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.category',
      method: 'search_read',
      args: [[['name', '=', '蔬菜・水果']]],
      kwargs: { fields: ['id'], limit: 1 },
    }) as Array<{ id: number }>;

    if (categories.length > 0) {
      categoryId = categories[0].id;
      console.log(`   使用已有分类: 蔬菜・水果 (ID: ${categoryId})\n`);
    } else {
      categoryId = await jsonRpc('/web/dataset/call_kw', {
        model: 'product.category',
        method: 'create',
        args: [{ name: '蔬菜・水果' }],
        kwargs: {},
      }) as number;
      console.log(`   创建新分类: 蔬菜・水果 (ID: ${categoryId})\n`);
    }

    // 4. 筛选需要创建的产品
    const toCreate = PRODUCTS.filter(p =>
      !existingNames.has(normalizeForDedup(p.name)) &&
      !existingCodes.has(p.code)
    );
    console.log(`4. 需要创建: ${toCreate.length} 个新产品\n`);

    if (toCreate.length === 0) {
      console.log('✅ 所有产品已存在，无需导入');
      return;
    }

    // 5. 创建产品
    console.log('5. 创建产品...');
    let created = 0;
    let failed = 0;

    for (const product of toCreate) {
      try {
        const productId = await jsonRpc('/web/dataset/call_kw', {
          model: 'product.template',
          method: 'create',
          args: [{
            name: product.name,
            default_code: product.code,
            type: 'consu',  // 消耗品
            categ_id: categoryId,
            sale_ok: true,
            purchase_ok: true,
            list_price: product.price,
            // 备注单位和税率
            description_purchase: `単位: ${product.unit} | 税率: ${product.taxRate}%`,
          }],
          kwargs: {},
        }) as number;

        created++;
        console.log(`   ✅ [${created}/${toCreate.length}] ${product.code} ${product.name} ¥${product.price}/${product.unit} (ID: ${productId})`);
      } catch (error) {
        failed++;
        console.log(`   ❌ 失败: ${product.name} - ${error}`);
      }
    }

    // 6. 总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 导入结果');
    console.log('='.repeat(60));
    console.log(`  总产品数: ${PRODUCTS.length}`);
    console.log(`  已存在: ${PRODUCTS.length - toCreate.length}`);
    console.log(`  新创建: ${created}`);
    console.log(`  失败: ${failed}`);
    console.log(`  税率: 全部 8% (軽減税率)`);
    console.log('\n✅ 导入完成!');
    console.log(`\n访问: ${ODOO18_CONFIG.baseUrl}/web#model=product.template&view_type=list`);

  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

main();
