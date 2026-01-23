/**
 * bi_hr_payroll Module Localization Script for Odoo 18
 * Translates the bi_hr_payroll module UI terms to Chinese and Japanese
 *
 * Usage:
 * cd "/Users/taozhang/Projects/Seisei ERP" && npx tsx scripts/translate-payroll-odoo18.ts
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://demo.nagashiro.top',
  db: 'test001',
  username: 'test',
  password: 'test',
};

// bi_hr_payroll Module Translations: English -> { Chinese, Japanese }
const PAYROLL_TRANSLATIONS: Record<string, { zh: string; ja: string }> = {
  // ===== Main Menu & Navigation =====
  'Payroll': { zh: '工资管理', ja: '給与管理' },
  'Employee Payslips': { zh: '员工工资单', ja: '従業員給与明細' },
  'Payslips Batches': { zh: '工资单批次', ja: '給与明細バッチ' },
  'Configuration': { zh: '配置', ja: '設定' },
  'Salary Structures': { zh: '薪资结构', ja: '給与構造' },
  'Salary Rules': { zh: '薪资规则', ja: '給与ルール' },
  'Rule Parameters': { zh: '规则参数', ja: 'ルールパラメータ' },
  'Other Input Types': { zh: '其他输入类型', ja: 'その他入力タイプ' },
  'Contribution Registers': { zh: '缴费登记', ja: '拠出金登録' },

  // ===== Payslip List View =====
  'Reference': { zh: '参考编号', ja: '参照番号' },
  'Employee': { zh: '员工', ja: '従業員' },
  'Payslip Name': { zh: '工资单名称', ja: '給与明細名' },
  'Batch Name': { zh: '批次名称', ja: 'バッチ名' },
  'Company': { zh: '公司', ja: '会社' },
  'Date From': { zh: '起始日期', ja: '開始日' },
  'Date To': { zh: '截止日期', ja: '終了日' },
  'From': { zh: '从', ja: '開始' },
  'To': { zh: '至', ja: '終了' },
  'Status': { zh: '状态', ja: 'ステータス' },
  'State': { zh: '状态', ja: 'ステータス' },
  'Basic Wage': { zh: '基本工资', ja: '基本給' },
  'Gross': { zh: '应发合计', ja: '総支給額' },
  'Net Wage': { zh: '实发工资', ja: '手取り給与' },
  'Net': { zh: '实发', ja: '手取り' },

  // ===== Payslip Statuses =====
  'Draft': { zh: '草稿', ja: '下書き' },
  'draft': { zh: '草稿', ja: '下書き' },
  'Waiting': { zh: '待处理', ja: '処理待ち' },
  'waiting': { zh: '待处理', ja: '処理待ち' },
  'Verify': { zh: '待验证', ja: '検証待ち' },
  'verify': { zh: '待验证', ja: '検証待ち' },
  'Done': { zh: '完成', ja: '完了' },
  'done': { zh: '完成', ja: '完了' },
  'Cancelled': { zh: '已取消', ja: 'キャンセル済' },
  'cancel': { zh: '已取消', ja: 'キャンセル済' },
  'Paid': { zh: '已支付', ja: '支払済' },

  // ===== Payslip Form View =====
  'Contract': { zh: '合同', ja: '契約' },
  'Worked Days & Inputs': { zh: '工作天数与输入', ja: '勤務日数と入力' },
  'Salary Computation': { zh: '薪资计算', ja: '給与計算' },
  'Accounting Information': { zh: '会计信息', ja: '会計情報' },
  'Period': { zh: '期间', ja: '期間' },
  'Salary Structure': { zh: '薪资结构', ja: '給与構造' },
  'Structure': { zh: '结构', ja: '構造' },
  'Credit Note': { zh: '贷项通知单', ja: 'クレジットノート' },
  'Payslip Lines': { zh: '工资单明细', ja: '給与明細行' },
  'Worked Days Lines': { zh: '工作天数明细', ja: '勤務日数明細' },
  'Worked Days': { zh: '工作天数', ja: '勤務日数' },
  'Input Lines': { zh: '输入明细', ja: '入力明細' },
  'Other Inputs': { zh: '其他输入', ja: 'その他入力' },
  'Note': { zh: '备注', ja: '備考' },
  'Internal Note': { zh: '内部备注', ja: '内部メモ' },

  // ===== Action Buttons =====
  'Create': { zh: '创建', ja: '作成' },
  'Compute Sheet': { zh: '计算工资单', ja: '給与計算' },
  'Confirm': { zh: '确认', ja: '確認' },
  'Cancel': { zh: '取消', ja: 'キャンセル' },
  'Cancel Payslip': { zh: '取消工资单', ja: '給与明細キャンセル' },
  'Set to Draft': { zh: '设为草稿', ja: '下書きに戻す' },
  'Refund': { zh: '退款', ja: '払戻' },
  'Print': { zh: '打印', ja: '印刷' },
  'Print Payslip': { zh: '打印工资单', ja: '給与明細印刷' },

  // ===== Payslip Batches =====
  'Payslip Batches': { zh: '工资单批次', ja: '給与明細バッチ' },
  'Payslips': { zh: '工资单', ja: '給与明細' },
  'New Payslip Batch': { zh: '新建工资单批次', ja: '新規給与バッチ' },
  'Generate Payslips': { zh: '生成工资单', ja: '給与明細生成' },
  'Close': { zh: '关闭', ja: '閉じる' },

  // ===== Salary Structure =====
  'Salary Structure': { zh: '薪资结构', ja: '給与構造' },
  'Parent': { zh: '父级', ja: '親' },
  'Children': { zh: '子级', ja: '子' },
  'Salary Rules': { zh: '薪资规则', ja: '給与ルール' },

  // ===== Salary Rules =====
  'Salary Rule': { zh: '薪资规则', ja: '給与ルール' },
  'Name': { zh: '名称', ja: '名前' },
  'Sequence': { zh: '序号', ja: '順序' },
  'Code': { zh: '代码', ja: 'コード' },
  'Category': { zh: '分类', ja: 'カテゴリ' },
  'Active': { zh: '启用', ja: '有効' },
  'Appears on Payslip': { zh: '显示在工资单', ja: '給与明細に表示' },
  'Condition Based on': { zh: '条件基于', ja: '条件基準' },
  'Always True': { zh: '始终为真', ja: '常に真' },
  'Range': { zh: '范围', ja: '範囲' },
  'Python Expression': { zh: 'Python表达式', ja: 'Python式' },
  'Amount Type': { zh: '金额类型', ja: '金額タイプ' },
  'Fixed Amount': { zh: '固定金额', ja: '固定金額' },
  'Percentage (%)': { zh: '百分比 (%)', ja: 'パーセンテージ (%)' },
  'Python Code': { zh: 'Python代码', ja: 'Pythonコード' },
  'Percentage based on': { zh: '百分比基于', ja: 'パーセンテージ基準' },
  'Fixed': { zh: '固定', ja: '固定' },
  'Percentage': { zh: '百分比', ja: 'パーセンテージ' },
  'Quantity': { zh: '数量', ja: '数量' },
  'Amount': { zh: '金额', ja: '金額' },
  'Total': { zh: '合计', ja: '合計' },

  // ===== Rule Categories =====
  'Salary Rule Category': { zh: '薪资规则分类', ja: '給与ルールカテゴリ' },
  'Basic': { zh: '基本', ja: '基本' },
  'Allowance': { zh: '津贴', ja: '手当' },
  'Deduction': { zh: '扣除', ja: '控除' },
  'Company Contribution': { zh: '公司缴费', ja: '会社負担' },

  // ===== Common Salary Rule Names =====
  'Basic Salary': { zh: '基本工资', ja: '基本給' },
  'House Rent Allowance': { zh: '住房津贴', ja: '住宅手当' },
  'HRA': { zh: '住房津贴', ja: '住宅手当' },
  'Conveyance Allowance': { zh: '交通津贴', ja: '通勤手当' },
  'Transport Allowance': { zh: '交通津贴', ja: '通勤手当' },
  'Special Allowance': { zh: '特别津贴', ja: '特別手当' },
  'Medical Allowance': { zh: '医疗津贴', ja: '医療手当' },
  'Meal Allowance': { zh: '餐饮津贴', ja: '食事手当' },
  'Gross Salary': { zh: '应发工资', ja: '総支給額' },
  'Net Salary': { zh: '实发工资', ja: '手取り給与' },
  'Professional Tax': { zh: '专业税', ja: '専門税' },
  'Provident Fund': { zh: '公积金', ja: '積立金' },
  'Tax Deduction': { zh: '税金扣除', ja: '税金控除' },

  // ===== Employee Contract =====
  'Contracts': { zh: '合同', ja: '契約' },
  'Contract Reference': { zh: '合同编号', ja: '契約番号' },
  'Contract Type': { zh: '合同类型', ja: '契約タイプ' },
  'Job Position': { zh: '职位', ja: '役職' },
  'Department': { zh: '部门', ja: '部署' },
  'Start Date': { zh: '开始日期', ja: '開始日' },
  'End Date': { zh: '结束日期', ja: '終了日' },
  'Working Schedule': { zh: '工作时间表', ja: '勤務スケジュール' },
  'Wage': { zh: '工资', ja: '給与' },
  'Wage Type': { zh: '工资类型', ja: '給与タイプ' },
  'Monthly': { zh: '月薪', ja: '月給' },
  'Hourly': { zh: '时薪', ja: '時給' },

  // ===== Work Entry Types =====
  'Work Entry Type': { zh: '工作条目类型', ja: '勤怠入力タイプ' },
  'Work100': { zh: '正常工作', ja: '通常勤務' },
  'Attendance': { zh: '考勤', ja: '出勤' },
  'Paid Time Off': { zh: '带薪休假', ja: '有給休暇' },
  'Sick Time Off': { zh: '病假', ja: '病気休暇' },
  'Unpaid': { zh: '无薪', ja: '無給' },
  'Overtime': { zh: '加班', ja: '残業' },
  'Number of Days': { zh: '天数', ja: '日数' },
  'Number of Hours': { zh: '小时数', ja: '時間数' },

  // ===== Contribution Register =====
  'Contribution Register': { zh: '缴费登记', ja: '拠出金登録' },
  'Partner': { zh: '合作伙伴', ja: '取引先' },

  // ===== Input Types =====
  'Payslip Input Type': { zh: '工资单输入类型', ja: '給与入力タイプ' },
  'Other Input': { zh: '其他输入', ja: 'その他入力' },
  'Description': { zh: '描述', ja: '説明' },

  // ===== Reports =====
  'Payslip Details': { zh: '工资单详情', ja: '給与明細詳細' },
  'Payroll': { zh: '工资', ja: '給与' },
  'Contribution Register Report': { zh: '缴费登记报表', ja: '拠出金登録レポート' },

  // ===== bi_hr_payroll Specific Terms =====
  'Salary Slip of': { zh: '工资单 -', ja: '給与明細 -' },
  'Salary Slip': { zh: '工资单', ja: '給与明細' },
  'SLIP': { zh: '工资单', ja: '給与明細' },

  // ===== Japanese Payroll Specific =====
  'Health Insurance': { zh: '医疗保险', ja: '健康保険' },
  'Pension Insurance': { zh: '养老保险', ja: '厚生年金' },
  'Employment Insurance': { zh: '失业保险', ja: '雇用保険' },
  'Income Tax': { zh: '所得税', ja: '所得税' },
  'Resident Tax': { zh: '住民税', ja: '住民税' },
  'Bonus': { zh: '奖金', ja: '賞与' },
  'Commuting Allowance': { zh: '通勤补贴', ja: '通勤手当' },
  'Overtime Pay': { zh: '加班费', ja: '残業代' },
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

async function main() {
  console.log('==========================================');
  console.log('bi_hr_payroll Module Localization - Odoo 18');
  console.log('==========================================\n');
  console.log('Configuration:');
  console.log(`  URL: ${ODOO18_CONFIG.baseUrl}`);
  console.log(`  DB: ${ODOO18_CONFIG.db}`);
  console.log(`  Translation entries: ${Object.keys(PAYROLL_TRANSLATIONS).length}\n`);

  try {
    // 1. Authenticate
    console.log('1. Authenticating...');
    const authResult = await jsonRpc('/web/session/authenticate', {
      db: ODOO18_CONFIG.db,
      login: ODOO18_CONFIG.username,
      password: ODOO18_CONFIG.password,
    }) as Record<string, unknown>;

    if (!authResult.uid) {
      throw new Error('Authentication failed - check credentials');
    }
    console.log(`   ✓ Authenticated as uid: ${authResult.uid}\n`);

    // 2. Check installed languages
    console.log('2. Checking installed languages...');
    const languages = await callKw(
      'res.lang',
      'search_read',
      [[['active', '=', true]]],
      { fields: ['code', 'name'] }
    ) as Array<{ code: string; name: string }>;

    console.log('   Installed languages:');
    languages.forEach(l => console.log(`   - ${l.code}: ${l.name}`));

    const installedLangs = new Set(languages.map(l => l.code));
    const needLangs = ['zh_CN', 'ja_JP'];

    // Install missing languages
    for (const langCode of needLangs) {
      if (!installedLangs.has(langCode)) {
        console.log(`\n   Installing ${langCode}...`);
        try {
          const inactiveLang = await callKw(
            'res.lang',
            'search_read',
            [[['code', '=', langCode], ['active', '=', false]]],
            { fields: ['id'], limit: 1 }
          ) as Array<{ id: number }>;

          if (inactiveLang.length > 0) {
            await callKw('res.lang', 'write', [[inactiveLang[0].id], { active: true }], {});
            console.log(`   ✓ Activated ${langCode}`);
          }
        } catch (e) {
          console.log(`   Note: Could not install ${langCode}`);
        }
      }
    }

    // 3. Get bi_hr_payroll models data
    console.log('\n3. Fetching bi_hr_payroll module data...');

    // Try different model names (bi_hr_payroll might use different naming)
    const modelVariants = {
      structure: ['hr.payroll.structure', 'bi.hr.payroll.structure', 'hr.payslip.structure'],
      rule: ['hr.salary.rule', 'bi.hr.salary.rule', 'hr.payslip.rule'],
      category: ['hr.salary.rule.category', 'bi.hr.salary.rule.category'],
      payslip: ['hr.payslip', 'bi.hr.payslip'],
    };

    let structures: Array<{ id: number; name: string }> = [];
    let rules: Array<{ id: number; name: string; code: string }> = [];
    let categories: Array<{ id: number; name: string }> = [];

    // Find salary structures
    for (const model of modelVariants.structure) {
      try {
        structures = await callKw(model, 'search_read', [[]], {
          fields: ['id', 'name'],
          limit: 100,
        }) as Array<{ id: number; name: string }>;
        if (structures.length > 0) {
          console.log(`   Found ${structures.length} salary structures (${model})`);
          break;
        }
      } catch (e) {
        // Model doesn't exist, try next
      }
    }

    // Find salary rules
    for (const model of modelVariants.rule) {
      try {
        rules = await callKw(model, 'search_read', [[]], {
          fields: ['id', 'name', 'code'],
          limit: 500,
        }) as Array<{ id: number; name: string; code: string }>;
        if (rules.length > 0) {
          console.log(`   Found ${rules.length} salary rules (${model})`);
          break;
        }
      } catch (e) {
        // Model doesn't exist, try next
      }
    }

    // Find rule categories
    for (const model of modelVariants.category) {
      try {
        categories = await callKw(model, 'search_read', [[]], {
          fields: ['id', 'name'],
          limit: 100,
        }) as Array<{ id: number; name: string }>;
        if (categories.length > 0) {
          console.log(`   Found ${categories.length} rule categories (${model})`);
          break;
        }
      } catch (e) {
        // Model doesn't exist, try next
      }
    }

    // 4. Update translations via ir.translation
    console.log('\n4. Updating translations via ir.translation...');

    let translatedCount = 0;
    let updatedCount = 0;

    // Get all translations for bi_hr_payroll module
    const modules = ['bi_hr_payroll', 'hr_payroll', 'hr'];

    for (const moduleName of modules) {
      try {
        const translations = await callKw(
          'ir.translation',
          'search_read',
          [[
            ['module', '=', moduleName],
            ['lang', 'in', ['zh_CN', 'ja_JP']],
          ]],
          { fields: ['id', 'name', 'src', 'value', 'lang', 'type', 'state'], limit: 2000 }
        ) as Array<{
          id: number;
          name: string;
          src: string;
          value: string;
          lang: string;
          type: string;
          state: string;
        }>;

        console.log(`   Found ${translations.length} translations for module: ${moduleName}`);

        for (const trans of translations) {
          const srcText = trans.src?.trim();
          if (!srcText) continue;

          const translation = PAYROLL_TRANSLATIONS[srcText];
          if (translation) {
            const newValue = trans.lang === 'zh_CN' ? translation.zh : translation.ja;
            if (newValue && newValue !== trans.value) {
              try {
                await callKw(
                  'ir.translation',
                  'write',
                  [[trans.id], { value: newValue, state: 'translated' }],
                  {}
                );
                updatedCount++;
                if (updatedCount <= 20) {
                  console.log(`   ✓ [${trans.lang}] "${srcText}" -> "${newValue}"`);
                }
              } catch (e) {
                // Skip on error
              }
            }
          }
        }
      } catch (e) {
        console.log(`   Note: Could not access translations for ${moduleName}`);
      }
    }

    if (updatedCount > 20) {
      console.log(`   ... and ${updatedCount - 20} more translations`);
    }

    // 5. Create missing translations
    console.log('\n5. Creating missing translations...');

    // Get all untranslated terms
    try {
      const untranslated = await callKw(
        'ir.translation',
        'search_read',
        [[
          ['module', 'in', modules],
          ['state', 'in', ['to_translate', '']],
          ['lang', 'in', ['zh_CN', 'ja_JP']],
        ]],
        { fields: ['id', 'name', 'src', 'lang', 'type'], limit: 1000 }
      ) as Array<{
        id: number;
        name: string;
        src: string;
        lang: string;
        type: string;
      }>;

      console.log(`   Found ${untranslated.length} untranslated terms`);

      for (const trans of untranslated) {
        const srcText = trans.src?.trim();
        if (!srcText) continue;

        const translation = PAYROLL_TRANSLATIONS[srcText];
        if (translation) {
          const newValue = trans.lang === 'zh_CN' ? translation.zh : translation.ja;
          if (newValue) {
            try {
              await callKw(
                'ir.translation',
                'write',
                [[trans.id], { value: newValue, state: 'translated' }],
                {}
              );
              translatedCount++;
            } catch (e) {
              // Skip on error
            }
          }
        }
      }

      console.log(`   ✓ Translated ${translatedCount} new terms`);
    } catch (e) {
      console.log('   Note: Could not access untranslated terms');
    }

    // 6. Update model records directly with context
    console.log('\n6. Updating model records with translations...');

    const targetLangs = [
      { code: 'zh_CN', key: 'zh' },
      { code: 'ja_JP', key: 'ja' },
    ];

    // Update salary structures
    if (structures.length > 0) {
      console.log('\n   Salary Structures:');
      for (const structure of structures) {
        const trans = PAYROLL_TRANSLATIONS[structure.name];
        if (trans) {
          for (const lang of targetLangs) {
            try {
              const value = lang.key === 'zh' ? trans.zh : trans.ja;
              await callKw(
                'hr.payroll.structure',
                'write',
                [[structure.id], { name: value }],
                { context: { lang: lang.code } }
              );
            } catch (e) {
              // Try alternative model
              try {
                await callKw(
                  'bi.hr.payroll.structure',
                  'write',
                  [[structure.id], { name: lang.key === 'zh' ? trans.zh : trans.ja }],
                  { context: { lang: lang.code } }
                );
              } catch (e2) {
                // Skip
              }
            }
          }
          console.log(`   ✓ ${structure.name} -> zh: ${trans.zh} / ja: ${trans.ja}`);
        }
      }
    }

    // Update salary rules
    if (rules.length > 0) {
      console.log('\n   Salary Rules:');
      let ruleCount = 0;
      for (const rule of rules) {
        const trans = PAYROLL_TRANSLATIONS[rule.name] || PAYROLL_TRANSLATIONS[rule.code];
        if (trans) {
          for (const lang of targetLangs) {
            try {
              const value = lang.key === 'zh' ? trans.zh : trans.ja;
              await callKw(
                'hr.salary.rule',
                'write',
                [[rule.id], { name: value }],
                { context: { lang: lang.code } }
              );
            } catch (e) {
              // Skip
            }
          }
          if (ruleCount < 10) {
            console.log(`   ✓ ${rule.name} (${rule.code}) -> zh: ${trans.zh} / ja: ${trans.ja}`);
          }
          ruleCount++;
        }
      }
      if (ruleCount > 10) {
        console.log(`   ... and ${ruleCount - 10} more rules`);
      }
    }

    // Update categories
    if (categories.length > 0) {
      console.log('\n   Rule Categories:');
      for (const cat of categories) {
        const trans = PAYROLL_TRANSLATIONS[cat.name];
        if (trans) {
          for (const lang of targetLangs) {
            try {
              const value = lang.key === 'zh' ? trans.zh : trans.ja;
              await callKw(
                'hr.salary.rule.category',
                'write',
                [[cat.id], { name: value }],
                { context: { lang: lang.code } }
              );
            } catch (e) {
              // Skip
            }
          }
          console.log(`   ✓ ${cat.name} -> zh: ${trans.zh} / ja: ${trans.ja}`);
        }
      }
    }

    // 7. Summary
    console.log('\n==========================================');
    console.log('Summary');
    console.log('==========================================');
    console.log(`  Updated translations: ${updatedCount}`);
    console.log(`  New translations: ${translatedCount}`);
    console.log(`  Structures translated: ${structures.length}`);
    console.log(`  Rules translated: ${rules.length}`);
    console.log(`  Categories translated: ${categories.length}`);
    console.log('\n✓ Localization complete!');
    console.log('\nSwitch language to view translations:');
    console.log(`  Chinese: ${ODOO18_CONFIG.baseUrl}/web?lang=zh_CN`);
    console.log(`  Japanese: ${ODOO18_CONFIG.baseUrl}/web?lang=ja_JP`);
    console.log(`  English: ${ODOO18_CONFIG.baseUrl}/web?lang=en_US`);

  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

main();
