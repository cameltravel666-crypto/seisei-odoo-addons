/**
 * 重新分类所有产品到标准餐饮分类
 * 将旧分类下的产品迁移到 "仕入品" 分类结构
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://testodoo.seisei.tokyo',
  db: 'test001',
  username: 'test',
  password: 'test',
};

// 扩展的分类规则
const CATEGORIZATION_RULES: Array<{ keywords: string[]; category: string; priority: number }> = [
  // ===== 酒類 =====
  // 啤酒 (高优先级)
  { keywords: ['生ビール', 'ビール樽', 'スーパードライ', 'プレミアムモルツ', 'ラガー', 'オールフリー', 'Draft Beer', 'Lager', '生啤', '啤酒'], category: '仕入品/酒類/ビール・発泡酒', priority: 10 },
  // 威士忌
  { keywords: ['ウィスキー', 'ウイスキー', '角', 'トリス', 'ビーム', '知多', 'Whisky', 'Whiskey', 'Jim Beam', 'Kakubin', '威士忌'], category: '仕入品/酒類/ウィスキー', priority: 10 },
  // 烧酎
  { keywords: ['焼酎', '焼酒', '神ノ河', '黒霧島', '二階堂', 'れんと', '鍛高譚', '茉莉花', 'まつりか', 'Shochu', '烧酎', '甲20', '甲25', '乙20', '乙25', '宝山', '聖酒造', '酒次郎'], category: '仕入品/酒類/焼酎', priority: 10 },
  // 日本酒
  { keywords: ['日本酒', '純米', '大吟醸', '本醸造', '八海山', '久保田', '獺祭', '鍋島', '浦霞', 'Sake', 'Junmai', 'Daiginjo', '清酒'], category: '仕入品/酒類/日本酒', priority: 10 },
  // 葡萄酒
  { keywords: ['ワイン', 'ロスカロス', 'Wine', 'カロス'], category: '仕入品/酒類/ワイン', priority: 10 },
  // 利口酒・梅酒
  { keywords: ['リキュール', '梅酒', 'カシス', 'ピーチ', 'プログレ', 'レモンサワーの素', 'Liqueur', 'Plum Wine', '果味酒', '酸味酒'], category: '仕入品/酒類/リキュール・梅酒', priority: 10 },

  // ===== 飲料・シロップ =====
  // 软饮料
  { keywords: ['ホッピ', 'ひげ茶', 'Hoppy', 'Tea', 'レッドブル', 'Red Bull', 'エナジー', '茶'], category: '仕入品/飲料・シロップ/ソフトドリンク', priority: 9 },
  // 糖浆
  { keywords: ['シロップ', 'ベース', 'Syrup', 'Base', 'コーラ', 'Cola', 'ジンジャー', 'Ginger', '男梅', '原液'], category: '仕入品/飲料・シロップ/シロップ・ベース', priority: 9 },
  // 果汁
  { keywords: ['ジュース', 'オレンジ', 'カルピス', 'Juice', 'Orange', 'Calpis', 'ミニッツメイド', 'Minute Maid', 'オレンジェード', 'グレープフルーツ', 'フルーツ'], category: '仕入品/飲料・シロップ/ジュース', priority: 8 },

  // ===== 食材 =====
  // 蔬菜 (高优先级匹配)
  { keywords: ['キャベツ', 'レタス', 'ネギ', 'ねぎ', '大根', '白菜', 'トマト', 'パプリカ', '人参', 'にら', '水菜', 'もやし', '胡瓜', 'きゅうり', '茄子', 'Cabbage', 'Lettuce', 'Onion', 'Tomato', 'Carrot', 'Cucumber', 'Eggplant', '玉葱', '小松菜', '黄瓜', '卷心菜', '生菜', '萝卜', '豆芽', '韭菜', '芦笋', '青椒', '葱', '蔬菜', '野菜', 'しそ', '茗荷', '大葱', '莲藕'], category: '仕入品/食材/野菜', priority: 8 },
  // 水果
  { keywords: ['レモン', 'キウイ', 'Lemon', 'Grapefruit', 'Kiwi', '柠檬', '葡萄柚', '奇异果', '果物', 'フルーツ'], category: '仕入品/食材/果物', priority: 7 },
  // 肉类
  { keywords: ['牛肉', '猪肉', '鸡肉', '羊肉', '和牛', '牛舌', '五花肉', '叉烧', '培根', '鸡腿', '鸡翅', '鸡心', '鸡皮', '鸡肝', '鸡胗', '鸡软骨', '内脏', '牛筋', '牛肚', '猪大肠', '猪颊肉', '肉'], category: '仕入品/食材/肉類', priority: 8 },
  // 海鲜
  { keywords: ['三文鱼', '金枪鱼', '鱼', '虾', '蟹', '贝', '章鱼', '鱿鱼', '海胆', '明太子', '鱼子', '银鱼', '沙丁鱼', '竹荚鱼', '比目鱼', '柳叶鱼', '甜虾', '樱花虾', '帝王蟹', '松叶蟹', '扇贝', '牡蛎', '蛤蜊', '北寄贝', '赤贝', '蟹棒', '海鲜', '刺身'], category: '仕入品/食材/海鮮', priority: 8 },
  // 豆腐
  { keywords: ['豆腐', 'Tofu', '木綿', '绢', '豆制品', '納豆', '纳豆', '毛豆', '竹轮'], category: '仕入品/食材/豆腐・豆製品', priority: 8 },
  // 蛋・乳制品
  { keywords: ['玉子', '卵', 'Egg', '鸡蛋', '鹌鹑蛋', '温泉蛋', '奶酪', '蛋黄酱', 'チーズ', 'マヨネーズ'], category: '仕入品/食材/乳製品・卵', priority: 8 },
  // 干货
  { keywords: ['笹', '竹叶', 'Bamboo', '昆布', '木鱼花', '海苔', '干', '乾'], category: '仕入品/食材/乾物', priority: 7 },

  // ===== 調味料 =====
  // 基本调味料
  { keywords: ['醤油', '塩', '砂糖', '酢', '味噌', '味醂', '料酒', 'みりん', '酱油', '盐', '糖', '醋'], category: '仕入品/調味料/基本調味料', priority: 7 },
  // 酱料
  { keywords: ['ソース', 'タレ', '出汁', '高汤', '柚子醋', '烤串酱', '烤肉酱', '豚骨汤', '酱料', '酱'], category: '仕入品/調味料/ソース・タレ', priority: 7 },
  // 香辛料
  { keywords: ['七味', '大蒜', '柚子胡椒', '生姜', '芥末', 'わさび', '胡椒', '香辛料', '辛'], category: '仕入品/調味料/香辛料', priority: 7 },
  // 油脂
  { keywords: ['油', '猪油', '芝麻油', '黄油', 'バター', 'ごま油', 'サラダ油'], category: '仕入品/調味料/油脂', priority: 7 },

  // ===== 主食 =====
  // 米
  { keywords: ['米', '大米', '寿司饭', 'ご飯', 'ライス'], category: '仕入品/主食/米', priority: 7 },
  // 面类
  { keywords: ['麺', '面', 'うどん', 'そば', 'ラーメン', '乌冬', '荞麦', '拉面', '面条'], category: '仕入品/主食/麺類', priority: 7 },
  // 面包粉类
  { keywords: ['パン', '粉', '天妇罗粉', '面包糠', '饺子皮', '小麦粉'], category: '仕入品/主食/パン・粉類', priority: 7 },

  // ===== 消耗品 =====
  // 气体
  { keywords: ['ガス', '炭酸', 'Gas', 'CO2', '二氧化碳'], category: '仕入品/消耗品/ガス・炭酸', priority: 9 },
  // 备品
  { keywords: ['猪口', 'グラス', 'マドラ', 'ディスペンサー', 'スポンジ', 'Glass', 'Muddler', 'Dispenser', 'Sponge', '清酒杯', '搅拌棒', '海绵', '备品', '杯', '碗', '皿'], category: '仕入品/消耗品/備品', priority: 9 },
  // 包装材料
  { keywords: ['包装', '袋', '盒', '容器', '箸', '筷子'], category: '仕入品/消耗品/包装材料', priority: 7 },
];

interface Product {
  id: number;
  name: string;
  categ_id: [number, string] | false;
  list_price: number;
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

// 判断产品应该属于哪个分类
function categorizeProduct(product: Product): string | null {
  const name = product.name;
  let bestMatch: { category: string; priority: number } | null = null;

  for (const rule of CATEGORIZATION_RULES) {
    for (const keyword of rule.keywords) {
      if (name.includes(keyword)) {
        if (!bestMatch || rule.priority > bestMatch.priority) {
          bestMatch = { category: rule.category, priority: rule.priority };
        }
        break;
      }
    }
  }

  return bestMatch ? bestMatch.category : null;
}

async function main() {
  console.log('🔄 重新分类所有产品\n');

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

    // 2. 获取分类映射
    console.log('2. 获取分类结构...');
    const categories = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.category',
      method: 'search_read',
      args: [[]],
      kwargs: { fields: ['id', 'name', 'complete_name'], limit: 200 },
    }) as Array<{ id: number; name: string; complete_name: string }>;

    const categoryMap: Record<string, number> = {};
    for (const cat of categories) {
      categoryMap[cat.complete_name] = cat.id;
      // 也用简化路径映射
      const simplePath = cat.complete_name.replace(/^All \/ /, '');
      categoryMap[simplePath] = cat.id;
    }
    console.log(`   找到 ${categories.length} 个分类\n`);

    // 3. 获取所有产品
    console.log('3. 获取所有产品...');
    const products = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.template',
      method: 'search_read',
      args: [[['active', '=', true]]],
      kwargs: { fields: ['id', 'name', 'categ_id', 'list_price'], limit: 2000 },
    }) as Product[];
    console.log(`   共 ${products.length} 个活跃产品\n`);

    // 4. 筛选需要重新分类的产品（不在 "仕入品" 下的）
    const needsRecategorization = products.filter(p => {
      if (!p.categ_id) return true;
      const catName = p.categ_id[1];
      return !catName.startsWith('仕入品');
    });
    console.log(`4. 需要重新分类: ${needsRecategorization.length} 个产品\n`);

    // 5. 重新分类
    console.log('5. 开始重新分类...\n');

    const results: Record<string, number> = {};
    let recategorized = 0;
    let skipped = 0;
    let noMatch = 0;

    for (const p of needsRecategorization) {
      const targetCategory = categorizeProduct(p);

      if (targetCategory) {
        const targetCategoryId = categoryMap[targetCategory];

        if (targetCategoryId) {
          try {
            await jsonRpc('/web/dataset/call_kw', {
              model: 'product.template',
              method: 'write',
              args: [[p.id], { categ_id: targetCategoryId }],
              kwargs: {},
            });
            recategorized++;
            results[targetCategory] = (results[targetCategory] || 0) + 1;

            const oldCat = p.categ_id ? p.categ_id[1] : '未分类';
            console.log(`   ✅ "${p.name}"`);
            console.log(`      ${oldCat} → ${targetCategory}`);
          } catch (e) {
            skipped++;
            console.log(`   ⚠️ 跳过: "${p.name}"`);
          }
        } else {
          skipped++;
          console.log(`   ⚠️ 分类不存在: ${targetCategory}`);
        }
      } else {
        noMatch++;
        // 对于无法自动分类的，显示信息
        if (noMatch <= 20) {
          console.log(`   ❓ 无法分类: "${p.name}" (${p.categ_id ? p.categ_id[1] : '未分类'})`);
        }
      }
    }

    // 6. 统计结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 重新分类结果');
    console.log('='.repeat(60));
    console.log(`\n需要处理: ${needsRecategorization.length}`);
    console.log(`成功分类: ${recategorized}`);
    console.log(`跳过: ${skipped}`);
    console.log(`无法匹配: ${noMatch}`);

    console.log('\n各分类统计:');
    Object.entries(results)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: +${count}`);
      });

    // 7. 显示最终分类统计
    console.log('\n' + '='.repeat(60));
    console.log('📈 最终分类分布');
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

    // 只显示 "仕入品" 开头的分类
    const shiireCategories = Object.entries(finalByCategory)
      .filter(([cat]) => cat.startsWith('仕入品'))
      .sort((a, b) => a[0].localeCompare(b[0]));

    console.log('\n【仕入品 分类】');
    for (const [cat, count] of shiireCategories) {
      const indent = (cat.match(/\//g) || []).length;
      const shortName = cat.split('/').pop();
      console.log('  '.repeat(indent) + `${shortName}: ${count}`);
    }

    const otherCategories = Object.entries(finalByCategory)
      .filter(([cat]) => !cat.startsWith('仕入品'))
      .sort((a, b) => b[1] - a[1]);

    if (otherCategories.length > 0) {
      console.log('\n【其他分类（待整理）】');
      for (const [cat, count] of otherCategories.slice(0, 10)) {
        console.log(`  ${cat}: ${count}`);
      }
    }

    console.log('\n✅ 重新分类完成!');

  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

main();
