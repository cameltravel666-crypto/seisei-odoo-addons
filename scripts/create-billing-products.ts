/**
 * Create billing products in Odoo 19
 */
import 'dotenv/config';

// Override password if needed
process.env.ODOO19_PASSWORD = process.env.ODOO19_PASSWORD || 'wind1982';

import { getOdoo19Client } from '../src/lib/odoo19';

async function createBillingProducts() {
  const odoo = getOdoo19Client();

  try {
    console.log('Connecting to Odoo 19...');
    console.log('URL:', process.env.ODOO19_URL);
    console.log('DB:', process.env.ODOO19_DB);
    console.log('User:', process.env.ODOO19_USERNAME);

    await odoo.authenticate();
    console.log('✅ Odoo 19 认证成功');

    // 检查产品是否已存在
    const existing = await odoo.searchRead(
      'product.product',
      [['default_code', 'in', ['METERED-OCR', 'METERED-TABLE']]],
      ['id', 'default_code', 'name', 'list_price']
    );

    if (existing.length > 0) {
      console.log('⚠️ 产品已存在:', JSON.stringify(existing, null, 2));
      return;
    }

    // 创建 OCR 计费产品
    const ocrProductId = await odoo.create('product.product', {
      name: 'OCR 文档识别 (超额用量)',
      default_code: 'METERED-OCR',
      type: 'service',
      list_price: 20,
      sale_ok: true,
      purchase_ok: false,
      description_sale: 'OCR 文档识别服务超额用量，免费额度 30 次/月',
    });
    console.log('✅ 创建 OCR 产品, ID:', ocrProductId);

    // 创建 Table Engine 计费产品
    const tableProductId = await odoo.create('product.product', {
      name: 'Table Engine 表格处理 (超额用量)',
      default_code: 'METERED-TABLE',
      type: 'service',
      list_price: 50,
      sale_ok: true,
      purchase_ok: false,
      description_sale: 'Table Engine 表格处理服务超额用量，免费额度 5 次/月',
    });
    console.log('✅ 创建 Table 产品, ID:', tableProductId);

    console.log('\n🎉 计费产品创建完成!');

  } catch (error) {
    console.error('❌ 错误:', error);
  }
}

createBillingProducts();
