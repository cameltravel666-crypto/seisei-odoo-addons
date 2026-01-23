/**
 * 产品清洗和整理脚本
 * 按照标准餐饮企业进行分类
 *
 * 使用方法:
 * cd "/Users/taozhang/Projects/Seisei ERP" && npx tsx scripts/cleanup-products-odoo18.ts
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://testodoo.seisei.tokyo',
  db: 'test001',
  username: 'test',
  password: 'test',
};

// 标准餐饮企业产品分类结构
const CATEGORY_STRUCTURE = {
  '仕入品': {  // 采购品
    '酒類': {  // 酒类
      'ビール・発泡酒': null,  // 啤酒
      'ウィスキー': null,  // 威士忌
      '焼酎': null,  // 烧酎
      '日本酒': null,  // 日本酒
      'ワイン': null,  // 葡萄酒
      'リキュール・梅酒': null,  // 利口酒・梅酒
    },
    '飲料・シロップ': {  // 饮料・糖浆
      'ソフトドリンク': null,  // 软饮料
      'シロップ・ベース': null,  // 糖浆・调酒基底
      'ジュース': null,  // 果汁
    },
    '食材': {  // 食材
      '野菜': null,  // 蔬菜
      '果物': null,  // 水果
      '肉類': null,  // 肉类
      '海鮮': null,  // 海鲜
      '乳製品・卵': null,  // 乳制品・蛋
      '豆腐・豆製品': null,  // 豆腐・豆制品
      '乾物': null,  // 干货
    },
    '調味料': {  // 调味料
      '基本調味料': null,  // 基本调味料
      'ソース・タレ': null,  // 酱料
      '香辛料': null,  // 香辛料
      '油脂': null,  // 油脂
    },
    '主食': {  // 主食
      '米': null,  // 米
      '麺類': null,  // 面类
      'パン・粉類': null,  // 面包・粉类
    },
    '消耗品': {  // 消耗品
      'ガス・炭酸': null,  // 气体
      '包装材料': null,  // 包装材料
      '備品': null,  // 备品
    },
  },
};

// 产品分类规则 (关键词 -> 分类路径)
const CATEGORIZATION_RULES: Array<{ keywords: string[]; category: string }> = [
  // 啤酒
  { keywords: ['ビール', '生ビール', 'スーパードライ', 'プレミアムモルツ', 'ラガー', 'オールフリー', 'Draft Beer', 'Lager'], category: '仕入品/酒類/ビール・発泡酒' },
  // 威士忌
  { keywords: ['ウィスキー', 'ウイスキー', '角', 'トリス', 'ビーム', '知多', 'Whisky', 'Whiskey', 'Jim Beam', 'Kakubin'], category: '仕入品/酒類/ウィスキー' },
  // 烧酎
  { keywords: ['焼酎', '焼酒', '麦', '芋', '甲', '乙', '神ノ河', '黒霧島', '二階堂', 'れんと', '鍛高譚', 'Shochu'], category: '仕入品/酒類/焼酎' },
  // 日本酒
  { keywords: ['日本酒', '純米', '大吟醸', '八海山', '久保田', '獺祭', '鍋島', '浦霞', 'Sake', 'Junmai', 'Daiginjo'], category: '仕入品/酒類/日本酒' },
  // 葡萄酒
  { keywords: ['ワイン', 'ロスカロス', 'Wine', '赤', '白'], category: '仕入品/酒類/ワイン' },
  // 利口酒
  { keywords: ['リキュール', '梅酒', 'カシス', 'ピーチ', 'プログレ', 'レモンサワー', 'Liqueur', 'Plum Wine'], category: '仕入品/酒類/リキュール・梅酒' },

  // 软饮料
  { keywords: ['ホッピ', 'ひげ茶', 'Hoppy', 'Tea', 'レッドブル', 'Red Bull'], category: '仕入品/飲料・シロップ/ソフトドリンク' },
  // 糖浆
  { keywords: ['シロップ', 'ベース', 'Syrup', 'Base', 'コーラ', 'Cola', 'ジンジャー', 'Ginger', '男梅'], category: '仕入品/飲料・シロップ/シロップ・ベース' },
  // 果汁
  { keywords: ['ジュース', 'オレンジ', 'グレープ', 'カルピス', 'Juice', 'Orange', 'Calpis', 'ミニッツメイド', 'Minute Maid', 'オレンジェード', 'レモン'], category: '仕入品/飲料・シロップ/ジュース' },

  // 蔬菜
  { keywords: ['キャベツ', 'レタス', 'ネギ', 'ねぎ', '大根', '白菜', 'トマト', 'パプリカ', '人参', 'にら', '水菜', 'もやし', '胡瓜', 'きゅうり', '茄子', 'Cabbage', 'Lettuce', 'Onion', 'Tomato', 'Carrot', 'Cucumber', 'Eggplant', '玉葱', '小松菜', '黄瓜', '卷心菜', '生菜', '萝卜', '豆芽', '韭菜'], category: '仕入品/食材/野菜' },
  // 水果
  { keywords: ['レモン', 'グレープフルーツ', 'キウイ', 'Lemon', 'Grapefruit', 'Kiwi', '柠檬', '葡萄柚', '奇异果', '果物'], category: '仕入品/食材/果物' },
  // 豆腐
  { keywords: ['豆腐', 'Tofu', '木綿', '绢'], category: '仕入品/食材/豆腐・豆製品' },
  // 蛋
  { keywords: ['玉子', '卵', 'Egg', '鸡蛋'], category: '仕入品/食材/乳製品・卵' },
  // 干货
  { keywords: ['笹', '竹叶', 'Bamboo'], category: '仕入品/食材/乾物' },

  // 气体
  { keywords: ['ガス', '炭酸', 'Gas', 'CO2'], category: '仕入品/消耗品/ガス・炭酸' },
  // 备品
  { keywords: ['猪口', 'グラス', 'マドラ', 'ディスペンサー', 'スポンジ', 'Glass', 'Muddler', 'Dispenser', 'Sponge', '清酒杯', '搅拌棒', '海绵'], category: '仕入品/消耗品/備品' },
];

// 需要删除的垃圾数据 (OCR 错误等)
const GARBAGE_PATTERNS = [
  /^-\s*\d/,  // 以 "- 数字" 开头
  /^-[A-Za-z]/,  // 以 "-字母" 开头
  /^<.*>$/,  // 尖括号包围
  /^[0-9.]+$/,  // 纯数字
  /^\s*$/,  // 空白
  /^-\s*$/,  // 只有横杠
  /票计/,  // OCR 错误
  /^7'-/,  // OCR 错误
];

// 重复产品处理规则 (保留价格最高的或ID最小的)
interface Product {
  id: number;
  name: string;
  categ_id: [number, string] | false;
  list_price: number;
  active: boolean;
  default_code: string | false;
}

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

// 创建分类结构
async function createCategoryStructure(structure: Record<string, unknown>, parentId?: number): Promise<Record<string, number>> {
  const categoryIds: Record<string, number> = {};

  for (const [name, children] of Object.entries(structure)) {
    // 检查分类是否存在
    const domain: unknown[] = [['name', '=', name]];
    if (parentId) domain.push(['parent_id', '=', parentId]);

    const existing = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.category',
      method: 'search_read',
      args: [domain],
      kwargs: { fields: ['id'], limit: 1 },
    }) as Array<{ id: number }>;

    let categoryId: number;
    if (existing.length > 0) {
      categoryId = existing[0].id;
    } else {
      const values: Record<string, unknown> = { name };
      if (parentId) values.parent_id = parentId;
      categoryId = await jsonRpc('/web/dataset/call_kw', {
        model: 'product.category',
        method: 'create',
        args: [values],
        kwargs: {},
      }) as number;
    }

    const fullPath = parentId ? `${categoryIds._currentPath}/${name}` : name;
    categoryIds[fullPath] = categoryId;

    if (children && typeof children === 'object') {
      const childIds = await createCategoryStructure(
        children as Record<string, unknown>,
        categoryId
      );
      // Merge child category IDs
      for (const [path, id] of Object.entries(childIds)) {
        if (!path.startsWith('_')) {
          categoryIds[`${fullPath}/${path}`] = id;
        }
      }
    }
  }

  return categoryIds;
}

// 判断产品应该属于哪个分类
function categorizeProduct(product: Product): string | null {
  const name = product.name;

  for (const rule of CATEGORIZATION_RULES) {
    for (const keyword of rule.keywords) {
      if (name.includes(keyword)) {
        return rule.category;
      }
    }
  }

  return null;
}

// 判断是否是垃圾数据
function isGarbage(name: string): boolean {
  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(name)) {
      return true;
    }
  }
  return false;
}

// 标准化名称用于重复检测
function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/　/g, '')
    .replace(/・/g, '')
    .replace(/[（）()]/g, '')
    .toLowerCase();
}

async function main() {
  console.log('🧹 产品清洗和整理\n');
  console.log('配置:');
  console.log(`  URL: ${ODOO18_CONFIG.baseUrl}`);
  console.log(`  DB: ${ODOO18_CONFIG.db}\n`);

  try {
    // 1. 认证
    console.log('1. 正在认证...');
    const auth = await jsonRpc('/web/session/authenticate', {
      db: ODOO18_CONFIG.db,
      login: ODOO18_CONFIG.username,
      password: ODOO18_CONFIG.password,
    }) as Record<string, unknown>;

    if (!auth.uid) throw new Error('认证失败');
    console.log(`   ✅ 认证成功\n`);

    // 2. 创建分类结构
    console.log('2. 创建标准餐饮分类结构...');
    const categoryIds: Record<string, number> = {};

    async function buildCategories(structure: Record<string, unknown>, parentPath: string = '', parentId?: number) {
      for (const [name, children] of Object.entries(structure)) {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;

        // 检查是否存在
        const domain: unknown[] = [['name', '=', name]];
        if (parentId) domain.push(['parent_id', '=', parentId]);

        const existing = await jsonRpc('/web/dataset/call_kw', {
          model: 'product.category',
          method: 'search_read',
          args: [domain],
          kwargs: { fields: ['id'], limit: 1 },
        }) as Array<{ id: number }>;

        let categoryId: number;
        if (existing.length > 0) {
          categoryId = existing[0].id;
          console.log(`   ✓ ${fullPath} (已存在 ID:${categoryId})`);
        } else {
          const values: Record<string, unknown> = { name };
          if (parentId) values.parent_id = parentId;
          categoryId = await jsonRpc('/web/dataset/call_kw', {
            model: 'product.category',
            method: 'create',
            args: [values],
            kwargs: {},
          }) as number;
          console.log(`   + ${fullPath} (新建 ID:${categoryId})`);
        }

        categoryIds[fullPath] = categoryId;

        if (children && typeof children === 'object') {
          await buildCategories(children as Record<string, unknown>, fullPath, categoryId);
        }
      }
    }

    await buildCategories(CATEGORY_STRUCTURE);
    console.log(`   共 ${Object.keys(categoryIds).length} 个分类\n`);

    // 3. 获取所有产品
    console.log('3. 获取所有产品...');
    const products = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.template',
      method: 'search_read',
      args: [[]],
      kwargs: { fields: ['id', 'name', 'categ_id', 'list_price', 'active', 'default_code'], limit: 2000 },
    }) as Product[];
    console.log(`   共 ${products.length} 个产品\n`);

    // 4. 清理垃圾数据
    console.log('4. 清理垃圾数据...');
    const garbageProducts = products.filter(p => isGarbage(p.name));
    console.log(`   发现 ${garbageProducts.length} 个垃圾数据:`);

    for (const p of garbageProducts) {
      try {
        await jsonRpc('/web/dataset/call_kw', {
          model: 'product.template',
          method: 'unlink',
          args: [[p.id]],
          kwargs: {},
        });
        console.log(`   🗑️ 删除: "${p.name}" (ID:${p.id})`);
      } catch (e) {
        console.log(`   ⚠️ 无法删除: "${p.name}" (ID:${p.id})`);
      }
    }

    // 5. 处理重复产品
    console.log('\n5. 处理重复产品...');
    const validProducts = products.filter(p => !isGarbage(p.name));
    const nameGroups: Record<string, Product[]> = {};

    for (const p of validProducts) {
      const normalized = normalizeName(p.name);
      if (!nameGroups[normalized]) nameGroups[normalized] = [];
      nameGroups[normalized].push(p);
    }

    const duplicateGroups = Object.entries(nameGroups).filter(([_, group]) => group.length > 1);
    console.log(`   发现 ${duplicateGroups.length} 组重复`);

    for (const [_, group] of duplicateGroups) {
      // 保留价格最高的，如果价格相同则保留 ID 最小的
      group.sort((a, b) => {
        if (b.list_price !== a.list_price) return b.list_price - a.list_price;
        return a.id - b.id;
      });

      const keep = group[0];
      const toDelete = group.slice(1);

      for (const p of toDelete) {
        try {
          await jsonRpc('/web/dataset/call_kw', {
            model: 'product.template',
            method: 'unlink',
            args: [[p.id]],
            kwargs: {},
          });
          console.log(`   🗑️ 删除重复: "${p.name}" (ID:${p.id}) → 保留 ID:${keep.id}`);
        } catch (e) {
          // 如果无法删除，尝试归档
          try {
            await jsonRpc('/web/dataset/call_kw', {
              model: 'product.template',
              method: 'write',
              args: [[p.id], { active: false }],
              kwargs: {},
            });
            console.log(`   📦 归档重复: "${p.name}" (ID:${p.id})`);
          } catch (e2) {
            console.log(`   ⚠️ 无法处理: "${p.name}" (ID:${p.id})`);
          }
        }
      }
    }

    // 6. 重新分类产品
    console.log('\n6. 重新分类产品...');

    // 重新获取产品列表（排除已删除的）
    const remainingProducts = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.template',
      method: 'search_read',
      args: [[['active', '=', true]]],
      kwargs: { fields: ['id', 'name', 'categ_id', 'list_price'], limit: 2000 },
    }) as Product[];

    let recategorized = 0;
    let skipped = 0;

    for (const p of remainingProducts) {
      const targetCategory = categorizeProduct(p);

      if (targetCategory && categoryIds[targetCategory]) {
        const targetCategoryId = categoryIds[targetCategory];
        const currentCategoryId = p.categ_id ? p.categ_id[0] : null;

        if (currentCategoryId !== targetCategoryId) {
          try {
            await jsonRpc('/web/dataset/call_kw', {
              model: 'product.template',
              method: 'write',
              args: [[p.id], { categ_id: targetCategoryId }],
              kwargs: {},
            });
            recategorized++;
            console.log(`   📂 ${p.name} → ${targetCategory}`);
          } catch (e) {
            skipped++;
          }
        }
      }
    }

    console.log(`   重新分类: ${recategorized} 个`);
    console.log(`   跳过: ${skipped} 个`);

    // 7. 统计结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 清洗结果');
    console.log('='.repeat(60));
    console.log(`  原始产品数: ${products.length}`);
    console.log(`  删除垃圾数据: ${garbageProducts.length}`);
    console.log(`  删除/归档重复: ${duplicateGroups.reduce((sum, [_, g]) => sum + g.length - 1, 0)}`);
    console.log(`  重新分类: ${recategorized}`);
    console.log(`  剩余产品数: ${remainingProducts.length - garbageProducts.length}`);

    console.log('\n✅ 产品清洗完成!');
    console.log(`\n访问: ${ODOO18_CONFIG.baseUrl}/web#model=product.template&view_type=list`);

  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

main();
