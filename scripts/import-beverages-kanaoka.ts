/**
 * 导入酒类饮料产品到 Odoo 18 test001 数据库
 * 数据来源: 2-7.pdf 请求書 (金岡商事)
 *
 * 使用方法:
 * cd "/Users/taozhang/Projects/Seisei ERP" && npx tsx scripts/import-beverages-kanaoka.ts
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://testodoo.seisei.tokyo',
  db: 'test001',
  username: 'test',
  password: 'test',
};

interface Product {
  name: string;
  price: number;
  unit: string;
  taxRate: number;
  category: '酒類' | '飲料・シロップ' | '備品';
}

// 从 PDF 提取的产品列表 (去重后)
const PRODUCTS: Product[] = [
  // ===== 酒類 (10% 税率) =====
  // ビール・発泡酒
  { name: 'サントリー 生ビール樽 20L', price: 10560, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'アサヒ スーパードライ・中瓶・500ml', price: 255, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'サントリー ザ・プレミアムモルツ・中瓶・500ml', price: 278, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'サントリー オールフリー小瓶 334ml', price: 148, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'サッポロ ラガー 中瓶 500ml（赤★）', price: 270, unit: '本', taxRate: 10, category: '酒類' },

  // ウィスキー
  { name: 'サントリー特製 角 業務用 5L', price: 8980, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'サントリー ウィスキー 知多 700ml', price: 5800, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'サントリートリス クラシック ウィスキー 4L', price: 3980, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'ジム ビーム 業務用 4L', price: 5300, unit: '本', taxRate: 10, category: '酒類' },

  // 焼酎
  { name: '甲20° 聖酒造 酒次郎 4L', price: 1850, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'キッコー宮甲25° 亀甲宮焼酎 720ml', price: 580, unit: '本', taxRate: 10, category: '酒類' },
  { name: '二階堂 麦 25% 900ml', price: 960, unit: '本', taxRate: 10, category: '酒類' },
  { name: '乙25° 麦 神ノ河 720ml', price: 1180, unit: '本', taxRate: 10, category: '酒類' },
  { name: '乙25° 本格焼酎 れんと 720ml', price: 980, unit: '本', taxRate: 10, category: '酒類' },
  { name: '乙25° 黒霧島芋 720ml', price: 880, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'ジャスミン焼酒茉莉花（まつりか）紙 1.8L', price: 1890, unit: '本', taxRate: 10, category: '酒類' },
  { name: '富乃宝山 720ml', price: 1780, unit: '本', taxRate: 10, category: '酒類' },
  { name: '鍛高譚 しそ焼酎 720ml', price: 864, unit: '本', taxRate: 10, category: '酒類' },

  // 日本酒
  { name: '八海山1.8L（普）', price: 2120, unit: '本', taxRate: 10, category: '酒類' },
  { name: '久保田 千寿 1.8L', price: 2880, unit: '本', taxRate: 10, category: '酒類' },
  { name: '獺祭（だっさい）純米大吟醸45 1.8L', price: 4900, unit: '本', taxRate: 10, category: '酒類' },
  { name: '鍋島 特別純米 1.8L', price: 5150, unit: '本', taxRate: 10, category: '酒類' },
  { name: '浦霞 本醸造 本仕込み 1.8L', price: 2260, unit: '本', taxRate: 10, category: '酒類' },

  // ワイン
  { name: 'K ロスカロス 白 3L', price: 1830, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'K ロスカロス 赤 3L', price: 1830, unit: '本', taxRate: 10, category: '酒類' },

  // リキュール
  { name: 'サントリープログレ カシスリキュール 1.8L (PET)', price: 1580, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'サントリープログレ ピーチ 1.8L (PET)', price: 1580, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'SUこだわり酒場のレモンサワーの素 1.8L', price: 2450, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'サントリー南梅酒しませんか 紙 2L', price: 850, unit: '本', taxRate: 10, category: '酒類' },

  // ガス
  { name: 'サッポロ 炭酸ガス 5kg', price: 8280, unit: '本', taxRate: 10, category: '酒類' },
  { name: 'アサヒ 樽用ガス 5kg', price: 8280, unit: '本', taxRate: 10, category: '酒類' },

  // ===== 飲料・シロップ (8% 軽減税率) =====
  { name: '黒ホッピ 360ml', price: 112, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: '白ホッピ 360ml', price: 112, unit: '個', taxRate: 8, category: '飲料・シロップ' },
  { name: 'トウモロコシのひげ茶1.5L', price: 240, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: 'カルピス L パック 1L', price: 720, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: '三田 オレンジェード 1L', price: 640, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: '三田スタンダード・ザ・レモン 1L', price: 550, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: '三田ブルーベリー エード 1L', price: 760, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: 'スミダ コーラシロップ 1L', price: 660, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: 'スミダ 4xグレープフルーツ フルーツ 1L', price: 620, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: 'スミダ 酎ハイベースピーチ 1L', price: 680, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: 'スミダ ジンジャーシロップ 1L', price: 730, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: 'PS 業務用 男梅シロップ 1L', price: 780, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: 'コカ・コーラ 原液 シロサワーベース PET 1L', price: 650, unit: '本', taxRate: 8, category: '飲料・シロップ' },
  { name: 'ミニッツメイド業務用オレンジ 紙 1L', price: 395, unit: '本', taxRate: 8, category: '飲料・シロップ' },

  // ===== 備品 (10% 税率, 価格0円 = サービス品) =====
  { name: 'お猪口', price: 0, unit: '個', taxRate: 10, category: '備品' },
  { name: 'マドラ', price: 0, unit: '個', taxRate: 10, category: '備品' },
  { name: 'ディスペンサー 25ml', price: 0, unit: '個', taxRate: 10, category: '備品' },
  { name: '一合グラス', price: 0, unit: '個', taxRate: 10, category: '備品' },
  { name: '二合グラス', price: 0, unit: '個', taxRate: 10, category: '備品' },
  { name: 'スポンジ', price: 0, unit: '個', taxRate: 10, category: '備品' },
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

async function getOrCreateCategory(name: string, parentId?: number): Promise<number> {
  const domain: unknown[] = [['name', '=', name]];
  if (parentId) {
    domain.push(['parent_id', '=', parentId]);
  }

  const categories = await jsonRpc('/web/dataset/call_kw', {
    model: 'product.category',
    method: 'search_read',
    args: [domain],
    kwargs: { fields: ['id'], limit: 1 },
  }) as Array<{ id: number }>;

  if (categories.length > 0) {
    return categories[0].id;
  }

  const values: Record<string, unknown> = { name };
  if (parentId) {
    values.parent_id = parentId;
  }

  return await jsonRpc('/web/dataset/call_kw', {
    model: 'product.category',
    method: 'create',
    args: [values],
    kwargs: {},
  }) as number;
}

async function main() {
  console.log('🍺 导入酒类饮料产品到 Odoo 18 test001\n');
  console.log('数据来源: 2-7.pdf (金岡商事 请求書)');
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
        fields: ['id', 'name'],
        limit: 2000,
      },
    }) as Array<{ id: number; name: string }>;

    const existingNames = new Set(existingProducts.map(p => normalizeForDedup(p.name)));
    console.log(`   已存在 ${existingProducts.length} 个产品\n`);

    // 3. 创建产品分类
    console.log('3. 创建产品分类...');
    const categoryIds: Record<string, number> = {};

    // 主分类: 金岡商事
    const mainCategoryId = await getOrCreateCategory('金岡商事');
    console.log(`   主分类: 金岡商事 (ID: ${mainCategoryId})`);

    // 子分类
    categoryIds['酒類'] = await getOrCreateCategory('酒類', mainCategoryId);
    console.log(`   - 酒類 (ID: ${categoryIds['酒類']})`);

    categoryIds['飲料・シロップ'] = await getOrCreateCategory('飲料・シロップ', mainCategoryId);
    console.log(`   - 飲料・シロップ (ID: ${categoryIds['飲料・シロップ']})`);

    categoryIds['備品'] = await getOrCreateCategory('備品', mainCategoryId);
    console.log(`   - 備品 (ID: ${categoryIds['備品']})\n`);

    // 4. 筛选需要创建的产品
    const toCreate = PRODUCTS.filter(p => !existingNames.has(normalizeForDedup(p.name)));
    console.log(`4. 需要创建: ${toCreate.length} 个新产品\n`);

    if (toCreate.length === 0) {
      console.log('✅ 所有产品已存在，无需导入');
      return;
    }

    // 5. 创建产品
    console.log('5. 创建产品...');
    let created = 0;
    let failed = 0;

    // 按分类分组显示
    const byCategory = {
      '酒類': toCreate.filter(p => p.category === '酒類'),
      '飲料・シロップ': toCreate.filter(p => p.category === '飲料・シロップ'),
      '備品': toCreate.filter(p => p.category === '備品'),
    };

    for (const [category, products] of Object.entries(byCategory)) {
      if (products.length === 0) continue;

      console.log(`\n   【${category}】(${products.length}个)`);

      for (const product of products) {
        try {
          const productId = await jsonRpc('/web/dataset/call_kw', {
            model: 'product.template',
            method: 'create',
            args: [{
              name: product.name,
              type: 'consu',
              categ_id: categoryIds[product.category],
              sale_ok: true,
              purchase_ok: true,
              list_price: product.price,
              description_purchase: `単位: ${product.unit} | 税率: ${product.taxRate}%`,
            }],
            kwargs: {},
          }) as number;

          created++;
          const priceStr = product.price > 0 ? `¥${product.price.toLocaleString()}` : 'サービス品';
          console.log(`   ✅ ${product.name} ${priceStr}/${product.unit} (ID: ${productId})`);
        } catch (error) {
          failed++;
          console.log(`   ❌ 失败: ${product.name} - ${error}`);
        }
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
    console.log('\n  税率分布:');
    console.log(`    10% (酒類): ${PRODUCTS.filter(p => p.taxRate === 10 && p.category === '酒類').length} 个`);
    console.log(`    8% (軽減税率): ${PRODUCTS.filter(p => p.taxRate === 8).length} 个`);
    console.log('\n✅ 导入完成!');
    console.log(`\n访问: ${ODOO18_CONFIG.baseUrl}/web#model=product.template&view_type=list`);

  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

main();
