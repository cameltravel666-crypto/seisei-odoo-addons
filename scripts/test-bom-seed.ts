import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { createOdooClient } from '../src/lib/odoo';

const RAW_MATERIALS = [
  { name: 'コーヒー豆 (エスプレッソ)', code: 'RAW-COFFEE-ESP', uomName: 'g' },
  { name: 'コーヒー豆 (ドリップ)', code: 'RAW-COFFEE-DRP', uomName: 'g' },
  { name: '抹茶パウダー', code: 'RAW-MATCHA', uomName: 'g' },
  { name: '紅茶葉', code: 'RAW-TEA', uomName: 'g' },
  { name: '牛乳', code: 'RAW-MILK', uomName: 'ml' },
  { name: 'オーツミルク', code: 'RAW-OAT-MILK', uomName: 'ml' },
  { name: 'ホイップクリーム', code: 'RAW-WHIP', uomName: 'g' },
  { name: '生クリーム', code: 'RAW-CREAM', uomName: 'ml' },
  { name: '砂糖', code: 'RAW-SUGAR', uomName: 'g' },
  { name: 'シロップ (バニラ)', code: 'RAW-SYRUP-VAN', uomName: 'ml' },
  { name: 'シロップ (キャラメル)', code: 'RAW-SYRUP-CAR', uomName: 'ml' },
  { name: 'チョコレートソース', code: 'RAW-CHOCO', uomName: 'ml' },
  { name: 'カップ (S)', code: 'RAW-CUP-S', uomName: 'Units' },
  { name: 'カップ (M)', code: 'RAW-CUP-M', uomName: 'Units' },
  { name: 'カップ (L)', code: 'RAW-CUP-L', uomName: 'Units' },
  { name: 'ストロー', code: 'RAW-STRAW', uomName: 'Units' },
  { name: '氷', code: 'RAW-ICE', uomName: 'g' },
  { name: 'パン (食パン)', code: 'RAW-BREAD', uomName: 'Units' },
  { name: 'バター', code: 'RAW-BUTTER', uomName: 'g' },
  { name: '小麦粉', code: 'RAW-FLOUR', uomName: 'g' },
  { name: '卵', code: 'RAW-EGG', uomName: 'Units' },
  { name: 'ハム', code: 'RAW-HAM', uomName: 'g' },
  { name: 'チーズ', code: 'RAW-CHEESE', uomName: 'g' },
  { name: 'サーモン', code: 'RAW-SALMON', uomName: 'g' },
  { name: '魚', code: 'RAW-FISH', uomName: 'g' },
  { name: 'レタス', code: 'RAW-LETTUCE', uomName: 'g' },
  { name: 'トマト', code: 'RAW-TOMATO', uomName: 'g' },
  { name: 'サラダミックス', code: 'RAW-SALAD', uomName: 'g' },
  { name: 'フルーツミックス', code: 'RAW-FRUIT', uomName: 'g' },
  { name: 'ご飯', code: 'RAW-RICE', uomName: 'g' },
  { name: 'たれ・ソース', code: 'RAW-SAUCE', uomName: 'ml' },
  { name: 'カレールー', code: 'RAW-CURRY', uomName: 'g' },
  { name: '麺 (ラーメン)', code: 'RAW-NOODLE', uomName: 'g' },
  { name: 'うどん', code: 'RAW-UDON', uomName: 'g' },
  { name: 'そば', code: 'RAW-SOBA', uomName: 'g' },
  { name: 'だし汁', code: 'RAW-SOUP', uomName: 'ml' },
  { name: '味噌汁', code: 'RAW-MISO', uomName: 'ml' },
  { name: 'アイスクリーム', code: 'RAW-ICECREAM', uomName: 'g' },
  { name: '調理材料A', code: 'RAW-GENERIC-A', uomName: 'g' },
  { name: '調理材料B', code: 'RAW-GENERIC-B', uomName: 'g' },
  { name: '包装材', code: 'RAW-PACKAGING', uomName: 'Units' },
];

const BOM_RECIPES: Record<string, Array<{ code: string; qty: number }>> = {
  'エスプレッソ': [{ code: 'RAW-COFFEE-ESP', qty: 18 }, { code: 'RAW-CUP-S', qty: 1 }],
  'アメリカーノ': [{ code: 'RAW-COFFEE-ESP', qty: 18 }, { code: 'RAW-CUP-M', qty: 1 }],
  'カフェラテ': [{ code: 'RAW-COFFEE-ESP', qty: 18 }, { code: 'RAW-MILK', qty: 200 }, { code: 'RAW-CUP-M', qty: 1 }],
  'ラテ': [{ code: 'RAW-COFFEE-ESP', qty: 18 }, { code: 'RAW-MILK', qty: 200 }, { code: 'RAW-CUP-M', qty: 1 }],
  'カプチーノ': [{ code: 'RAW-COFFEE-ESP', qty: 18 }, { code: 'RAW-MILK', qty: 150 }, { code: 'RAW-CUP-M', qty: 1 }],
  'モカ': [{ code: 'RAW-COFFEE-ESP', qty: 18 }, { code: 'RAW-MILK', qty: 180 }, { code: 'RAW-CHOCO', qty: 20 }, { code: 'RAW-CUP-M', qty: 1 }],
  'コーヒー': [{ code: 'RAW-COFFEE-DRP', qty: 15 }, { code: 'RAW-CUP-M', qty: 1 }],
  '抹茶': [{ code: 'RAW-MATCHA', qty: 5 }, { code: 'RAW-MILK', qty: 250 }, { code: 'RAW-CUP-M', qty: 1 }],
  '紅茶': [{ code: 'RAW-TEA', qty: 5 }, { code: 'RAW-CUP-M', qty: 1 }],
  '焼き': [{ code: 'RAW-FISH', qty: 150 }, { code: 'RAW-SAUCE', qty: 20 }],
  'サーモン': [{ code: 'RAW-SALMON', qty: 120 }, { code: 'RAW-SAUCE', qty: 15 }],
  'ハラス': [{ code: 'RAW-SALMON', qty: 100 }, { code: 'RAW-SAUCE', qty: 15 }],
  '丼': [{ code: 'RAW-RICE', qty: 200 }, { code: 'RAW-EGG', qty: 1 }, { code: 'RAW-SAUCE', qty: 30 }],
  'カレー': [{ code: 'RAW-RICE', qty: 200 }, { code: 'RAW-CURRY', qty: 150 }],
  'ラーメン': [{ code: 'RAW-NOODLE', qty: 150 }, { code: 'RAW-SOUP', qty: 300 }, { code: 'RAW-EGG', qty: 1 }],
  'うどん': [{ code: 'RAW-UDON', qty: 200 }, { code: 'RAW-SOUP', qty: 300 }],
  'そば': [{ code: 'RAW-SOBA', qty: 150 }, { code: 'RAW-SOUP', qty: 300 }],
  '定食': [{ code: 'RAW-RICE', qty: 200 }, { code: 'RAW-MISO', qty: 150 }, { code: 'RAW-SALAD', qty: 50 }],
  'サンドイッチ': [{ code: 'RAW-BREAD', qty: 2 }, { code: 'RAW-HAM', qty: 30 }, { code: 'RAW-CHEESE', qty: 20 }],
  'トースト': [{ code: 'RAW-BREAD', qty: 2 }, { code: 'RAW-BUTTER', qty: 10 }],
  'ケーキ': [{ code: 'RAW-FLOUR', qty: 50 }, { code: 'RAW-SUGAR', qty: 30 }, { code: 'RAW-EGG', qty: 1 }, { code: 'RAW-CREAM', qty: 50 }],
  '寿司': [{ code: 'RAW-RICE', qty: 150 }, { code: 'RAW-FISH', qty: 80 }],
  '刺身': [{ code: 'RAW-FISH', qty: 120 }, { code: 'RAW-SAUCE', qty: 10 }],
  '天ぷら': [{ code: 'RAW-FLOUR', qty: 50 }, { code: 'RAW-EGG', qty: 1 }],
  'おにぎり': [{ code: 'RAW-RICE', qty: 120 }],
  '弁当': [{ code: 'RAW-RICE', qty: 200 }, { code: 'RAW-FISH', qty: 50 }, { code: 'RAW-SALAD', qty: 30 }],
  '豚': [{ code: 'RAW-GENERIC-A', qty: 150 }, { code: 'RAW-SAUCE', qty: 20 }],
  '鶏': [{ code: 'RAW-GENERIC-A', qty: 150 }, { code: 'RAW-SAUCE', qty: 20 }],
  '牛': [{ code: 'RAW-GENERIC-A', qty: 150 }, { code: 'RAW-SAUCE', qty: 20 }],
  '肉': [{ code: 'RAW-GENERIC-A', qty: 150 }, { code: 'RAW-SAUCE', qty: 20 }],
  'サラダ': [{ code: 'RAW-SALAD', qty: 150 }, { code: 'RAW-SAUCE', qty: 20 }],
  'スープ': [{ code: 'RAW-SOUP', qty: 250 }],
  '味噌': [{ code: 'RAW-MISO', qty: 200 }],
  '唐揚げ': [{ code: 'RAW-FLOUR', qty: 50 }, { code: 'RAW-GENERIC-A', qty: 100 }],
  'から揚げ': [{ code: 'RAW-FLOUR', qty: 50 }, { code: 'RAW-GENERIC-A', qty: 100 }],
  'モン': [{ code: 'RAW-FISH', qty: 120 }, { code: 'RAW-SAUCE', qty: 20 }],
};

interface Product {
  id: number;
  name: string;
  default_code: string | false;
  product_tmpl_id?: [number, string];
}

interface Uom {
  id: number;
  name: string;
}

async function main() {
  // Get tenant
  const tenant = await prisma.tenant.findFirst({ where: { isActive: true } });
  if (!tenant) {
    console.log('No active tenant found.');
    return;
  }

  console.log(`Tenant: ${tenant.name}`);
  console.log(`Odoo: ${tenant.odooBaseUrl}`);

  // Create and authenticate Odoo client
  const odoo = createOdooClient({
    baseUrl: tenant.odooBaseUrl,
    db: tenant.odooDb,
  });

  console.log('\nAuthenticating with Odoo...');
  await odoo.authenticate('test', 'test');
  console.log('✅ Authenticated');

  const results = {
    rawMaterialsCreated: 0,
    bomsCreated: 0,
    errors: [] as string[],
  };

  // Step 1: Get UOMs
  console.log('\nFetching UOMs...');
  const uoms = await odoo.searchRead<Uom>('uom.uom', [], { fields: ['id', 'name'], limit: 100 });
  const uomMap = new Map(uoms.map((u) => [u.name, u.id]));
  let unitsUomId = uomMap.get('Units') || uomMap.get('Unit(s)') || uomMap.get('個') || uoms[0]?.id || 1;
  console.log(`Found ${uoms.length} UOMs`);

  // Step 2: Create raw materials
  console.log('\nCreating raw materials...');
  for (const material of RAW_MATERIALS) {
    try {
      const existing = await odoo.searchRead<Product>('product.product', [
        ['default_code', '=', material.code],
      ], { fields: ['id'], limit: 1 });

      if (existing.length === 0) {
        let uomId = uomMap.get(material.uomName);
        if (!uomId) {
          if (material.uomName === 'Units') uomId = uomMap.get('Unit(s)') || uomMap.get('個') || unitsUomId;
          else if (material.uomName === 'g') uomId = uomMap.get('g') || uomMap.get('グラム') || unitsUomId;
          else if (material.uomName === 'ml') uomId = uomMap.get('ml') || uomMap.get('ミリリットル') || unitsUomId;
        }

        await odoo.create('product.template', {
          name: material.name,
          default_code: material.code,
          is_storable: true,  // Odoo 18: use is_storable instead of type='product'
          uom_id: uomId || unitsUomId,
          uom_po_id: uomId || unitsUomId,
          purchase_ok: true,
          sale_ok: false,
        });
        results.rawMaterialsCreated++;
        process.stdout.write('.');
      }
    } catch (error) {
      results.errors.push(`Raw material ${material.name}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }
  console.log(`\n✅ Created ${results.rawMaterialsCreated} raw materials`);

  // Step 3: Get POS products
  console.log('\nFetching POS products...');
  const posProducts = await odoo.searchRead<Product>('product.product', [
    ['available_in_pos', '=', true],
  ], { fields: ['id', 'name', 'default_code', 'product_tmpl_id'], limit: 200 });
  console.log(`Found ${posProducts.length} POS products`);

  // Step 4: Get raw material products
  const rawMaterialCodes = RAW_MATERIALS.map((m) => m.code);
  const rawMaterialProducts = await odoo.searchRead<Product>('product.product', [
    ['default_code', 'in', rawMaterialCodes],
  ], { fields: ['id', 'default_code'], limit: 100 });
  const rawMaterialMap = new Map(rawMaterialProducts.map((p) => [p.default_code, p]));

  // Step 5: Create BOMs
  console.log('\nCreating BOMs...');
  for (const product of posProducts) {
    try {
      // Check if BOM already exists
      const existingBom = await odoo.searchRead('mrp.bom', [
        ['product_tmpl_id.product_variant_ids', 'in', [product.id]],
      ], { fields: ['id'], limit: 1 });

      if (existingBom.length > 0) continue;

      // Find matching recipe
      let recipe: Array<{ code: string; qty: number }> | null = null;
      for (const [pattern, components] of Object.entries(BOM_RECIPES)) {
        if (product.name.includes(pattern)) {
          recipe = components;
          break;
        }
      }

      // Default recipe for unmatched products
      if (!recipe) {
        recipe = [
          { code: 'RAW-GENERIC-A', qty: 100 },
          { code: 'RAW-GENERIC-B', qty: 50 },
          { code: 'RAW-PACKAGING', qty: 1 },
        ];
      }

      // Build BOM lines
      const bomLines: Array<[number, number, { product_id: number; product_qty: number }]> = [];
      for (const component of recipe) {
        const rawMaterial = rawMaterialMap.get(component.code);
        if (rawMaterial) {
          bomLines.push([0, 0, { product_id: rawMaterial.id, product_qty: component.qty }]);
        }
      }

      if (bomLines.length === 0) continue;

      const productTmplId = product.product_tmpl_id?.[0];
      if (!productTmplId) continue;

      await odoo.create('mrp.bom', {
        product_tmpl_id: productTmplId,
        product_qty: 1,
        type: 'normal',
        bom_line_ids: bomLines,
      });

      results.bomsCreated++;
      process.stdout.write('✓');
    } catch (error) {
      results.errors.push(`BOM for ${product.name}: ${error instanceof Error ? error.message : 'Unknown'}`);
      process.stdout.write('✗');
    }
  }

  console.log(`\n\n========== RESULTS ==========`);
  console.log(`Raw materials created: ${results.rawMaterialsCreated}`);
  console.log(`BOMs created: ${results.bomsCreated}`);
  console.log(`Total POS products: ${posProducts.length}`);
  if (results.errors.length > 0) {
    console.log(`\nErrors (${results.errors.length}):`);
    results.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
