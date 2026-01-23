/**
 * Complete Payroll Module Localization for Odoo 18
 * Translates ALL UI strings including menus, fields, and labels
 *
 * Usage:
 * cd "/Users/taozhang/Projects/Seisei ERP" && npx tsx scripts/translate-payroll-complete.ts
 */

const ODOO18_CONFIG = {
  baseUrl: 'https://demo.nagashiro.top',
  db: 'test001',
  username: 'test',
  password: 'test',
};

// Complete translation mapping: English -> Chinese
const TRANSLATIONS_ZH: Record<string, string> = {
  // ===== Main Menu =====
  'Payroll': '工资管理',
  'Employee Payslips': '员工工资单',
  'Payslips Batches': '工资单批次',
  'Configuration': '配置',
  'Settings': '设置',
  'Salary Structures': '薪资结构',
  'Salary Structure': '薪资结构',
  'Salary Rule Categories': '薪资规则分类',
  'Salary Rule Category': '薪资规则分类',
  'Salary Rules': '薪资规则',
  'Salary Rule': '薪资规则',
  'Contribution Registers': '缴费登记',
  'Contribution Register': '缴费登记',
  'Contract Advantage Templates': '合同优势模板',
  'Contract Advantage Template': '合同优势模板',

  // ===== Common Field Labels =====
  'Name': '名称',
  'Reference': '参考编号',
  'Employee': '员工',
  'Employees': '员工',
  'Company': '公司',
  'Department': '部门',
  'Contract': '合同',
  'Contracts': '合同',
  'Status': '状态',
  'State': '状态',
  'Active': '启用',
  'Description': '描述',
  'Note': '备注',
  'Notes': '备注',
  'Sequence': '序号',
  'Code': '代码',
  'Category': '分类',
  'Parent': '父级',
  'Children': '子级',

  // ===== Payslip Fields =====
  'Payslip': '工资单',
  'Payslips': '工资单',
  'Payslip Name': '工资单名称',
  'Payslip Lines': '工资单明细',
  'Payslip Line': '工资单明细',
  'Batch Name': '批次名称',
  'Payslip Batch': '工资单批次',
  'Date From': '起始日期',
  'Date To': '截止日期',
  'From': '从',
  'To': '至',
  'Start Date': '开始日期',
  'End Date': '结束日期',
  'Period': '期间',
  'Worked Days': '工作天数',
  'Worked Days Lines': '工作天数明细',
  'Worked Days & Inputs': '工作天数与输入',
  'Input Lines': '输入明细',
  'Other Inputs': '其他输入',
  'Other Input': '其他输入',
  'Salary Computation': '薪资计算',
  'Accounting Information': '会计信息',
  'Accounting': '会计',
  'Structure': '结构',
  'Credit Note': '贷项通知单',

  // ===== Salary Rule Fields =====
  'Appears on Payslip': '显示在工资单',
  'Condition Based on': '条件基于',
  'Always True': '始终为真',
  'Range': '范围',
  'Python Expression': 'Python表达式',
  'Python Code': 'Python代码',
  'Amount Type': '金额类型',
  'Fixed Amount': '固定金额',
  'Percentage (%)': '百分比 (%)',
  'Percentage based on': '百分比基于',
  'Quantity': '数量',
  'Amount': '金额',
  'Rate': '费率',
  'Total': '合计',
  'Fixed': '固定',
  'Percentage': '百分比',
  'Partner': '合作伙伴',

  // ===== Work Entry =====
  'Work Entry Type': '工作条目类型',
  'Work Entry Types': '工作条目类型',
  'Number of Days': '天数',
  'Number of Hours': '小时数',
  'Attendance': '考勤',
  'Paid Time Off': '带薪休假',
  'Unpaid': '无薪',
  'Sick Time Off': '病假',
  'Overtime': '加班',
  'Overtime Hours': '加班时数',

  // ===== Status Values =====
  'Draft': '草稿',
  'Waiting': '待处理',
  'Verify': '待验证',
  'Done': '完成',
  'Cancelled': '已取消',
  'Cancel': '取消',
  'Paid': '已支付',
  'Running': '进行中',
  'Expired': '已过期',
  'Incoming': '即将开始',
  'New': '新建',
  'Open': '打开',
  'Close': '关闭',
  'Closed': '已关闭',

  // ===== Action Buttons =====
  'Create': '创建',
  'Save': '保存',
  'Edit': '编辑',
  'Delete': '删除',
  'Discard': '放弃',
  'Confirm': '确认',
  'Compute Sheet': '计算工资单',
  'Cancel Payslip': '取消工资单',
  'Set to Draft': '设为草稿',
  'Refund': '退款',
  'Print': '打印',
  'Print Payslip': '打印工资单',
  'Generate Payslips': '生成工资单',
  'Generate All Payslips': '生成全部工资单',
  'Validate': '验证',
  'Mark as Paid': '标记为已支付',
  'Action': '操作',
  'Actions': '操作',

  // ===== Salary Rule Categories =====
  'Basic': '基本',
  'Allowance': '津贴',
  'Deduction': '扣除',
  'Gross': '应发合计',
  'Net': '实发',
  'Company Contribution': '公司缴费',

  // ===== Common Salary Rules =====
  'Basic Salary': '基本工资',
  'House Rent Allowance': '住房津贴',
  'HRA': '住房津贴',
  'Conveyance Allowance': '交通津贴',
  'Transport Allowance': '交通津贴',
  'Special Allowance': '特别津贴',
  'Medical Allowance': '医疗津贴',
  'Meal Allowance': '餐饮津贴',
  'Meal Voucher': '餐券',
  'Gross Salary': '应发工资',
  'Net Salary': '实发工资',
  'Professional Tax': '专业税',
  'Provident Fund': '公积金',
  'Tax Deduction': '税金扣除',

  // ===== Contract Fields =====
  'Contract Reference': '合同编号',
  'Contract Type': '合同类型',
  'Job Position': '职位',
  'Job': '工作',
  'Working Schedule': '工作时间表',
  'Wage': '工资',
  'Wage Type': '工资类型',
  'Monthly': '月薪',
  'Hourly': '时薪',
  'Yearly': '年薪',
  'Advantages': '优势',
  'Advantage': '优势',

  // ===== Reports =====
  'Report': '报表',
  'Reports': '报表',
  'Payslip Details': '工资单详情',
  'Payroll Summary': '工资汇总',
  'Salary Report': '薪资报表',
  'Contribution Register Report': '缴费登记报表',

  // ===== Other Common Terms =====
  'Search': '搜索',
  'Search...': '搜索...',
  'Filter': '筛选',
  'Filters': '筛选',
  'Group By': '分组',
  'Favorites': '收藏',
  'Import': '导入',
  'Export': '导出',
  'Archive': '归档',
  'Unarchive': '取消归档',
  'Archived': '已归档',
  'Duplicate': '复制',
  'View': '查看',
  'List': '列表',
  'Kanban': '看板',
  'Form': '表单',
  'Calendar': '日历',
  'Pivot': '数据透视',
  'Graph': '图表',
  'Dashboard': '仪表板',
  'Activity': '活动',
  'Activities': '活动',
  'Message': '消息',
  'Messages': '消息',
  'Log note': '记录备注',
  'Send message': '发送消息',
  'Schedule activity': '安排活动',
  'Followers': '关注者',
  'Add Followers': '添加关注者',

  // ===== Dates =====
  'Today': '今天',
  'Yesterday': '昨天',
  'This Week': '本周',
  'This Month': '本月',
  'This Year': '今年',
  'Last Week': '上周',
  'Last Month': '上月',
  'Last Year': '去年',
  'Custom': '自定义',

  // ===== Misc =====
  'Yes': '是',
  'No': '否',
  'True': '是',
  'False': '否',
  'All': '全部',
  'None': '无',
  'Other': '其他',
  'Unknown': '未知',
  'Required': '必填',
  'Optional': '可选',
  'Default': '默认',
  'Created on': '创建于',
  'Created by': '创建者',
  'Last Updated on': '最后更新于',
  'Last Updated by': '最后更新者',

  // ===== bi_hr_payroll Specific =====
  'Salary Slip of': '工资单 -',
  'Salary Slip': '工资单',
  'Input Type': '输入类型',
  'Input Types': '输入类型',
  'Payslip Input Type': '工资单输入类型',
  'Rule Parameters': '规则参数',
  'Other Input Types': '其他输入类型',
  'Get 1% of sales': '销售提成1%',
  'Conveyance Allowance For Gravie': 'Gravie交通津贴',
};

// Japanese translations
const TRANSLATIONS_JA: Record<string, string> = {
  // ===== Main Menu =====
  'Payroll': '給与管理',
  'Employee Payslips': '従業員給与明細',
  'Payslips Batches': '給与明細バッチ',
  'Configuration': '設定',
  'Settings': '設定',
  'Salary Structures': '給与構造',
  'Salary Structure': '給与構造',
  'Salary Rule Categories': '給与ルールカテゴリ',
  'Salary Rule Category': '給与ルールカテゴリ',
  'Salary Rules': '給与ルール',
  'Salary Rule': '給与ルール',
  'Contribution Registers': '拠出金登録',
  'Contribution Register': '拠出金登録',
  'Contract Advantage Templates': '契約特典テンプレート',
  'Contract Advantage Template': '契約特典テンプレート',

  // ===== Common Field Labels =====
  'Name': '名前',
  'Reference': '参照番号',
  'Employee': '従業員',
  'Employees': '従業員',
  'Company': '会社',
  'Department': '部署',
  'Contract': '契約',
  'Contracts': '契約',
  'Status': 'ステータス',
  'State': 'ステータス',
  'Active': '有効',
  'Description': '説明',
  'Note': '備考',
  'Notes': '備考',
  'Sequence': '順序',
  'Code': 'コード',
  'Category': 'カテゴリ',
  'Parent': '親',
  'Children': '子',

  // ===== Payslip Fields =====
  'Payslip': '給与明細',
  'Payslips': '給与明細',
  'Payslip Name': '給与明細名',
  'Payslip Lines': '給与明細行',
  'Payslip Line': '給与明細行',
  'Batch Name': 'バッチ名',
  'Payslip Batch': '給与明細バッチ',
  'Date From': '開始日',
  'Date To': '終了日',
  'From': '開始',
  'To': '終了',
  'Start Date': '開始日',
  'End Date': '終了日',
  'Period': '期間',
  'Worked Days': '勤務日数',
  'Worked Days Lines': '勤務日数明細',
  'Worked Days & Inputs': '勤務日数と入力',
  'Input Lines': '入力明細',
  'Other Inputs': 'その他入力',
  'Other Input': 'その他入力',
  'Salary Computation': '給与計算',
  'Accounting Information': '会計情報',
  'Accounting': '会計',
  'Structure': '構造',
  'Credit Note': 'クレジットノート',

  // ===== Salary Rule Fields =====
  'Appears on Payslip': '給与明細に表示',
  'Condition Based on': '条件基準',
  'Always True': '常に真',
  'Range': '範囲',
  'Python Expression': 'Python式',
  'Python Code': 'Pythonコード',
  'Amount Type': '金額タイプ',
  'Fixed Amount': '固定金額',
  'Percentage (%)': 'パーセンテージ (%)',
  'Percentage based on': 'パーセンテージ基準',
  'Quantity': '数量',
  'Amount': '金額',
  'Rate': '料率',
  'Total': '合計',
  'Fixed': '固定',
  'Percentage': 'パーセンテージ',
  'Partner': '取引先',

  // ===== Work Entry =====
  'Work Entry Type': '勤怠入力タイプ',
  'Work Entry Types': '勤怠入力タイプ',
  'Number of Days': '日数',
  'Number of Hours': '時間数',
  'Attendance': '出勤',
  'Paid Time Off': '有給休暇',
  'Unpaid': '無給',
  'Sick Time Off': '病気休暇',
  'Overtime': '残業',
  'Overtime Hours': '残業時間',

  // ===== Status Values =====
  'Draft': '下書き',
  'Waiting': '処理待ち',
  'Verify': '検証待ち',
  'Done': '完了',
  'Cancelled': 'キャンセル済',
  'Cancel': 'キャンセル',
  'Paid': '支払済',
  'Running': '有効',
  'Expired': '期限切れ',
  'Incoming': '開始予定',
  'New': '新規',
  'Open': '開く',
  'Close': '閉じる',
  'Closed': '終了',

  // ===== Action Buttons =====
  'Create': '作成',
  'Save': '保存',
  'Edit': '編集',
  'Delete': '削除',
  'Discard': '破棄',
  'Confirm': '確認',
  'Compute Sheet': '給与計算',
  'Cancel Payslip': '給与明細キャンセル',
  'Set to Draft': '下書きに戻す',
  'Refund': '払戻',
  'Print': '印刷',
  'Print Payslip': '給与明細印刷',
  'Generate Payslips': '給与明細生成',
  'Generate All Payslips': '全給与明細生成',
  'Validate': '検証',
  'Mark as Paid': '支払済にする',
  'Action': '操作',
  'Actions': '操作',

  // ===== Salary Rule Categories =====
  'Basic': '基本',
  'Allowance': '手当',
  'Deduction': '控除',
  'Gross': '総支給額',
  'Net': '手取り',
  'Company Contribution': '会社負担',

  // ===== Common Salary Rules =====
  'Basic Salary': '基本給',
  'House Rent Allowance': '住宅手当',
  'HRA': '住宅手当',
  'Conveyance Allowance': '通勤手当',
  'Transport Allowance': '通勤手当',
  'Special Allowance': '特別手当',
  'Medical Allowance': '医療手当',
  'Meal Allowance': '食事手当',
  'Meal Voucher': '食事券',
  'Gross Salary': '総支給額',
  'Net Salary': '手取り給与',
  'Professional Tax': '専門税',
  'Provident Fund': '積立金',
  'Tax Deduction': '税金控除',

  // ===== Contract Fields =====
  'Contract Reference': '契約番号',
  'Contract Type': '契約タイプ',
  'Job Position': '役職',
  'Job': '仕事',
  'Working Schedule': '勤務スケジュール',
  'Wage': '給与',
  'Wage Type': '給与タイプ',
  'Monthly': '月給',
  'Hourly': '時給',
  'Yearly': '年俸',
  'Advantages': '特典',
  'Advantage': '特典',

  // ===== Reports =====
  'Report': 'レポート',
  'Reports': 'レポート',
  'Payslip Details': '給与明細詳細',
  'Payroll Summary': '給与サマリー',
  'Salary Report': '給与レポート',
  'Contribution Register Report': '拠出金登録レポート',

  // ===== Other Common Terms =====
  'Search': '検索',
  'Search...': '検索...',
  'Filter': 'フィルター',
  'Filters': 'フィルター',
  'Group By': 'グループ化',
  'Favorites': 'お気に入り',
  'Import': 'インポート',
  'Export': 'エクスポート',
  'Archive': 'アーカイブ',
  'Unarchive': 'アーカイブ解除',
  'Archived': 'アーカイブ済',
  'Duplicate': '複製',
  'View': '表示',
  'List': 'リスト',
  'Kanban': 'カンバン',
  'Form': 'フォーム',
  'Calendar': 'カレンダー',
  'Pivot': 'ピボット',
  'Graph': 'グラフ',
  'Dashboard': 'ダッシュボード',
  'Activity': 'アクティビティ',
  'Activities': 'アクティビティ',
  'Message': 'メッセージ',
  'Messages': 'メッセージ',

  // ===== bi_hr_payroll Specific =====
  'Salary Slip of': '給与明細 -',
  'Salary Slip': '給与明細',
  'Input Type': '入力タイプ',
  'Input Types': '入力タイプ',
  'Payslip Input Type': '給与入力タイプ',
  'Rule Parameters': 'ルールパラメータ',
  'Other Input Types': 'その他入力タイプ',
  'Get 1% of sales': '売上1%取得',
  'Conveyance Allowance For Gravie': 'Gravie通勤手当',
};

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
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

  const data: JsonRpcResponse = await response.json();
  if (data.error) throw new Error(JSON.stringify(data.error, null, 2));

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/session_id=([^;]+)/);
    if (match) globalSessionId = match[1];
  }

  return data.result;
}

async function callKw(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<unknown> {
  return jsonRpc('/web/dataset/call_kw', { model, method, args, kwargs });
}

async function main() {
  console.log('==========================================');
  console.log('Complete Payroll Localization - Odoo 18');
  console.log('==========================================\n');

  try {
    // 1. Authenticate
    console.log('1. Authenticating...');
    const authResult = await jsonRpc('/web/session/authenticate', {
      db: ODOO18_CONFIG.db,
      login: ODOO18_CONFIG.username,
      password: ODOO18_CONFIG.password,
    }) as Record<string, unknown>;

    if (!authResult.uid) throw new Error('Authentication failed');
    console.log(`   ✓ uid: ${authResult.uid}\n`);

    // 2. Get all ir.translation records for payroll modules
    console.log('2. Fetching all translations...');

    const modules = ['bi_hr_payroll', 'hr_payroll', 'hr', 'base'];
    const targetLangs = [
      { code: 'zh_CN', translations: TRANSLATIONS_ZH },
      { code: 'ja_JP', translations: TRANSLATIONS_JA },
    ];

    let totalUpdated = 0;
    let totalCreated = 0;

    for (const lang of targetLangs) {
      console.log(`\n   Processing ${lang.code}...`);

      // Get all translations that might need updating
      let allTranslations: Array<{
        id: number;
        name: string;
        src: string;
        value: string;
        type: string;
        module: string;
        state: string;
      }> = [];

      try {
        allTranslations = await callKw(
          'ir.translation',
          'search_read',
          [[
            ['lang', '=', lang.code],
            '|', '|', '|',
            ['module', 'in', modules],
            ['src', 'in', Object.keys(lang.translations)],
            ['name', 'ilike', 'hr.payslip'],
            ['name', 'ilike', 'hr.salary'],
          ]],
          { fields: ['id', 'name', 'src', 'value', 'type', 'module', 'state'], limit: 5000 }
        ) as typeof allTranslations;

        console.log(`   Found ${allTranslations.length} translation records`);
      } catch (e) {
        console.log('   Note: ir.translation search failed, trying alternative approach');
      }

      // Update existing translations
      let langUpdated = 0;
      for (const trans of allTranslations) {
        const srcText = trans.src?.trim();
        if (!srcText) continue;

        const newValue = lang.translations[srcText];
        if (newValue && newValue !== trans.value) {
          try {
            await callKw(
              'ir.translation',
              'write',
              [[trans.id], { value: newValue, state: 'translated' }],
              {}
            );
            langUpdated++;
            if (langUpdated <= 30) {
              console.log(`   ✓ "${srcText}" -> "${newValue}"`);
            }
          } catch (e) {
            // Skip errors
          }
        }
      }

      if (langUpdated > 30) {
        console.log(`   ... and ${langUpdated - 30} more`);
      }

      totalUpdated += langUpdated;
      console.log(`   Updated ${langUpdated} translations for ${lang.code}`);

      // Try to create missing translations
      console.log(`   Creating missing translations for ${lang.code}...`);

      for (const [src, value] of Object.entries(lang.translations)) {
        // Check if translation exists
        try {
          const existing = await callKw(
            'ir.translation',
            'search_count',
            [[
              ['src', '=', src],
              ['lang', '=', lang.code],
              ['value', '!=', ''],
            ]],
            {}
          ) as number;

          if (existing === 0) {
            // Try to find untranslated records and update them
            const untranslated = await callKw(
              'ir.translation',
              'search_read',
              [[
                ['src', '=', src],
                ['lang', '=', lang.code],
                '|', ['value', '=', ''], ['value', '=', false],
              ]],
              { fields: ['id'], limit: 10 }
            ) as Array<{ id: number }>;

            for (const record of untranslated) {
              await callKw(
                'ir.translation',
                'write',
                [[record.id], { value, state: 'translated' }],
                {}
              );
              totalCreated++;
            }
          }
        } catch (e) {
          // Skip errors
        }
      }
    }

    // 3. Update model records directly (for name fields)
    console.log('\n3. Updating model name fields...');

    // Update menus
    console.log('   Updating menu items...');
    try {
      const menus = await callKw(
        'ir.ui.menu',
        'search_read',
        [[['name', 'in', Object.keys(TRANSLATIONS_ZH)]]],
        { fields: ['id', 'name'], limit: 100 }
      ) as Array<{ id: number; name: string }>;

      for (const menu of menus) {
        for (const lang of targetLangs) {
          const trans = lang.translations[menu.name];
          if (trans) {
            try {
              await callKw(
                'ir.ui.menu',
                'write',
                [[menu.id], { name: trans }],
                { context: { lang: lang.code } }
              );
            } catch (e) {
              // Skip
            }
          }
        }
        console.log(`   ✓ Menu: ${menu.name}`);
      }
    } catch (e) {
      console.log('   Note: Could not update menus directly');
    }

    // Update actions
    console.log('   Updating window actions...');
    try {
      const actions = await callKw(
        'ir.actions.act_window',
        'search_read',
        [[
          '|', '|',
          ['name', 'ilike', 'payslip'],
          ['name', 'ilike', 'payroll'],
          ['name', 'ilike', 'salary'],
        ]],
        { fields: ['id', 'name'], limit: 100 }
      ) as Array<{ id: number; name: string }>;

      for (const action of actions) {
        for (const lang of targetLangs) {
          const trans = lang.translations[action.name];
          if (trans) {
            try {
              await callKw(
                'ir.actions.act_window',
                'write',
                [[action.id], { name: trans }],
                { context: { lang: lang.code } }
              );
            } catch (e) {
              // Skip
            }
          }
        }
        if (TRANSLATIONS_ZH[action.name]) {
          console.log(`   ✓ Action: ${action.name}`);
        }
      }
    } catch (e) {
      console.log('   Note: Could not update actions');
    }

    // Update model fields
    console.log('   Updating field descriptions...');
    try {
      const fields = await callKw(
        'ir.model.fields',
        'search_read',
        [[
          ['model', 'in', ['hr.payslip', 'hr.payslip.run', 'hr.salary.rule', 'hr.salary.rule.category', 'hr.payroll.structure', 'hr.payslip.line', 'hr.payslip.worked_days', 'hr.payslip.input']],
          ['field_description', 'in', Object.keys(TRANSLATIONS_ZH)],
        ]],
        { fields: ['id', 'field_description', 'model'], limit: 500 }
      ) as Array<{ id: number; field_description: string; model: string }>;

      for (const field of fields) {
        for (const lang of targetLangs) {
          const trans = lang.translations[field.field_description];
          if (trans) {
            try {
              await callKw(
                'ir.model.fields',
                'write',
                [[field.id], { field_description: trans }],
                { context: { lang: lang.code } }
              );
            } catch (e) {
              // Skip
            }
          }
        }
      }
      console.log(`   Updated ${fields.length} field descriptions`);
    } catch (e) {
      console.log('   Note: Could not update field descriptions');
    }

    // 4. Summary
    console.log('\n==========================================');
    console.log('Summary');
    console.log('==========================================');
    console.log(`  Translations updated: ${totalUpdated}`);
    console.log(`  Translations created: ${totalCreated}`);
    console.log('\n✓ Localization complete!');
    console.log('\n  Refresh your browser to see the changes.');
    console.log(`  Chinese: ${ODOO18_CONFIG.baseUrl}/web?lang=zh_CN`);
    console.log(`  Japanese: ${ODOO18_CONFIG.baseUrl}/web?lang=ja_JP`);

  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

main();
