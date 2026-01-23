/**
 * 查询 Odoo 19 订阅产品
 *
 * 使用方法:
 * ODOO19_PASSWORD=your_password npx tsx scripts/query-odoo19-products.ts
 */

const ODOO19_CONFIG = {
  baseUrl: process.env.ODOO19_URL || 'http://13.159.193.191:8069',
  db: process.env.ODOO19_DB || 'ERP',
  username: process.env.ODOO19_USERNAME || 'admin',
  password: process.env.ODOO19_PASSWORD || '',
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

async function jsonRpc(
  endpoint: string,
  params: Record<string, unknown>,
  sessionId?: string
): Promise<{ result: unknown; sessionId?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionId) {
    headers['Cookie'] = `session_id=${sessionId}`;
  }

  const response = await fetch(`${ODOO19_CONFIG.baseUrl}${endpoint}`, {
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

  let extractedSessionId: string | undefined;
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/session_id=([^;]+)/);
    if (match) {
      extractedSessionId = match[1];
    }
  }

  return { result: data.result, sessionId: extractedSessionId };
}

async function main() {
  console.log('🔍 查询 Odoo 19 订阅产品\n');
  console.log('配置:');
  console.log(`  URL: ${ODOO19_CONFIG.baseUrl}`);
  console.log(`  DB: ${ODOO19_CONFIG.db}`);
  console.log(`  User: ${ODOO19_CONFIG.username}`);
  console.log(`  Password: ${ODOO19_CONFIG.password ? '******' : '(未设置)'}\n`);

  if (!ODOO19_CONFIG.password) {
    console.error('❌ 请设置 ODOO19_PASSWORD 环境变量');
    console.log('\n使用方法:');
    console.log('  ODOO19_PASSWORD=your_password npx tsx scripts/query-odoo19-products.ts');
    process.exit(1);
  }

  try {
    // 1. 认证
    console.log('1. 正在认证...');
    const { result: authResult, sessionId } = await jsonRpc('/web/session/authenticate', {
      db: ODOO19_CONFIG.db,
      login: ODOO19_CONFIG.username,
      password: ODOO19_CONFIG.password,
    });

    const auth = authResult as Record<string, unknown>;
    if (!auth.uid) {
      throw new Error('认证失败: ' + JSON.stringify(auth));
    }
    console.log(`   ✅ 认证成功, uid: ${auth.uid}\n`);

    // 2. 查询订阅产品 (搜索包含 BizNexus 或 subscription 的产品)
    console.log('2. 查询订阅产品...');

    // 先搜索所有服务类型产品
    const { result: products } = await jsonRpc(
      '/web/dataset/call_kw',
      {
        model: 'product.template',
        method: 'search_read',
        args: [[['type', '=', 'service']]],
        kwargs: {
          fields: ['id', 'name', 'list_price', 'description', 'default_code', 'active'],
          limit: 50,
        },
      },
      sessionId
    );

    const productList = products as Array<{
      id: number;
      name: string;
      list_price: number;
      description: string | false;
      default_code: string | false;
      active: boolean;
    }>;

    console.log(`   找到 ${productList.length} 个服务类产品:\n`);

    // 筛选可能是订阅产品的
    const subscriptionProducts = productList.filter(
      p => p.name.toLowerCase().includes('biznexus') ||
           p.name.toLowerCase().includes('subscription') ||
           p.name.toLowerCase().includes('plan') ||
           p.name.includes('Basic') ||
           p.name.includes('Standard') ||
           p.name.includes('Premium')
    );

    if (subscriptionProducts.length > 0) {
      console.log('📦 订阅相关产品:');
      console.log('─'.repeat(70));
      subscriptionProducts.forEach(p => {
        console.log(`  ID: ${p.id}`);
        console.log(`  名称: ${p.name}`);
        console.log(`  价格: ¥${p.list_price.toLocaleString()}`);
        console.log(`  代码: ${p.default_code || '-'}`);
        console.log(`  描述: ${p.description || '-'}`);
        console.log('─'.repeat(70));
      });
    }

    // 显示所有产品
    console.log('\n📋 所有服务类产品:');
    console.log('─'.repeat(70));
    productList.forEach(p => {
      console.log(`  [${p.id}] ${p.name} - ¥${p.list_price.toLocaleString()}`);
    });

    // 3. 查询订阅模块是否安装
    console.log('\n3. 检查已安装模块...');
    const { result: modules } = await jsonRpc(
      '/web/dataset/call_kw',
      {
        model: 'ir.module.module',
        method: 'search_read',
        args: [[
          ['state', '=', 'installed'],
          ['name', 'in', ['sale_subscription', 'sale', 'account', 'payment']],
        ]],
        kwargs: {
          fields: ['name', 'shortdesc', 'state'],
        },
      },
      sessionId
    );

    const moduleList = modules as Array<{ name: string; shortdesc: string; state: string }>;
    console.log('   已安装的相关模块:');
    moduleList.forEach(m => {
      console.log(`   ✅ ${m.name} - ${m.shortdesc}`);
    });

    // 4. 输出配置建议
    console.log('\n' + '='.repeat(70));
    console.log('📝 配置建议');
    console.log('='.repeat(70));

    if (subscriptionProducts.length > 0) {
      console.log('\n请在 prisma/seed/seed.ts 中更新 odoo19ProductId:');
      console.log('');
      subscriptionProducts.forEach(p => {
        const planCode = p.name.toLowerCase().includes('basic') ? 'basic' :
                        p.name.toLowerCase().includes('standard') ? 'standard' :
                        p.name.toLowerCase().includes('premium') ? 'premium' : 'unknown';
        console.log(`  { planCode: '${planCode}', odoo19ProductId: ${p.id} }  // ${p.name}`);
      });
    }

    console.log('\n请在 .env 中添加 Odoo 19 配置:');
    console.log('');
    console.log(`ODOO19_URL=${ODOO19_CONFIG.baseUrl}`);
    console.log(`ODOO19_DB=${ODOO19_CONFIG.db}`);
    console.log(`ODOO19_USERNAME=${ODOO19_CONFIG.username}`);
    console.log(`ODOO19_PASSWORD=your_password`);

  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

main();
