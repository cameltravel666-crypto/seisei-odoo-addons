import type { BillingKpis, RecentItem } from '@/components/billing';

/**
 * Mock data for landing page (/try-ocr)
 * デモ用のサンプルデータ
 */
export const mockKpis: BillingKpis = {
  arOpenCount: 7,           // 未回収（売上側）
  arOverdueCount: 3,        // 期限超過（売上側）
  arBalance: 458000,        // 売掛残高
  apOpenCount: 5,           // 未払（仕入側）
  apOverdueCount: 2,        // 期限超過（仕入側）
  apBalance: 312000,        // 買掛残高
  expensePendingCount: 4,   // 未精算
  expenseApprovalCount: 2,  // 承認待ち
};

export const mockRecentItems: RecentItem[] = [
  {
    id: '1',
    category: 'sales',
    docNo: 'INV/2026/00015',
    partnerName: '株式会社サンプル商事',
    amount: 125000,
    date: '2026-01-24',
    statusLabel: '延滞',
    statusTone: 'danger',
  },
  {
    id: '2',
    category: 'purchase',
    docNo: 'BILL/2026/00042',
    partnerName: 'ABC株式会社',
    amount: 89000,
    date: '2026-01-23',
    statusLabel: '未払',
    statusTone: 'warning',
  },
  {
    id: '3',
    category: 'expense',
    docNo: 'EXP/2026/00008',
    partnerName: '山田太郎',
    amount: 15800,
    date: '2026-01-22',
    statusLabel: '承認待ち',
    statusTone: 'warning',
  },
  {
    id: '4',
    category: 'sales',
    docNo: 'INV/2026/00014',
    partnerName: 'テスト株式会社',
    amount: 78000,
    date: '2026-01-21',
    statusLabel: '入金済',
    statusTone: 'success',
  },
  {
    id: '5',
    category: 'purchase',
    docNo: 'BILL/2026/00041',
    partnerName: 'XYZ工業',
    amount: 234000,
    date: '2026-01-20',
    statusLabel: '延滞',
    statusTone: 'danger',
  },
];
