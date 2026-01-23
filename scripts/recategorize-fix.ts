/**
 * 修复版 - 重新分类所有产品到标准餐饮分类
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://testodoo.seisei.tokyo',
  db: 'test001',
  username: 'test',
  password: 'test',
};

// 分类规则
const CATEGORIZATION_RULES: Array<{ keywords: string[]; categoryName: string; priority: number }> = [
  // 啤酒
  { keywords: ['生ビール', 'ビール樽', 'スーパードライ', 'プレミアムモルツ', 'ラガー', 'オールフリー', 'Draft Beer', 'Lager', '生啤', '啤酒'], categoryName: 'ビール・発泡酒', priority: 10 },
  // 威士忌
  { keywords: ['ウィスキー', 'ウイスキー', '角', 'トリス', 'ビーム', '知多', 'Whisky', 'Whiskey', 'Jim Beam', 'Kakubin', '威士忌'], categoryName: 'ウィスキー', priority: 10 },
  // 烧酎
  { keywords: ['焼酎', '焼酒', '神ノ河', '黒霧島', '二階堂', 'れんと', '鍛高譚', '茉莉花', 'まつりか', 'Shochu', '烧酎', '甲20', '甲25', '乙20', '乙25', '宝山', '聖酒造', '酒次郎'], categoryName: '焼酎', priority: 10 },
  // 日本酒
  { keywords: ['純米', '大吟醸', '本醸造', '八海山', '久保田', '獺祭', '鍋島', '浦霞', 'Sake', 'Junmai', 'Daiginjo', '清酒'], categoryName: '日本酒', priority: 10 },
  // 葡萄酒
  { keywords: ['ワイン', 'ロスカロス', 'Wine', 'カロス'], categoryName: 'ワイン', priority: 10 },
  // 利口酒
  { keywords: ['リキュール', '梅酒', 'カシス', 'ピーチ', 'プログレ', 'レモンサワーの素', 'Liqueur', 'Plum Wine', '果味酒', '酸味酒'], categoryName: 'リキュール・梅酒', priority: 10 },
  // 软饮料
  { keywords: ['ホッピ', 'ひげ茶', 'Hoppy', 'Tea', 'レッドブル', 'Red Bull', 'エナジー'], categoryName: 'ソフトドリンク', priority: 9 },
  // 糖浆
  { keywords: ['シロップ', 'Syrup', 'コーラ', 'Cola', 'ジンジャー', 'Ginger', '男梅', '原液', 'ベース', 'Base'], categoryName: 'シロップ・ベース', priority: 9 },
  // 果汁
  { keywords: ['ジュース', 'オレンジ', 'カルピス', 'Juice', 'Orange', 'Calpis', 'ミニッツメイド', 'Minute Maid', 'オレンジェード'], categoryName: 'ジュース', priority: 8 },
  // 蔬菜
  { keywords: ['キャベツ', 'レタス', 'ネギ', 'ねぎ', '大根', '白菜', 'トマト', 'パプリカ', '人参', 'にら', '水菜', 'もやし', '胡瓜', 'きゅうり', '茄子', 'Cabbage', 'Lettuce', 'Onion', 'Tomato', 'Carrot', 'Cucumber', 'Eggplant', '玉葱', '小松菜', '黄瓜', '卷心菜', '生菜', '萝卜', '豆芽', '韭菜', '芦笋', '青椒', '葱', 'Chives', 'Daikon', 'Radish', 'Bean Sprouts', 'Mizuna', 'Komatsuna', '昆布', '木鱼花', '海苔', '泡菜', '腌', '毛豆'], categoryName: '野菜', priority: 8 },
  // 水果
  { keywords: ['レモン', 'キウイ', 'Lemon', 'Grapefruit', 'Kiwi', '柠檬', '葡萄柚', '奇异果', 'Gold Kiwi'], categoryName: '果物', priority: 7 },
  // 豆腐
  { keywords: ['豆腐', 'Tofu', '木綿', '绢', '納豆', '纳豆', '竹轮'], categoryName: '豆腐・豆製品', priority: 8 },
  // 蛋
  { keywords: ['玉子', '卵', 'Egg', '鸡蛋', '鹌鹑蛋', '温泉蛋', '奶酪', '蛋黄酱', 'チーズ', 'マヨネーズ'], categoryName: '乳製品・卵', priority: 8 },
  // 干货
  { keywords: ['笹', '竹叶', 'Bamboo', '干', '乾'], categoryName: '乾物', priority: 7 },
  // 肉类
  { keywords: ['牛肉', '猪肉', '鸡肉', '羊肉', '和牛', '牛舌', '五花肉', '叉烧', '培根', '鸡腿', '鸡翅', '鸡心', '鸡皮', '鸡肝', '鸡胗', '鸡软骨', '内脏', '牛筋', '牛肚', '猪大肠', '猪颊肉', '肉丸', '鸡'], categoryName: '肉類', priority: 8 },
  // 海鲜
  { keywords: ['三文鱼', '金枪鱼', '鱼', '虾', '蟹', '贝', '章鱼', '鱿鱼', '海胆', '明太子', '鱼子', '银鱼', '沙丁鱼', '竹荚鱼', '比目鱼', '柳叶鱼', '甜虾', '樱花虾', '帝王蟹', '松叶蟹', '扇贝', '牡蛎', '蛤蜊', '北寄贝', '赤贝', '蟹棒', '刺身'], categoryName: '海鮮', priority: 8 },
  // 调味料
  { keywords: ['醤油', '味噌', '味醂', '料酒', 'みりん', '酱油', '醋', '出汁', '高汤', '柚子醋', '烤串酱', '烤肉酱', '豚骨汤', '酱'], categoryName: 'ソース・タレ', priority: 7 },
  { keywords: ['七味', '大蒜', '柚子胡椒', '生姜', '芥末', 'わさび', '胡椒', '辛'], categoryName: '香辛料', priority: 7 },
  { keywords: ['油', '猪油', '芝麻油', '黄油', 'バター', 'ごま油'], categoryName: '油脂', priority: 7 },
  // 主食
  { keywords: ['米', '大米', '寿司饭', 'ご飯', 'ライス'], categoryName: '米', priority: 7 },
  { keywords: ['麺', '面', 'うどん', 'そば', 'ラーメン', '乌冬', '荞麦', '拉面', '面条', '冷面', '冷麺'], categoryName: '麺類', priority: 7 },
  { keywords: ['パン', '粉', '天妇罗粉', '面包糠', '饺子皮', '小麦粉'], categoryName: 'パン・粉類', priority: 7 },
  // 消耗品
  { keywords: ['ガス', '炭酸', 'Gas', 'CO2', '二氧化碳'], categoryName: 'ガス・炭酸', priority: 9 },
  { keywords: ['猪口', 'グラス', 'マドラ', 'ディスペンサー', 'スポンジ', 'Glass', 'Muddler', 'Dispenser', 'Sponge', '清酒杯', '搅拌棒', '海绵', '杯'], categoryName: '備品', priority: 9 },
  // 饮品原料 -> 利口酒
  { keywords: ['威士忌苏打', '酸味酒基', '生啤'], categoryName: 'リキュール・梅酒', priority: 6 },
];

interface Product {
  id: number;
  name: string;
  categ_id: [number, string] | false;
  list_price: number;
}

interface Category {
  id: number;
  name: string;
  complete_name: string;
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

function categorizeProduct(product: Product): string | null {
  const name = product.name;
  let bestMatch: { categoryName: string; priority: number } | null = null;

  for (const rule of CATEGORIZATION_RULES) {
    for (const keyword of rule.keywords) {
      if (name.includes(keyword)) {
        if (!bestMatch || rule.priority > bestMatch.priority) {
          bestMatch = { categoryName: rule.categoryName, priority: rule.priority };
        }
        break;
      }
    }
  }

  return bestMatch ? bestMatch.categoryName : null;
}

async function main() {
  console.log('🔄 重新分类所有产品 (修复版)\n');

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

    // 2. 获取所有 "仕入品" 下的分类
    console.log('2. 获取仕入品分类...');
    const categories = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.category',
      method: 'search_read',
      args: [[['complete_name', 'like', '仕入品']]],
      kwargs: { fields: ['id', 'name', 'complete_name'], limit: 100 },
    }) as Category[];

    // 按名称创建映射
    const categoryByName: Record<string, number> = {};
    for (const cat of categories) {
      categoryByName[cat.name] = cat.id;
      console.log(`   ${cat.name}: ID ${cat.id}`);
    }
    console.log(`   共 ${categories.length} 个仕入品子分类\n`);

    // 3. 获取需要重新分类的产品
    console.log('3. 获取需要重新分类的产品...');

    // 获取不在仕入品分类下的产品
    const allProducts = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.template',
      method: 'search_read',
      args: [[['active', '=', true]]],
      kwargs: { fields: ['id', 'name', 'categ_id', 'list_price'], limit: 2000 },
    }) as Product[];

    const needsRecategorization = allProducts.filter(p => {
      if (!p.categ_id) return true;
      const catName = p.categ_id[1];
      // 不在仕入品分类下的产品需要重新分类
      return !catName.includes('仕入品');
    });

    console.log(`   总产品数: ${allProducts.length}`);
    console.log(`   需要重新分类: ${needsRecategorization.length}\n`);

    // 4. 重新分类
    console.log('4. 开始重新分类...\n');

    let recategorized = 0;
    let skipped = 0;
    let noMatch = 0;
    const results: Record<string, number> = {};

    for (const p of needsRecategorization) {
      const targetCategoryName = categorizeProduct(p);

      if (targetCategoryName && categoryByName[targetCategoryName]) {
        const targetCategoryId = categoryByName[targetCategoryName];

        try {
          await jsonRpc('/web/dataset/call_kw', {
            model: 'product.template',
            method: 'write',
            args: [[p.id], { categ_id: targetCategoryId }],
            kwargs: {},
          });

          recategorized++;
          results[targetCategoryName] = (results[targetCategoryName] || 0) + 1;

          const oldCat = p.categ_id ? p.categ_id[1] : '未分类';
          console.log(`   ✅ "${p.name}" → ${targetCategoryName}`);
        } catch (e) {
          skipped++;
        }
      } else if (targetCategoryName) {
        // 分类名存在但ID不存在
        skipped++;
        if (skipped <= 5) {
          console.log(`   ⚠️ 分类不存在: ${targetCategoryName} (产品: ${p.name})`);
        }
      } else {
        noMatch++;
        if (noMatch <= 10) {
          console.log(`   ❓ 无法分类: "${p.name}"`);
        }
      }
    }

    // 5. 结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 分类结果');
    console.log('='.repeat(60));
    console.log(`成功分类: ${recategorized}`);
    console.log(`跳过: ${skipped}`);
    console.log(`无法匹配: ${noMatch}`);

    console.log('\n各分类新增:');
    Object.entries(results)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: +${count}`);
      });

    // 6. 最终统计
    console.log('\n' + '='.repeat(60));
    console.log('📈 最终分布');
    console.log('='.repeat(60));

    const finalProducts = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.template',
      method: 'search_read',
      args: [[['active', '=', true]]],
      kwargs: { fields: ['id', 'categ_id'], limit: 2000 },
    }) as Array<{ id: number; categ_id: [number, string] | false }>;

    const finalByCategory: Record<string, number> = {};
    for (const p of finalProducts) {
      const catName = p.categ_id ? p.categ_id[1] : '未分类';
      finalByCategory[catName] = (finalByCategory[catName] || 0) + 1;
    }

    // 显示仕入品分类
    console.log('\n【仕入品分类】');
    Object.entries(finalByCategory)
      .filter(([cat]) => cat.includes('仕入品'))
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
      .forEach(([cat, count]) => {
        const shortName = cat.split(' / ').pop();
        console.log(`  ${shortName}: ${count}`);
      });

    // 显示其他分类
    const otherCategories = Object.entries(finalByCategory)
      .filter(([cat]) => !cat.includes('仕入品'))
      .sort((a, b) => b[1] - a[1]);

    if (otherCategories.length > 0) {
      console.log('\n【其他分类（待整理）】');
      otherCategories.forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
    }

    console.log('\n✅ 完成!');

  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

main();
