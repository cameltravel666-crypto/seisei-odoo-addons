import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOdooClientForSession } from '@/lib/odoo';

/**
 * BOM Seed API - Generate test Bill of Materials based on existing POS products
 *
 * POST /api/seed/bom
 *
 * This endpoint:
 * 1. Fetches existing POS products (finished goods)
 * 2. Creates raw material products (components) if they don't exist
 * 3. Creates BOMs linking finished goods to components
 */

interface Product {
  id: number;
  name: string;
  default_code: string | false;
  type: string;
  uom_id: [number, string] | false;
  categ_id: [number, string] | false;
}

interface Uom {
  id: number;
  name: string;
}

// Raw material definitions (components)
const RAW_MATERIALS = [
  // Coffee & Tea
  { name: 'コーヒー豆 (エスプレッソ)', code: 'RAW-COFFEE-ESP', uomName: 'g' },
  { name: 'コーヒー豆 (ドリップ)', code: 'RAW-COFFEE-DRP', uomName: 'g' },
  { name: '抹茶パウダー', code: 'RAW-MATCHA', uomName: 'g' },
  { name: '紅茶葉', code: 'RAW-TEA', uomName: 'g' },
  // Dairy & Cream
  { name: '牛乳', code: 'RAW-MILK', uomName: 'ml' },
  { name: 'オーツミルク', code: 'RAW-OAT-MILK', uomName: 'ml' },
  { name: 'ホイップクリーム', code: 'RAW-WHIP', uomName: 'g' },
  { name: '生クリーム', code: 'RAW-CREAM', uomName: 'ml' },
  // Sweeteners & Syrups
  { name: '砂糖', code: 'RAW-SUGAR', uomName: 'g' },
  { name: 'シロップ (バニラ)', code: 'RAW-SYRUP-VAN', uomName: 'ml' },
  { name: 'シロップ (キャラメル)', code: 'RAW-SYRUP-CAR', uomName: 'ml' },
  { name: 'チョコレートソース', code: 'RAW-CHOCO', uomName: 'ml' },
  // Packaging
  { name: 'カップ (S)', code: 'RAW-CUP-S', uomName: 'Units' },
  { name: 'カップ (M)', code: 'RAW-CUP-M', uomName: 'Units' },
  { name: 'カップ (L)', code: 'RAW-CUP-L', uomName: 'Units' },
  { name: 'ストロー', code: 'RAW-STRAW', uomName: 'Units' },
  { name: '氷', code: 'RAW-ICE', uomName: 'g' },
  // Bread & Bakery
  { name: 'パン (食パン)', code: 'RAW-BREAD', uomName: 'Units' },
  { name: 'バター', code: 'RAW-BUTTER', uomName: 'g' },
  { name: '小麦粉', code: 'RAW-FLOUR', uomName: 'g' },
  // Proteins
  { name: '卵', code: 'RAW-EGG', uomName: 'Units' },
  { name: 'ハム', code: 'RAW-HAM', uomName: 'g' },
  { name: 'チーズ', code: 'RAW-CHEESE', uomName: 'g' },
  { name: 'サーモン', code: 'RAW-SALMON', uomName: 'g' },
  { name: '魚', code: 'RAW-FISH', uomName: 'g' },
  // Vegetables
  { name: 'レタス', code: 'RAW-LETTUCE', uomName: 'g' },
  { name: 'トマト', code: 'RAW-TOMATO', uomName: 'g' },
  { name: 'サラダミックス', code: 'RAW-SALAD', uomName: 'g' },
  { name: 'フルーツミックス', code: 'RAW-FRUIT', uomName: 'g' },
  // Japanese Food Base
  { name: 'ご飯', code: 'RAW-RICE', uomName: 'g' },
  { name: 'たれ・ソース', code: 'RAW-SAUCE', uomName: 'ml' },
  { name: 'カレールー', code: 'RAW-CURRY', uomName: 'g' },
  { name: '麺 (ラーメン)', code: 'RAW-NOODLE', uomName: 'g' },
  { name: 'うどん', code: 'RAW-UDON', uomName: 'g' },
  { name: 'そば', code: 'RAW-SOBA', uomName: 'g' },
  { name: 'だし汁', code: 'RAW-SOUP', uomName: 'ml' },
  { name: '味噌汁', code: 'RAW-MISO', uomName: 'ml' },
  // Desserts
  { name: 'アイスクリーム', code: 'RAW-ICECREAM', uomName: 'g' },
  // Generic (for default BOM)
  { name: '調理材料A', code: 'RAW-GENERIC-A', uomName: 'g' },
  { name: '調理材料B', code: 'RAW-GENERIC-B', uomName: 'g' },
  { name: '包装材', code: 'RAW-PACKAGING', uomName: 'Units' },
];

// BOM recipes - maps product name patterns to components
const BOM_RECIPES: Record<string, Array<{ code: string; qty: number }>> = {
  // Coffee drinks
  'エスプレッソ': [
    { code: 'RAW-COFFEE-ESP', qty: 18 },
    { code: 'RAW-CUP-S', qty: 1 },
  ],
  'アメリカーノ': [
    { code: 'RAW-COFFEE-ESP', qty: 18 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'カフェラテ': [
    { code: 'RAW-COFFEE-ESP', qty: 18 },
    { code: 'RAW-MILK', qty: 200 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'ラテ': [
    { code: 'RAW-COFFEE-ESP', qty: 18 },
    { code: 'RAW-MILK', qty: 200 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'カプチーノ': [
    { code: 'RAW-COFFEE-ESP', qty: 18 },
    { code: 'RAW-MILK', qty: 150 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'カフェモカ': [
    { code: 'RAW-COFFEE-ESP', qty: 18 },
    { code: 'RAW-MILK', qty: 180 },
    { code: 'RAW-CHOCO', qty: 20 },
    { code: 'RAW-WHIP', qty: 30 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'モカ': [
    { code: 'RAW-COFFEE-ESP', qty: 18 },
    { code: 'RAW-MILK', qty: 180 },
    { code: 'RAW-CHOCO', qty: 20 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'キャラメル': [
    { code: 'RAW-COFFEE-ESP', qty: 18 },
    { code: 'RAW-MILK', qty: 200 },
    { code: 'RAW-SYRUP-CAR', qty: 15 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'バニラ': [
    { code: 'RAW-COFFEE-ESP', qty: 18 },
    { code: 'RAW-MILK', qty: 200 },
    { code: 'RAW-SYRUP-VAN', qty: 15 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'アイス': [
    { code: 'RAW-COFFEE-DRP', qty: 20 },
    { code: 'RAW-ICE', qty: 150 },
    { code: 'RAW-CUP-L', qty: 1 },
    { code: 'RAW-STRAW', qty: 1 },
  ],
  'コーヒー': [
    { code: 'RAW-COFFEE-DRP', qty: 15 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  // Tea drinks
  '抹茶': [
    { code: 'RAW-MATCHA', qty: 5 },
    { code: 'RAW-MILK', qty: 250 },
    { code: 'RAW-SUGAR', qty: 10 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  '紅茶': [
    { code: 'RAW-TEA', qty: 5 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'ティー': [
    { code: 'RAW-TEA', qty: 5 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'ミルクティー': [
    { code: 'RAW-TEA', qty: 5 },
    { code: 'RAW-MILK', qty: 100 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  // Food items - Japanese
  '焼き': [
    { code: 'RAW-FISH', qty: 150 },
    { code: 'RAW-SAUCE', qty: 20 },
  ],
  'サーモン': [
    { code: 'RAW-SALMON', qty: 120 },
    { code: 'RAW-SAUCE', qty: 15 },
  ],
  'ハラス': [
    { code: 'RAW-SALMON', qty: 100 },
    { code: 'RAW-SAUCE', qty: 15 },
  ],
  '丼': [
    { code: 'RAW-RICE', qty: 200 },
    { code: 'RAW-EGG', qty: 1 },
    { code: 'RAW-SAUCE', qty: 30 },
  ],
  'カレー': [
    { code: 'RAW-RICE', qty: 200 },
    { code: 'RAW-CURRY', qty: 150 },
  ],
  'ラーメン': [
    { code: 'RAW-NOODLE', qty: 150 },
    { code: 'RAW-SOUP', qty: 300 },
    { code: 'RAW-EGG', qty: 1 },
  ],
  'うどん': [
    { code: 'RAW-UDON', qty: 200 },
    { code: 'RAW-SOUP', qty: 300 },
  ],
  'そば': [
    { code: 'RAW-SOBA', qty: 150 },
    { code: 'RAW-SOUP', qty: 300 },
  ],
  '定食': [
    { code: 'RAW-RICE', qty: 200 },
    { code: 'RAW-MISO', qty: 150 },
    { code: 'RAW-SALAD', qty: 50 },
  ],
  // Sandwich & Bread
  'サンドイッチ': [
    { code: 'RAW-BREAD', qty: 2 },
    { code: 'RAW-HAM', qty: 30 },
    { code: 'RAW-CHEESE', qty: 20 },
    { code: 'RAW-LETTUCE', qty: 20 },
  ],
  'サンド': [
    { code: 'RAW-BREAD', qty: 2 },
    { code: 'RAW-HAM', qty: 30 },
    { code: 'RAW-LETTUCE', qty: 15 },
  ],
  'トースト': [
    { code: 'RAW-BREAD', qty: 2 },
    { code: 'RAW-BUTTER', qty: 10 },
  ],
  'パン': [
    { code: 'RAW-BREAD', qty: 1 },
  ],
  // Desserts
  'ケーキ': [
    { code: 'RAW-FLOUR', qty: 50 },
    { code: 'RAW-SUGAR', qty: 30 },
    { code: 'RAW-EGG', qty: 1 },
    { code: 'RAW-CREAM', qty: 50 },
  ],
  'プリン': [
    { code: 'RAW-EGG', qty: 2 },
    { code: 'RAW-MILK', qty: 100 },
    { code: 'RAW-SUGAR', qty: 20 },
  ],
  'パフェ': [
    { code: 'RAW-CREAM', qty: 80 },
    { code: 'RAW-FRUIT', qty: 50 },
    { code: 'RAW-ICECREAM', qty: 50 },
  ],
  'アイスクリーム': [
    { code: 'RAW-ICECREAM', qty: 100 },
  ],
  // Additional Japanese dishes
  '寿司': [
    { code: 'RAW-RICE', qty: 150 },
    { code: 'RAW-FISH', qty: 80 },
  ],
  '刺身': [
    { code: 'RAW-FISH', qty: 120 },
    { code: 'RAW-SAUCE', qty: 10 },
  ],
  '天ぷら': [
    { code: 'RAW-FLOUR', qty: 50 },
    { code: 'RAW-EGG', qty: 1 },
  ],
  'おにぎり': [
    { code: 'RAW-RICE', qty: 120 },
  ],
  '弁当': [
    { code: 'RAW-RICE', qty: 200 },
    { code: 'RAW-FISH', qty: 50 },
    { code: 'RAW-SALAD', qty: 30 },
  ],
  // Meat dishes
  '豚': [
    { code: 'RAW-GENERIC-A', qty: 150 },
    { code: 'RAW-SAUCE', qty: 20 },
  ],
  '鶏': [
    { code: 'RAW-GENERIC-A', qty: 150 },
    { code: 'RAW-SAUCE', qty: 20 },
  ],
  '牛': [
    { code: 'RAW-GENERIC-A', qty: 150 },
    { code: 'RAW-SAUCE', qty: 20 },
  ],
  '肉': [
    { code: 'RAW-GENERIC-A', qty: 150 },
    { code: 'RAW-SAUCE', qty: 20 },
  ],
  // Seafood
  'エビ': [
    { code: 'RAW-FISH', qty: 100 },
  ],
  'いか': [
    { code: 'RAW-FISH', qty: 100 },
  ],
  'たこ': [
    { code: 'RAW-FISH', qty: 100 },
  ],
  // Vegetables & Salads
  'サラダ': [
    { code: 'RAW-SALAD', qty: 150 },
    { code: 'RAW-SAUCE', qty: 20 },
  ],
  '野菜': [
    { code: 'RAW-SALAD', qty: 100 },
  ],
  // Soups
  'スープ': [
    { code: 'RAW-SOUP', qty: 250 },
  ],
  '味噌': [
    { code: 'RAW-MISO', qty: 200 },
  ],
  // Fried foods
  'フライ': [
    { code: 'RAW-FLOUR', qty: 50 },
    { code: 'RAW-EGG', qty: 1 },
  ],
  '唐揚げ': [
    { code: 'RAW-FLOUR', qty: 50 },
    { code: 'RAW-GENERIC-A', qty: 100 },
  ],
  'から揚げ': [
    { code: 'RAW-FLOUR', qty: 50 },
    { code: 'RAW-GENERIC-A', qty: 100 },
  ],
  // Sweets & Desserts
  'スイーツ': [
    { code: 'RAW-SUGAR', qty: 30 },
    { code: 'RAW-CREAM', qty: 50 },
  ],
  'デザート': [
    { code: 'RAW-SUGAR', qty: 30 },
    { code: 'RAW-CREAM', qty: 50 },
  ],
  'クッキー': [
    { code: 'RAW-FLOUR', qty: 50 },
    { code: 'RAW-BUTTER', qty: 30 },
    { code: 'RAW-SUGAR', qty: 20 },
  ],
  'チョコ': [
    { code: 'RAW-CHOCO', qty: 50 },
  ],
  // Drinks
  'ジュース': [
    { code: 'RAW-FRUIT', qty: 100 },
    { code: 'RAW-ICE', qty: 100 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  'スムージー': [
    { code: 'RAW-FRUIT', qty: 100 },
    { code: 'RAW-MILK', qty: 100 },
    { code: 'RAW-ICE', qty: 80 },
    { code: 'RAW-CUP-L', qty: 1 },
  ],
  'ミルク': [
    { code: 'RAW-MILK', qty: 250 },
    { code: 'RAW-CUP-M', qty: 1 },
  ],
  // Generic matches for "モン" pattern (like モンのハラス焼き)
  'モン': [
    { code: 'RAW-FISH', qty: 120 },
    { code: 'RAW-SAUCE', qty: 20 },
  ],
};

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const odoo = await getOdooClientForSession(session);
    const results = {
      rawMaterialsCreated: 0,
      bomsCreated: 0,
      errors: [] as string[],
    };

    // Step 1: Get UOMs
    const uoms = await odoo.searchRead<Uom>('uom.uom', [], {
      fields: ['id', 'name'],
      limit: 100,
    });
    const uomMap = new Map(uoms.map((u) => [u.name, u.id]));

    // Find or create Units UOM
    let unitsUomId = uomMap.get('Units') || uomMap.get('Unit(s)') || uomMap.get('個');
    if (!unitsUomId) {
      // Use first available UOM as fallback
      unitsUomId = uoms[0]?.id || 1;
    }

    // Step 2: Create raw materials if they don't exist
    for (const material of RAW_MATERIALS) {
      try {
        // Check if already exists
        const existing = await odoo.searchRead<Product>('product.product', [
          ['default_code', '=', material.code],
        ], {
          fields: ['id'],
          limit: 1,
        });

        if (existing.length === 0) {
          // Get UOM ID
          let uomId = uomMap.get(material.uomName);
          if (!uomId) {
            // Try common alternatives
            if (material.uomName === 'Units') {
              uomId = uomMap.get('Unit(s)') || uomMap.get('個') || unitsUomId;
            } else if (material.uomName === 'g') {
              uomId = uomMap.get('g') || uomMap.get('グラム') || unitsUomId;
            } else if (material.uomName === 'ml') {
              uomId = uomMap.get('ml') || uomMap.get('ミリリットル') || uomMap.get('L') || unitsUomId;
            }
          }

          // Create raw material product
          await odoo.create('product.template', {
            name: material.name,
            default_code: material.code,
            is_storable: true, // Odoo 18: use is_storable instead of type='product'
            uom_id: uomId || unitsUomId,
            uom_po_id: uomId || unitsUomId,
            purchase_ok: true,
            sale_ok: false,
          });
          results.rawMaterialsCreated++;
        }
      } catch (error) {
        results.errors.push(`Failed to create ${material.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Step 3: Fetch POS products (finished goods)
    const posProducts = await odoo.searchRead<Product>('product.product', [
      ['available_in_pos', '=', true],
    ], {
      fields: ['id', 'name', 'default_code', 'type', 'uom_id', 'categ_id'],
      limit: 200,
    });

    // Step 4: Fetch raw material products
    const rawMaterialCodes = RAW_MATERIALS.map((m) => m.code);
    const rawMaterialProducts = await odoo.searchRead<Product>('product.product', [
      ['default_code', 'in', rawMaterialCodes],
    ], {
      fields: ['id', 'default_code', 'uom_id'],
      limit: 100,
    });
    const rawMaterialMap = new Map(rawMaterialProducts.map((p) => [p.default_code, p]));

    // Step 5: Create BOMs for POS products
    for (const product of posProducts) {
      try {
        // Check if BOM already exists
        const existingBom = await odoo.searchRead('mrp.bom', [
          ['product_tmpl_id.product_variant_ids', 'in', [product.id]],
        ], {
          fields: ['id'],
          limit: 1,
        });

        if (existingBom.length > 0) {
          continue; // BOM already exists
        }

        // Find matching recipe based on product name patterns
        let recipe: Array<{ code: string; qty: number }> | null = null;
        for (const [pattern, components] of Object.entries(BOM_RECIPES)) {
          if (product.name.includes(pattern)) {
            recipe = components;
            break;
          }
        }

        // Use default recipe for products that don't match any pattern
        // This ensures ALL POS products get a BOM for testing
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
            bomLines.push([
              0,
              0,
              {
                product_id: rawMaterial.id,
                product_qty: component.qty,
              },
            ]);
          }
        }

        if (bomLines.length === 0) {
          continue; // No valid components found
        }

        // Get product template ID
        const productTemplates = await odoo.searchRead('product.product', [
          ['id', '=', product.id],
        ], {
          fields: ['product_tmpl_id'],
          limit: 1,
        }) as Array<{ product_tmpl_id: [number, string] }>;

        if (productTemplates.length === 0) {
          continue;
        }

        const productTmplId = productTemplates[0].product_tmpl_id[0];

        // Create BOM
        await odoo.create('mrp.bom', {
          product_tmpl_id: productTmplId,
          product_qty: 1,
          type: 'normal',
          bom_line_ids: bomLines,
        });

        results.bomsCreated++;
      } catch (error) {
        results.errors.push(`Failed to create BOM for ${product.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        message: `Created ${results.rawMaterialsCreated} raw materials and ${results.bomsCreated} BOMs`,
        rawMaterialsCreated: results.rawMaterialsCreated,
        bomsCreated: results.bomsCreated,
        totalPosProducts: posProducts.length,
        errors: results.errors.length > 0 ? results.errors : undefined,
      },
    });
  } catch (error) {
    console.error('[BOM Seed Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to seed BOMs',
        },
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check existing BOMs
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const odoo = await getOdooClientForSession(session);

    // Get BOM count
    const bomCount = await odoo.searchCount('mrp.bom', []);

    // Get raw materials count
    const rawMaterialCodes = RAW_MATERIALS.map((m) => m.code);
    const rawMaterialCount = await odoo.searchCount('product.product', [
      ['default_code', 'in', rawMaterialCodes],
    ]);

    // Get sample BOMs
    interface BomRecord {
      id: number;
      product_tmpl_id: [number, string] | false;
      product_qty: number;
      bom_line_ids: number[];
    }

    const sampleBoms = await odoo.searchRead<BomRecord>('mrp.bom', [], {
      fields: ['id', 'product_tmpl_id', 'product_qty', 'bom_line_ids'],
      limit: 10,
      order: 'id desc',
    });

    return NextResponse.json({
      success: true,
      data: {
        totalBoms: bomCount,
        rawMaterialsAvailable: rawMaterialCount,
        rawMaterialsExpected: RAW_MATERIALS.length,
        sampleBoms: sampleBoms.map((b) => ({
          id: b.id,
          productName: Array.isArray(b.product_tmpl_id) ? b.product_tmpl_id[1] : '-',
          quantity: b.product_qty,
          componentCount: b.bom_line_ids?.length || 0,
        })),
      },
    });
  } catch (error) {
    console.error('[BOM Check Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check BOMs',
        },
      },
      { status: 500 }
    );
  }
}
