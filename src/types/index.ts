/**
 * Shared TypeScript types
 */

import { ModuleCode } from '@prisma/client';

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

// Auth types
export interface LoginRequest {
  tenantCode: string;
  username: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    displayName: string;
    email: string | null;
    isAdmin: boolean;
  };
  tenant: {
    id: string;
    tenantCode: string;
    name: string;
  };
}

export interface CurrentUser {
  id: string;
  tenantId: string;
  odooUserId: number;
  odooLogin: string;
  displayName: string;
  email: string | null;
  isAdmin: boolean;
  tenant: {
    id: string;
    tenantCode: string;
    name: string;
    planCode: string;
  };
}

// Module types
export interface VisibleModule {
  code: ModuleCode;
  name: string;
  icon: string;
  path: string;
}

// POS types
export interface PosCategory {
  id: number;
  name: string;
  parent_id: [number, string] | false;
  sequence: number;
  image_128: string | false;
}

export interface PosProduct {
  id: number;
  name: string;
  default_code: string | false;
  list_price: number;
  pos_categ_ids: number[];
  available_in_pos: boolean;
  active: boolean;
  sale_ok: boolean;
  is_favorite: boolean; // Custom field for recommendations
  image_128: string | false;
}

export interface PosOrder {
  id: number;
  name: string;
  date_order: string;
  partner_id: [number, string] | false;
  amount_total: number;
  amount_tax: number;
  amount_paid: number;
  state: 'draft' | 'paid' | 'done' | 'invoiced' | 'cancel';
  lines: PosOrderLine[];
}

export interface PosOrderLine {
  id: number;
  product_id: [number, string];
  full_product_name: string;
  qty: number;
  price_unit: number;
  price_subtotal: number;
  price_subtotal_incl: number;
  discount: number;
}

// POS Consumption types
export interface IngredientConsumption {
  id: number;
  name: string;
  consumed: number;
  unit: string;
  remaining: number;
  minStock: number;
}

export interface DishConsumption {
  id: number;
  name: string;
  soldCount: number;
  ingredients: IngredientConsumption[];
}

export interface ConsumptionData {
  summary: {
    totalDishes: number;
    totalIngredients: number;
    lowStockItems: number;
  };
  byDish: DishConsumption[];
}

// POS Replenishment types
export interface ReplenishmentItem {
  id: number;
  name: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  avgDailyUsage: number;
  daysRemaining: number;
  suggestedQty: number;
  status: 'critical' | 'warning';
  supplier: string;
  unitPrice: number;
  lastOrderDate: string | null;
}

export interface PendingPurchaseOrder {
  id: string;
  odooId: number;
  supplier: string;
  items: number;
  totalAmount: number;
  status: string;
  createdAt: string;
}

export interface ReplenishmentData {
  summary: {
    criticalItems: number;
    warningItems: number;
    pendingOrders: number;
    totalSuggested: number;
  };
  items: ReplenishmentItem[];
  pendingOrders: PendingPurchaseOrder[];
}

// Dashboard types
export interface SalesSummary {
  date: string;
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
}

export interface ProductRanking {
  productId: number;
  productName: string;
  totalQty: number;
  totalAmount: number;
}

export interface DashboardData {
  todaySales: SalesSummary;
  monthSales: SalesSummary;
  productRanking: ProductRanking[];
  salesTrend: SalesSummary[];
}

// Expense types
export interface Expense {
  id: number;
  name: string;
  employee_id: [number, string];
  product_id: [number, string] | false;
  total_amount: number;
  currency_id: [number, string];
  date: string;
  state: 'draft' | 'reported' | 'approved' | 'done' | 'refused';
  description: string | false;
  sheet_id: [number, string] | false;
}

export interface ExpenseSheet {
  id: number;
  name: string;
  employee_id: [number, string];
  expense_line_ids: number[];
  total_amount: number;
  state: 'draft' | 'submit' | 'approve' | 'post' | 'done' | 'cancel';
}

// Purchase types
export interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: [number, string];
  date_order: string;
  amount_total: number;
  state: 'draft' | 'sent' | 'to approve' | 'purchase' | 'done' | 'cancel';
  order_line: number[];
}
