/**
 * Cash Ledger (現金出納簿) - Fixed Categories
 * End-of-Day Cash Entry System
 *
 * Integrates with Odoo 18 account.move (draft entries)
 * No Odoo modifications - only creates data via existing models
 */

export const CASH_LEDGER_REF_PREFIX = 'SEISEI_CASH_EOD';

// Category types
export type CategoryType = 'NORMAL' | 'TRANSFER';
export type CategoryDirection = 'IN' | 'OUT';

export interface CashCategory {
  code: string;
  nameJa: string;
  nameZh: string;
  nameEn: string;
  direction: CategoryDirection;
  type: CategoryType;
  sortOrder: number;
}

// ========================
// 入金（IN）Categories
// ========================
export const IN_CATEGORIES: CashCategory[] = [
  {
    code: 'CASH_SALES',
    nameJa: '現金売上高',
    nameZh: '现金销售',
    nameEn: 'Cash Sales',
    direction: 'IN',
    type: 'NORMAL',
    sortOrder: 1,
  },
  {
    code: 'MISC_INCOME',
    nameJa: '雑収入',
    nameZh: '杂项收入',
    nameEn: 'Miscellaneous Income',
    direction: 'IN',
    type: 'NORMAL',
    sortOrder: 2,
  },
  {
    code: 'AR_COLLECTION',
    nameJa: '売掛金入金',
    nameZh: '应收账款收款',
    nameEn: 'A/R Collection',
    direction: 'IN',
    type: 'NORMAL',
    sortOrder: 3,
  },
  {
    code: 'OWNER_LOAN_IN',
    nameJa: '事業主借',
    nameZh: '业主借入',
    nameEn: "Owner's Loan In",
    direction: 'IN',
    type: 'NORMAL',
    sortOrder: 4,
  },
  {
    code: 'BANK_TO_CASH_TOZA',
    nameJa: '当座預金引出',
    nameZh: '活期存款取出',
    nameEn: 'Current Account Withdrawal',
    direction: 'IN',
    type: 'TRANSFER',
    sortOrder: 5,
  },
  {
    code: 'BANK_TO_CASH_FUTSU',
    nameJa: '普通預金引出',
    nameZh: '储蓄存款取出',
    nameEn: 'Savings Account Withdrawal',
    direction: 'IN',
    type: 'TRANSFER',
    sortOrder: 6,
  },
];

// ========================
// 出金（OUT）Categories
// ========================
export const OUT_CATEGORIES: CashCategory[] = [
  {
    code: 'CASH_PURCHASE',
    nameJa: '現金仕入高',
    nameZh: '现金采购',
    nameEn: 'Cash Purchases',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 1,
  },
  {
    code: 'TAXES_DUTIES',
    nameJa: '租税公課',
    nameZh: '税费',
    nameEn: 'Taxes & Duties',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 2,
  },
  {
    code: 'PACKING_FREIGHT',
    nameJa: '荷造運賃',
    nameZh: '包装运费',
    nameEn: 'Packing & Freight',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 3,
  },
  {
    code: 'UTILITIES',
    nameJa: '水道光熱費',
    nameZh: '水电费',
    nameEn: 'Utilities',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 4,
  },
  {
    code: 'TRAVEL',
    nameJa: '旅費交通費',
    nameZh: '差旅交通费',
    nameEn: 'Travel & Transportation',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 5,
  },
  {
    code: 'COMMUNICATION',
    nameJa: '通信費',
    nameZh: '通信费',
    nameEn: 'Communication',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 6,
  },
  {
    code: 'ENTERTAINMENT',
    nameJa: '接待交際費',
    nameZh: '招待费',
    nameEn: 'Entertainment',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 7,
  },
  {
    code: 'CONSUMABLES',
    nameJa: '消耗品費',
    nameZh: '消耗品',
    nameEn: 'Consumables',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 8,
  },
  {
    code: 'WAGES',
    nameJa: '給料賃金',
    nameZh: '工资',
    nameEn: 'Wages & Salaries',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 9,
  },
  {
    code: 'RENT',
    nameJa: '地代家賃',
    nameZh: '租金',
    nameEn: 'Rent',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 10,
  },
  {
    code: 'MISCELLANEOUS',
    nameJa: '雑費',
    nameZh: '杂费',
    nameEn: 'Miscellaneous',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 11,
  },
  {
    code: 'AP_PAYMENT',
    nameJa: '買掛金支払',
    nameZh: '应付账款',
    nameEn: 'A/P Payment',
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 12,
  },
  {
    code: 'CASH_TO_BANK_TOZA',
    nameJa: '当座預金預入',
    nameZh: '活期存款存入',
    nameEn: 'Current Account Deposit',
    direction: 'OUT',
    type: 'TRANSFER',
    sortOrder: 13,
  },
  {
    code: 'CASH_TO_BANK_FUTSU',
    nameJa: '普通預金預入',
    nameZh: '储蓄存款存入',
    nameEn: 'Savings Account Deposit',
    direction: 'OUT',
    type: 'TRANSFER',
    sortOrder: 14,
  },
  {
    code: 'OWNER_DRAWING',
    nameJa: '事業主貸',
    nameZh: '业主借款',
    nameEn: "Owner's Drawing",
    direction: 'OUT',
    type: 'NORMAL',
    sortOrder: 15,
  },
];

// All categories combined
export const ALL_CASH_CATEGORIES = [...IN_CATEGORIES, ...OUT_CATEGORIES];

// Get category by code
export function getCategoryByCode(code: string): CashCategory | undefined {
  return ALL_CASH_CATEGORIES.find(c => c.code === code);
}

// Get category name by locale
export function getCategoryName(category: CashCategory, locale: string): string {
  switch (locale) {
    case 'ja':
      return category.nameJa;
    case 'zh':
      return category.nameZh;
    default:
      return category.nameEn;
  }
}

// Build ref string for account.move
export function buildMoveRef(date: string, categoryCode: string, direction: CategoryDirection): string {
  return `${CASH_LEDGER_REF_PREFIX}|DATE=${date}|CAT=${categoryCode}|DIR=${direction}|LEDGER=CASH`;
}

// Parse ref string
export function parseMoveRef(ref: string): { date: string; categoryCode: string; direction: string } | null {
  if (!ref.startsWith(CASH_LEDGER_REF_PREFIX)) return null;

  const dateMatch = ref.match(/DATE=(\d{4}-\d{2}-\d{2})/);
  const catMatch = ref.match(/CAT=([A-Z_]+)/);
  const dirMatch = ref.match(/DIR=(IN|OUT)/);

  if (!dateMatch || !catMatch || !dirMatch) return null;

  return {
    date: dateMatch[1],
    categoryCode: catMatch[1],
    direction: dirMatch[1],
  };
}

// Settings interface for account mapping
export interface CashLedgerSettings {
  cashJournalId: number;
  cashAccountId: number;
  bankJournalIdToza: number;
  bankAccountIdToza: number;
  bankJournalIdFutsu: number;
  bankAccountIdFutsu: number;
  accountMappings: Record<string, number>; // categoryCode -> accountId
}

// Entry data for submission
export interface CashEntryLine {
  categoryCode: string;
  amount: number;
  attachments?: { name: string; data: string; mimetype: string }[];
}

export interface CashEntrySubmission {
  date: string;
  openingBalance?: number;
  inEntries: CashEntryLine[];
  outEntries: CashEntryLine[];
}
