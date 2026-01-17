/**
 * Module Definitions
 * This file contains only module constants and can be safely imported in client components.
 * For database operations, use features.ts (server-only)
 */

import type { ModuleCode } from '@prisma/client';

export interface ModuleInfo {
  code: ModuleCode;
  name: string;
  nameZh: string;
  nameJa: string;
  icon: string;
  path: string;
  description?: string;
  /**
   * Whether this is a premium module that requires additional subscription
   * Premium modules are always visible but locked if not subscribed
   */
  isPremium?: boolean;
  /**
   * Price per month in JPY (for display purposes)
   */
  priceMonthly?: number;
  /**
   * Whether this module is hidden from the UI (for unreleased features)
   */
  isHidden?: boolean;
}

// All available modules
// Core modules are included in base subscription
// Premium modules require additional subscription
export const ALL_MODULES: ModuleInfo[] = [
  // === Core Modules (included in base plan) ===
  { code: 'DASHBOARD', name: 'Dashboard', nameZh: '数据看板', nameJa: 'ダッシュボード', icon: 'BarChart3', path: '/dashboard' },
  { code: 'POS', name: 'POS', nameZh: 'POS', nameJa: 'POS', icon: 'ShoppingCart', path: '/pos' },
  { code: 'INVENTORY', name: 'Inventory', nameZh: '库存', nameJa: '在庫', icon: 'Package', path: '/inventory' },
  { code: 'PURCHASE', name: 'Purchase', nameZh: '采购', nameJa: '仕入', icon: 'ShoppingBag', path: '/purchase' },
  { code: 'SALES', name: 'Sales', nameZh: '销售', nameJa: '販売', icon: 'TrendingUp', path: '/sales' },
  { code: 'CONTACTS', name: 'Contacts', nameZh: '联系人', nameJa: '連絡先', icon: 'Contact', path: '/contacts' },
  { code: 'ACCOUNTING', name: 'Expenses', nameZh: '收支', nameJa: '収支', icon: 'Receipt', path: '/accounting' },

  // === Premium Modules (require additional subscription) ===
  // NOTE: All premium modules hidden for Apple App Store review
  // Remove isHidden after approval to enable premium features
  { code: 'QR_ORDERING', name: 'Table Service', nameZh: '桌台服务', nameJa: 'テーブルサービス', icon: 'QrCode', path: '/pos/tables', isPremium: true, priceMonthly: 2980, description: 'QR ordering and table management', isHidden: true },
  { code: 'ANALYTICS', name: 'Analytics', nameZh: '高级数据分析', nameJa: '高度分析', icon: 'LineChart', path: '/analytics', isPremium: true, priceMonthly: 12800, description: 'BI module with advanced analytics features', isHidden: true },
  { code: 'CRM', name: 'CRM', nameZh: 'CRM', nameJa: 'CRM', icon: 'Users', path: '/crm', isPremium: true, priceMonthly: 9800, description: 'Customer relationship management', isHidden: true },
  { code: 'FINANCE', name: 'Finance', nameZh: '财务', nameJa: '財務', icon: 'FileText', path: '/finance', isPremium: true, priceMonthly: 9800, description: 'Advanced financial management', isHidden: true },
  { code: 'HR', name: 'Payroll', nameZh: '工资', nameJa: '給与', icon: 'UserCog', path: '/hr', isPremium: true, priceMonthly: 6800, description: 'Payroll and HR management', isHidden: true },
];

// Get only core modules (excluding hidden)
export const CORE_MODULES = ALL_MODULES.filter(m => !m.isPremium && !m.isHidden);

// Get only premium modules (excluding hidden)
export const PREMIUM_MODULES = ALL_MODULES.filter(m => m.isPremium && !m.isHidden);

// Get module info by code
export function getModuleInfo(code: ModuleCode): ModuleInfo | undefined {
  return ALL_MODULES.find(m => m.code === code);
}
