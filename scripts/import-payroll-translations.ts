/**
 * Import PO translations for bi_hr_payroll module into Odoo 18
 *
 * Usage:
 * cd "/Users/taozhang/Projects/Seisei ERP" && npx tsx scripts/import-payroll-translations.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ODOO18_CONFIG = {
  baseUrl: 'https://demo.nagashiro.top',
  db: 'test001',
  username: 'test',
  password: 'test',
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

async function callKw(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  return jsonRpc('/web/dataset/call_kw', {
    model,
    method,
    args,
    kwargs,
  });
}

// Parse PO file and extract translations
function parsePOFile(content: string): Array<{ msgid: string; msgstr: string }> {
  const translations: Array<{ msgid: string; msgstr: string }> = [];
  const entries = content.split(/\n\n+/);

  for (const entry of entries) {
    const msgidMatch = entry.match(/msgid\s+"(.+?)"\s*$/m);
    const msgstrMatch = entry.match(/msgstr\s+"(.+?)"\s*$/m);

    if (msgidMatch && msgstrMatch && msgidMatch[1] && msgstrMatch[1]) {
      translations.push({
        msgid: msgidMatch[1],
        msgstr: msgstrMatch[1],
      });
    }
  }

  return translations;
}

async function main() {
  console.log('==========================================');
  console.log('Import PO Translations - Odoo 18');
  console.log('==========================================\n');

  try {
    // 1. Authenticate
    console.log('1. Authenticating...');
    const authResult = await jsonRpc('/web/session/authenticate', {
      db: ODOO18_CONFIG.db,
      login: ODOO18_CONFIG.username,
      password: ODOO18_CONFIG.password,
    }) as Record<string, unknown>;

    if (!authResult.uid) {
      throw new Error('Authentication failed');
    }
    console.log(`   ✓ Authenticated as uid: ${authResult.uid}\n`);

    // 2. Load PO files
    const poDir = path.join(__dirname, 'odoo-payroll-translations');
    const poFiles = [
      { file: 'zh_CN.po', lang: 'zh_CN' },
      { file: 'ja_JP.po', lang: 'ja_JP' },
    ];

    for (const { file, lang } of poFiles) {
      console.log(`\n2. Processing ${file}...`);
      const filePath = path.join(poDir, file);

      if (!fs.existsSync(filePath)) {
        console.log(`   ⚠ File not found: ${filePath}`);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const translations = parsePOFile(content);
      console.log(`   Found ${translations.length} translation entries`);

      // 3. Try to import using base.language.import wizard
      console.log(`   Attempting to import via base.language.import...`);
      try {
        // Read file as base64
        const fileData = fs.readFileSync(filePath);
        const base64Data = fileData.toString('base64');

        // Create import wizard
        const wizardId = await callKw(
          'base.language.import',
          'create',
          [{
            name: file,
            code: lang,
            filename: file,
            data: base64Data,
            overwrite: true,
          }],
          {}
        ) as number;

        // Execute import
        await callKw(
          'base.language.import',
          'import_lang',
          [[wizardId]],
          {}
        );

        console.log(`   ✓ Imported ${file} via wizard`);
      } catch (e) {
        console.log(`   Note: Wizard import failed, trying direct method...`);

        // 4. Alternative: Update ir.translation directly
        let updatedCount = 0;
        for (const trans of translations) {
          if (!trans.msgid || !trans.msgstr) continue;

          try {
            // Search for existing translations
            const existing = await callKw(
              'ir.translation',
              'search_read',
              [[
                ['src', '=', trans.msgid],
                ['lang', '=', lang],
              ]],
              { fields: ['id', 'value'], limit: 10 }
            ) as Array<{ id: number; value: string }>;

            if (existing.length > 0) {
              // Update existing translations
              for (const record of existing) {
                if (record.value !== trans.msgstr) {
                  await callKw(
                    'ir.translation',
                    'write',
                    [[record.id], { value: trans.msgstr, state: 'translated' }],
                    {}
                  );
                  updatedCount++;
                }
              }
            }
          } catch (err) {
            // Skip individual errors
          }
        }

        console.log(`   ✓ Updated ${updatedCount} translations directly`);
      }
    }

    // 5. Update model records with translated names (using context)
    console.log('\n3. Updating model records with context-based translations...');

    const targetLangs = ['zh_CN', 'ja_JP'];
    const translationMap: Record<string, Record<string, string>> = {
      // Structures
      'Base Structure': { zh_CN: '基础结构', ja_JP: '基本構造' },
      'Default Structure': { zh_CN: '默认结构', ja_JP: 'デフォルト構造' },
      // Rules
      'Basic Salary': { zh_CN: '基本工资', ja_JP: '基本給' },
      'House Rent Allowance': { zh_CN: '住房津贴', ja_JP: '住宅手当' },
      'Conveyance Allowance': { zh_CN: '交通津贴', ja_JP: '通勤手当' },
      'Special Allowance': { zh_CN: '特别津贴', ja_JP: '特別手当' },
      'Gross Salary': { zh_CN: '应发工资', ja_JP: '総支給額' },
      'Gross': { zh_CN: '应发合计', ja_JP: '総支給額' },
      'Net Salary': { zh_CN: '实发工资', ja_JP: '手取り給与' },
      'Net': { zh_CN: '实发', ja_JP: '手取り' },
      'Provident Fund': { zh_CN: '公积金', ja_JP: '積立金' },
      'Professional Tax': { zh_CN: '专业税', ja_JP: '専門税' },
      // Categories
      'Basic': { zh_CN: '基本', ja_JP: '基本' },
      'Allowance': { zh_CN: '津贴', ja_JP: '手当' },
      'Deduction': { zh_CN: '扣除', ja_JP: '控除' },
      'Company Contribution': { zh_CN: '公司缴费', ja_JP: '会社負担' },
    };

    // Update salary rules
    try {
      const rules = await callKw(
        'hr.salary.rule',
        'search_read',
        [[]],
        { fields: ['id', 'name'], limit: 100 }
      ) as Array<{ id: number; name: string }>;

      for (const rule of rules) {
        const trans = translationMap[rule.name];
        if (trans) {
          for (const lang of targetLangs) {
            if (trans[lang]) {
              await callKw(
                'hr.salary.rule',
                'write',
                [[rule.id], { name: trans[lang] }],
                { context: { lang } }
              );
            }
          }
          console.log(`   ✓ ${rule.name}`);
        }
      }
    } catch (e) {
      console.log('   Note: Could not update salary rules');
    }

    // Update categories
    try {
      const categories = await callKw(
        'hr.salary.rule.category',
        'search_read',
        [[]],
        { fields: ['id', 'name'], limit: 100 }
      ) as Array<{ id: number; name: string }>;

      for (const cat of categories) {
        const trans = translationMap[cat.name];
        if (trans) {
          for (const lang of targetLangs) {
            if (trans[lang]) {
              await callKw(
                'hr.salary.rule.category',
                'write',
                [[cat.id], { name: trans[lang] }],
                { context: { lang } }
              );
            }
          }
          console.log(`   ✓ ${cat.name}`);
        }
      }
    } catch (e) {
      console.log('   Note: Could not update categories');
    }

    console.log('\n==========================================');
    console.log('Import Complete!');
    console.log('==========================================');
    console.log('\nSwitch language to view translations:');
    console.log(`  Chinese: ${ODOO18_CONFIG.baseUrl}/web?lang=zh_CN`);
    console.log(`  Japanese: ${ODOO18_CONFIG.baseUrl}/web?lang=ja_JP`);

  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

main();
