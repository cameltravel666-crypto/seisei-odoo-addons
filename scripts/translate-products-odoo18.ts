/**
 * 产品多语言化 - 日/中/英 三语翻译
 * 为 Odoo 18 test001 数据库中的产品添加翻译
 *
 * 使用方法:
 * cd "/Users/taozhang/Projects/Seisei ERP" && npx tsx scripts/translate-products-odoo18.ts
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://testodoo.seisei.tokyo',
  db: 'test001',
  username: 'test',
  password: 'test',
};

// 翻译映射表: 日文 -> { 中文, 英文 }
const TRANSLATIONS: Record<string, { zh: string; en: string }> = {
  // ===== 蔬菜类 =====
  '胡瓜A': { zh: '黄瓜A', en: 'Cucumber A' },
  '小ネギ': { zh: '小葱', en: 'Green Onion' },
  'サニーレタス': { zh: '生菜', en: 'Sunny Lettuce' },
  '木綿豆腐（丁）': { zh: '木棉豆腐（块）', en: 'Cotton Tofu (piece)' },
  '成田もやし': { zh: '成田豆芽', en: 'Narita Bean Sprouts' },
  '大根3L': { zh: '白萝卜3L', en: 'Daikon Radish 3L' },
  '大根3L（6本入）': { zh: '白萝卜3L（6根装）', en: 'Daikon Radish 3L (6pcs)' },
  'キャベツ（大）': { zh: '卷心菜（大）', en: 'Cabbage (Large)' },
  'キャベツ6〜10人': { zh: '卷心菜6-10人份', en: 'Cabbage 6-10 servings' },
  '真空玉葱': { zh: '真空洋葱', en: 'Vacuum Packed Onion' },
  '長ねぎL': { zh: '大葱L', en: 'Long Green Onion L' },
  '長ねぎ太H 中国産': { zh: '粗大葱H 中国产', en: 'Thick Long Onion H (China)' },
  '紫玉葱大': { zh: '紫洋葱大', en: 'Purple Onion (Large)' },
  '白菜大': { zh: '大白菜', en: 'Chinese Cabbage (Large)' },
  '白菜': { zh: '白菜', en: 'Chinese Cabbage' },
  '白菜（箱）': { zh: '白菜（箱）', en: 'Chinese Cabbage (Box)' },
  'パプリカ赤': { zh: '红甜椒', en: 'Red Paprika' },
  'パプリカ黄': { zh: '黄甜椒', en: 'Yellow Paprika' },
  '人参（本）': { zh: '胡萝卜（根）', en: 'Carrot (piece)' },
  'トマトL': { zh: '番茄L', en: 'Tomato L' },
  'トマトLL': { zh: '番茄LL', en: 'Tomato LL' },
  'ミニトマト赤（パック）': { zh: '红色小番茄（盒）', en: 'Cherry Tomato Red (Pack)' },
  'にら': { zh: '韭菜', en: 'Chinese Chives' },
  '水菜': { zh: '水菜', en: 'Mizuna' },
  '小松菜（中束）': { zh: '小松菜（中把）', en: 'Komatsuna (Medium)' },
  'じゃが芋（3L）': { zh: '土豆（3L）', en: 'Potato (3L)' },
  '長茄子A': { zh: '长茄子A', en: 'Long Eggplant A' },

  // ===== 水果类 =====
  'レモン CL産 140s': { zh: '柠檬 CL产 140s', en: 'Lemon CL 140s' },
  'レモン USA産 140s': { zh: '柠檬 美国产 140s', en: 'Lemon USA 140s' },
  'グレープフルーツ': { zh: '葡萄柚', en: 'Grapefruit' },
  'ゴールドキウイ': { zh: '金色奇异果', en: 'Gold Kiwi' },

  // ===== 其他食材 =====
  '真空笹100枚': { zh: '真空竹叶100片', en: 'Vacuum Bamboo Leaves 100pcs' },
  '玉子 入荷激減': { zh: '鸡蛋 供应紧张', en: 'Eggs (Limited Supply)' },

  // ===== 酒类 - 啤酒 =====
  'サントリー 生ビール樽 20L': { zh: '三得利 生啤酒桶 20L', en: 'Suntory Draft Beer Keg 20L' },
  'アサヒ スーパードライ・中瓶・500ml': { zh: '朝日超爽・中瓶・500ml', en: 'Asahi Super Dry Medium 500ml' },
  'サントリー ザ・プレミアムモルツ・中瓶・500ml': { zh: '三得利 顶级麦芽・中瓶・500ml', en: 'Suntory Premium Malts Medium 500ml' },
  'サントリーオールフリー小瓶 334ml': { zh: '三得利无酒精啤酒 小瓶 334ml', en: 'Suntory All-Free Small 334ml' },
  'サッポロ ラガー 中瓶 500ml（赤★）': { zh: '札幌啤酒 中瓶 500ml（红星）', en: 'Sapporo Lager Medium 500ml (Red Star)' },

  // ===== 酒类 - 威士忌 =====
  'サントリー特製 角 業務用 5L': { zh: '三得利特制 角瓶 业务用 5L', en: 'Suntory Kakubin Commercial 5L' },
  'サントリー ウィスキー 知多 700ml': { zh: '三得利威士忌 知多 700ml', en: 'Suntory Whisky Chita 700ml' },
  'サントリートリス クラシック ウィスキー 4L': { zh: '三得利Tris经典威士忌 4L', en: 'Suntory Torys Classic Whisky 4L' },
  'ジム ビーム 業務用 4L': { zh: '金宾波本 业务用 4L', en: 'Jim Beam Commercial 4L' },

  // ===== 酒类 - 烧酎 =====
  '甲20° 聖酒造 酒次郎 4L': { zh: '甲类20° 圣酒造 酒次郎 4L', en: 'Shochu 20% Sei-Shuzo Sakejiro 4L' },
  'キッコー宮甲25° 亀甲宮焼酎 720ml': { zh: '龟甲宫甲类25° 烧酎 720ml', en: 'Kikkoman Shochu 25% 720ml' },
  '二階堂 麦 25% 900ml': { zh: '二阶堂 麦烧酎 25% 900ml', en: 'Nikaido Barley Shochu 25% 900ml' },
  '乙25° 麦 神ノ河 720ml': { zh: '乙类25° 麦 神之河 720ml', en: 'Kannoko Barley Shochu 25% 720ml' },
  '乙25° 本格焼酎 れんと 720ml': { zh: '乙类25° 本格烧酎 lento 720ml', en: 'Rento Authentic Shochu 25% 720ml' },
  '乙25° 黒霧島芋 720ml': { zh: '乙类25° 黑雾岛 芋烧酎 720ml', en: 'Kuro Kirishima Sweet Potato Shochu 720ml' },
  'ジャスミン焼酒茉莉花（まつりか）紙 1.8L': { zh: '茉莉花烧酎 纸盒 1.8L', en: 'Jasmine Shochu Matsurika 1.8L' },
  '富乃宝山 720ml': { zh: '富乃宝山 720ml', en: 'Tominohouzan 720ml' },
  '鍛高譚 しそ焼酎 720ml': { zh: '�的高�的 紫苏烧酎 720ml', en: 'Tantakatan Shiso Shochu 720ml' },

  // ===== 酒类 - 日本酒 =====
  '八海山1.8L（普）': { zh: '八海山 1.8L（普通）', en: 'Hakkaisan 1.8L (Regular)' },
  '久保田 千寿 1.8L': { zh: '久保田 千寿 1.8L', en: 'Kubota Senju 1.8L' },
  '獺祭（だっさい）純米大吟醸45 1.8L': { zh: '獭祭 纯米大吟酿45 1.8L', en: 'Dassai 45 Junmai Daiginjo 1.8L' },
  '鍋島 特別純米 1.8L': { zh: '�的岛 特别纯米 1.8L', en: 'Nabeshima Tokubetsu Junmai 1.8L' },
  '浦霞 本醸造 本仕込み 1.8L': { zh: '浦霞 本酿造 1.8L', en: 'Urakasumi Honjozo 1.8L' },

  // ===== 酒类 - 葡萄酒 =====
  'K ロスカロス 白 3L': { zh: 'K 洛斯卡洛斯 白葡萄酒 3L', en: 'K Los Carlos White Wine 3L' },
  'K ロスカロス 赤 3L': { zh: 'K 洛斯卡洛斯 红葡萄酒 3L', en: 'K Los Carlos Red Wine 3L' },

  // ===== 酒类 - 利口酒 =====
  'サントリープログレ カシスリキュール 1.8L (PET)': { zh: '三得利Progre 黑加仑利口酒 1.8L', en: 'Suntory Progre Cassis Liqueur 1.8L' },
  'サントリープログレ ピーチ 1.8L (PET)': { zh: '三得利Progre 桃子利口酒 1.8L', en: 'Suntory Progre Peach Liqueur 1.8L' },
  'SUこだわり酒場のレモンサワーの素 1.8L': { zh: 'SU讲究酒场 柠檬沙瓦调酒液 1.8L', en: 'SU Kodawari Lemon Sour Mix 1.8L' },
  'サントリー南梅酒しませんか 紙 2L': { zh: '三得利南梅酒 纸盒 2L', en: 'Suntory Plum Wine 2L' },

  // ===== 气体 =====
  'サッポロ 炭酸ガス 5kg': { zh: '札幌 二氧化碳气体 5kg', en: 'Sapporo CO2 Gas 5kg' },
  'アサヒ 樽用ガス 5kg': { zh: '朝日 桶用气体 5kg', en: 'Asahi Keg Gas 5kg' },

  // ===== 饮料・糖浆 (8%税率) =====
  '黒ホッピ 360ml': { zh: '黑Hoppy 360ml', en: 'Black Hoppy 360ml' },
  '白ホッピ 360ml': { zh: '白Hoppy 360ml', en: 'White Hoppy 360ml' },
  'トウモロコシのひげ茶1.5L': { zh: '玉米须茶 1.5L', en: 'Corn Silk Tea 1.5L' },
  'カルピス L パック 1L': { zh: '可尔必思 L装 1L', en: 'Calpis L Pack 1L' },
  '三田 オレンジェード 1L': { zh: '三田 橙汁饮料 1L', en: 'Mita Orangeade 1L' },
  '三田スタンダード・ザ・レモン 1L': { zh: '三田标准柠檬 1L', en: 'Mita Standard Lemon 1L' },
  '三田ブルーベリー エード 1L': { zh: '三田蓝莓饮料 1L', en: 'Mita Blueberry Ade 1L' },
  'スミダ コーラシロップ 1L': { zh: '隅田 可乐糖浆 1L', en: 'Sumida Cola Syrup 1L' },
  'スミダ 4xグレープフルーツ フルーツ 1L': { zh: '隅田 4倍葡萄柚糖浆 1L', en: 'Sumida 4x Grapefruit Syrup 1L' },
  'スミダ 酎ハイベースピーチ 1L': { zh: '隅田 烧酎调酒用桃子糖浆 1L', en: 'Sumida Chuhai Base Peach 1L' },
  'スミダ ジンジャーシロップ 1L': { zh: '隅田 姜汁糖浆 1L', en: 'Sumida Ginger Syrup 1L' },
  'PS 業務用 男梅シロップ 1L': { zh: 'PS 业务用 男梅糖浆 1L', en: 'PS Commercial Otoko-Ume Syrup 1L' },
  'コカ・コーラ 原液 シロサワーベース PET 1L': { zh: '可口可乐 原液 白沙瓦调酒基底 1L', en: 'Coca-Cola Shiro Sour Base 1L' },
  'ミニッツメイド業務用オレンジ 紙 1L': { zh: '美粒果 业务用橙汁 1L', en: 'Minute Maid Commercial Orange 1L' },

  // ===== 备品 =====
  'お猪口': { zh: '清酒杯', en: 'Sake Cup (Ochoko)' },
  'マドラ': { zh: '搅拌棒', en: 'Muddler' },
  'ディスペンサー 25ml': { zh: '定量器 25ml', en: 'Dispenser 25ml' },
  '一合グラス': { zh: '一合玻璃杯', en: 'Ichigo Glass (180ml)' },
  '二合グラス': { zh: '二合玻璃杯', en: 'Nigo Glass (360ml)' },
  'スポンジ': { zh: '海绵', en: 'Sponge' },

  // ===== 之前导入的饮料产品 =====
  'サントリー生ビール樽 20L': { zh: '三得利生啤酒桶 20L', en: 'Suntory Draft Beer Keg 20L' },
  'サントリーザ・プレミアムモルツ・中瓶・500ml': { zh: '三得利顶级麦芽中瓶500ml', en: 'Suntory Premium Malts 500ml' },
  'サントリーオールフリー小瓶 334ml': { zh: '三得利无酒精小瓶334ml', en: 'Suntory All-Free 334ml' },
  'サッポロ ラガー 中瓶 500ml （赤★）': { zh: '札幌啤酒中瓶500ml（红星）', en: 'Sapporo Lager 500ml (Red Star)' },
  '黒ホッピ360ml': { zh: '黑Hoppy 360ml', en: 'Black Hoppy 360ml' },
  '白ホッピ360ml': { zh: '白Hoppy 360ml', en: 'White Hoppy 360ml' },
  'トウモロコシのひげ茶1.5L': { zh: '玉米须茶1.5L', en: 'Corn Silk Tea 1.5L' },
  'サントリー南梅酒しませんか紙 2L': { zh: '三得利南梅酒纸盒2L', en: 'Suntory Plum Wine 2L' },
  '鍋島 特別純米 1.8L': { zh: '锅岛特别纯米1.8L', en: 'Nabeshima Tokubetsu Junmai 1.8L' },
  '乙25°麦神ノ河 720ml-2本次品です': { zh: '乙类25°麦神之河720ml-2瓶次品', en: 'Kannoko Barley 720ml-2pcs Defective' },
  'レッドブルエナジードリンク 250ml': { zh: '红牛能量饮料250ml', en: 'Red Bull Energy Drink 250ml' },
  'サントリー特製 角　業務用 5L': { zh: '三得利特制角瓶业务用5L', en: 'Suntory Kakubin Commercial 5L' },
  '甲20°聖酒造 酒次郎 4L': { zh: '甲类20°圣酒造酒次郎4L', en: 'Shochu 20% Sakejiro 4L' },
  'アサヒ 樽用ガス 5kg': { zh: '朝日桶用气体5kg', en: 'Asahi Keg Gas 5kg' },
  'K ロスカロス　赤 3L': { zh: 'K洛斯卡洛斯红葡萄酒3L', en: 'K Los Carlos Red Wine 3L' },
  '八海山1.8L（普）': { zh: '八海山1.8L（普通）', en: 'Hakkaisan 1.8L (Regular)' },
  'カルピス　L パック 1L': { zh: '可尔必思L装1L', en: 'Calpis L Pack 1L' },
  'スミダ4xグレーブフルーツ 1L': { zh: '隅田4倍葡萄柚1L', en: 'Sumida 4x Grapefruit 1L' },
  'スミダコーラシロップ 1L': { zh: '隅田可乐糖浆1L', en: 'Sumida Cola Syrup 1L' },
  'SUこだわり酒場のレモンサワーの素　1.8L': { zh: 'SU讲究酒场柠檬沙瓦调酒液1.8L', en: 'SU Kodawari Lemon Sour Mix 1.8L' },
  'サントリートリス クラシック ウィスキー 4L': { zh: '三得利Tris经典威士忌4L', en: 'Suntory Torys Classic Whisky 4L' },
  'ミニッツメイド業務用オレンジ 紙 1L': { zh: '美粒果业务用橙汁1L', en: 'Minute Maid Commercial Orange 1L' },
  '三田 オレンジェード1L': { zh: '三田橙汁饮料1L', en: 'Mita Orangeade 1L' },
  'ジム ビーム業務用 4L': { zh: '金宾波本业务用4L', en: 'Jim Beam Commercial 4L' },
  'スミダ  4xグレープフルーツ1L': { zh: '隅田4倍葡萄柚1L', en: 'Sumida 4x Grapefruit 1L' },
  'スミダ　コーラシロップ 1L': { zh: '隅田可乐糖浆1L', en: 'Sumida Cola Syrup 1L' },
  'PS 業務用 男梅シロップ　1L': { zh: 'PS业务用男梅糖浆1L', en: 'PS Commercial Otoko-Ume Syrup 1L' },
  'SUこだわり酒場のレモンサワーの素 1.8L': { zh: 'SU讲究酒场柠檬沙瓦调酒液1.8L', en: 'SU Kodawari Lemon Sour Mix 1.8L' },
  '甲20°聖酒造 酒郎 4L': { zh: '甲类20°圣酒造酒次郎4L', en: 'Shochu 20% Sakejiro 4L' },
  'カルビス　Lパック 1L': { zh: '可尔必思L装1L', en: 'Calpis L Pack 1L' },
  '三田スタンダード・ザ・レモン 1L': { zh: '三田标准柠檬1L', en: 'Mita Standard Lemon 1L' },
  '三田 オレンジェード 1L': { zh: '三田橙汁饮料1L', en: 'Mita Orangeade 1L' },
  'サントリープログレ　カシスリキュール 1. 8L （PET）': { zh: '三得利Progre黑加仑利口酒1.8L', en: 'Suntory Progre Cassis Liqueur 1.8L' },
  'アサヒ　スーパードライ・中瓶・500ml': { zh: '朝日超爽中瓶500ml', en: 'Asahi Super Dry 500ml' },
  'サントリーザ・プレミアムモルツ・中瓶・500ml': { zh: '三得利顶级麦芽中瓶500ml', en: 'Suntory Premium Malts 500ml' },
  '乙25°麦神ノ河 720ml': { zh: '乙类25°麦神之河720ml', en: 'Kannoko Barley Shochu 720ml' },
  'サントリートリス': { zh: '三得利Tris', en: 'Suntory Torys' },
  'クラシック　ウィスキー 4L': { zh: '经典威士忌4L', en: 'Classic Whisky 4L' },
  '乙25° 本格焼酒 れんと 720ml': { zh: '乙类25°本格烧酎lento 720ml', en: 'Rento Authentic Shochu 720ml' },
  '鍛高譚 しそ焼酎 720ml': { zh: '锻高谭紫苏烧酎720ml', en: 'Tantakatan Shiso Shochu 720ml' },
  '浦霞 本醸造 本仕込み 1.8L': { zh: '浦霞本酿造1.8L', en: 'Urakasumi Honjozo 1.8L' },
  '獺祭（だっさい）純米大吟醸45 1.8L': { zh: '獭祭纯米大吟酿45 1.8L', en: 'Dassai 45 Junmai Daiginjo 1.8L' },
  'ジャスミン焼酒茉莉花（まつりか）紙 1. 8L': { zh: '茉莉花烧酎纸盒1.8L', en: 'Jasmine Shochu Matsurika 1.8L' },
  'アサヒスーハードライ・中瓶・500ml': { zh: '朝日超爽中瓶500ml', en: 'Asahi Super Dry 500ml' },
  'ラントリー特製 角業務用 5L': { zh: '三得利特制角瓶业务用5L', en: 'Suntory Kakubin Commercial 5L' },
  'サッポロ 炭酸ガス 5kg': { zh: '札幌二氧化碳气体5kg', en: 'Sapporo CO2 Gas 5kg' },
  'キッコー宮甲25°亀甲宮焼酒 720ml': { zh: '龟甲宫甲类25°烧酎720ml', en: 'Kikkoman Shochu 25% 720ml' },
  'Kロスカロス 白 3L': { zh: 'K洛斯卡洛斯白葡萄酒3L', en: 'K Los Carlos White Wine 3L' },
  '久保田 千寿 1.8L': { zh: '久保田千寿1.8L', en: 'Kubota Senju 1.8L' },
  'サントリープログレピーチ 1.8L （PET）': { zh: '三得利Progre桃子利口酒1.8L', en: 'Suntory Progre Peach Liqueur 1.8L' },
  '二階堂 麦 25% 900ml': { zh: '二阶堂麦烧酎25% 900ml', en: 'Nikaido Barley Shochu 900ml' },
  '富乃宝山　720ml': { zh: '富乃宝山720ml', en: 'Tominohouzan 720ml' },
  '富乃宝山 720ml': { zh: '富乃宝山720ml', en: 'Tominohouzan 720ml' },
  'サントリー ウィスキー 知多 700ml': { zh: '三得利威士忌知多700ml', en: 'Suntory Whisky Chita 700ml' },
  'マドラ': { zh: '搅拌棒', en: 'Muddler' },
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

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/session_id=([^;]+)/);
    if (match) {
      globalSessionId = match[1];
    }
  }

  return data.result;
}

async function main() {
  console.log('🌐 产品多语言化 - 日/中/英 三语翻译\n');
  console.log('配置:');
  console.log(`  URL: ${ODOO18_CONFIG.baseUrl}`);
  console.log(`  DB: ${ODOO18_CONFIG.db}`);
  console.log(`  翻译条目: ${Object.keys(TRANSLATIONS).length}\n`);

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

    // 2. 获取所有产品
    console.log('2. 获取产品列表...');
    const products = await jsonRpc('/web/dataset/call_kw', {
      model: 'product.template',
      method: 'search_read',
      args: [[]],
      kwargs: {
        fields: ['id', 'name'],
        limit: 2000,
      },
    }) as Array<{ id: number; name: string }>;

    console.log(`   找到 ${products.length} 个产品\n`);

    // 3. 检查已安装的语言
    console.log('3. 检查已安装语言...');
    const languages = await jsonRpc('/web/dataset/call_kw', {
      model: 'res.lang',
      method: 'search_read',
      args: [[['active', '=', true]]],
      kwargs: {
        fields: ['code', 'name'],
      },
    }) as Array<{ code: string; name: string }>;

    console.log('   已安装语言:');
    languages.forEach(l => console.log(`   - ${l.code}: ${l.name}`));

    const installedLangs = new Set(languages.map(l => l.code));
    const needLangs = ['zh_CN', 'en_US'];
    const missingLangs = needLangs.filter(l => !installedLangs.has(l));

    if (missingLangs.length > 0) {
      console.log(`\n   ⚠️ 需要安装语言: ${missingLangs.join(', ')}`);
      console.log('   正在安装...');

      for (const langCode of missingLangs) {
        try {
          // 查找语言记录
          const langRecords = await jsonRpc('/web/dataset/call_kw', {
            model: 'res.lang',
            method: 'search_read',
            args: [[['code', '=', langCode]]],
            kwargs: { fields: ['id'], limit: 1 },
          }) as Array<{ id: number }>;

          if (langRecords.length > 0) {
            // 激活语言
            await jsonRpc('/web/dataset/call_kw', {
              model: 'res.lang',
              method: 'write',
              args: [[langRecords[0].id], { active: true }],
              kwargs: {},
            });
            console.log(`   ✅ 已激活: ${langCode}`);
          } else {
            // 加载语言
            await jsonRpc('/web/dataset/call_kw', {
              model: 'base.language.install',
              method: 'create',
              args: [{ lang_ids: [[0, 0, { code: langCode }]] }],
              kwargs: {},
            });
            console.log(`   ✅ 已安装: ${langCode}`);
          }
        } catch (e) {
          console.log(`   ⚠️ 语言 ${langCode} 安装失败，继续...`);
        }
      }
    }

    // 4. 应用翻译
    console.log('\n4. 应用翻译...');
    let translated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const product of products) {
      const translation = TRANSLATIONS[product.name];

      if (!translation) {
        // 尝试模糊匹配
        const normalizedName = product.name.replace(/\s+/g, '').replace(/　/g, '');
        const fuzzyMatch = Object.entries(TRANSLATIONS).find(([key]) =>
          key.replace(/\s+/g, '').replace(/　/g, '') === normalizedName
        );

        if (fuzzyMatch) {
          const [, trans] = fuzzyMatch;
          try {
            // 写入中文翻译
            await jsonRpc('/web/dataset/call_kw', {
              model: 'product.template',
              method: 'with_context',
              args: [{ lang: 'zh_CN' }],
              kwargs: {},
            });

            await jsonRpc('/web/dataset/call_kw', {
              model: 'product.template',
              method: 'write',
              args: [[product.id], { name: trans.zh }],
              kwargs: { context: { lang: 'zh_CN' } },
            });

            // 写入英文翻译
            await jsonRpc('/web/dataset/call_kw', {
              model: 'product.template',
              method: 'write',
              args: [[product.id], { name: trans.en }],
              kwargs: { context: { lang: 'en_US' } },
            });

            translated++;
            console.log(`   ✅ ${product.name}`);
            console.log(`      中: ${trans.zh}`);
            console.log(`      英: ${trans.en}`);
          } catch (e) {
            skipped++;
          }
        } else {
          notFound++;
        }
        continue;
      }

      try {
        // 写入中文翻译
        await jsonRpc('/web/dataset/call_kw', {
          model: 'product.template',
          method: 'write',
          args: [[product.id], { name: translation.zh }],
          kwargs: { context: { lang: 'zh_CN' } },
        });

        // 写入英文翻译
        await jsonRpc('/web/dataset/call_kw', {
          model: 'product.template',
          method: 'write',
          args: [[product.id], { name: translation.en }],
          kwargs: { context: { lang: 'en_US' } },
        });

        translated++;
        console.log(`   ✅ ${product.name}`);
        console.log(`      中: ${translation.zh}`);
        console.log(`      英: ${translation.en}`);
      } catch (e) {
        skipped++;
        console.log(`   ⚠️ 跳过: ${product.name}`);
      }
    }

    // 5. 总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 翻译结果');
    console.log('='.repeat(60));
    console.log(`  总产品数: ${products.length}`);
    console.log(`  已翻译: ${translated}`);
    console.log(`  跳过: ${skipped}`);
    console.log(`  无翻译: ${notFound}`);
    console.log('\n✅ 多语言化完成!');
    console.log('\n切换语言查看:');
    console.log(`  中文: ${ODOO18_CONFIG.baseUrl}/web?lang=zh_CN#model=product.template`);
    console.log(`  英文: ${ODOO18_CONFIG.baseUrl}/web?lang=en_US#model=product.template`);
    console.log(`  日文: ${ODOO18_CONFIG.baseUrl}/web?lang=ja_JP#model=product.template`);

  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

main();
