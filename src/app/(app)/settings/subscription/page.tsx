'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loading } from '@/components/ui/loading';
import {
  Package,
  Plus,
  Minus,
  ShoppingCart,
  X,
  Calendar,
  Receipt,
  Clock,
  AlertCircle,
  Check,
  Sparkles,
  Crown,
  Building2,
  Server,
  Wrench,
  HardDrive,
  ExternalLink,
  CreditCard,
  Settings,
} from 'lucide-react';

// Product category info
const CATEGORY_INFO: Record<string, { icon: React.ReactNode; label: string; labelZh: string }> = {
  PLAN: { icon: <Crown className="w-5 h-5" />, label: 'Base Plans', labelZh: 'Base Plans' },
  MODULE: { icon: <Sparkles className="w-5 h-5" />, label: 'Modules', labelZh: 'Modules' },
  TERMINAL: { icon: <Server className="w-5 h-5" />, label: 'Terminals', labelZh: 'Terminals' },
  MAINTENANCE: { icon: <Wrench className="w-5 h-5" />, label: 'Maintenance', labelZh: 'Maintenance' },
  ONBOARDING: { icon: <Building2 className="w-5 h-5" />, label: 'Onboarding', labelZh: 'Onboarding' },
  RENTAL: { icon: <HardDrive className="w-5 h-5" />, label: 'Hardware Rental', labelZh: 'Hardware Rental' },
};

interface Product {
  id: string;
  productCode: string;
  name: string;
  nameZh: string | null;
  nameJa: string | null;
  description: string | null;
  descriptionZh: string | null;
  descriptionJa: string | null;
  productType: string;
  category: string;
  priceMonthly: number;
  priceYearly: number | null;
  includedModules: string[];
  enablesModule: string | null;
  maxUsers: number | null;
  maxTerminals: number | null;
  trialDays: number;
  odoo19ProductId: number | null;
}

interface SubscriptionItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  productNameZh: string | null;
  productNameJa: string | null;
  productType: string;
  category: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  status: string;
  startDate: string;
  endDate: string | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
}

interface Subscription {
  id: string;
  status: string;
  startDate: string;
  nextBillingDate: string;
  endDate: string | null;
  totalAmount: number;
  currency: string;
  billingCycle: string;
  isInTrial: boolean;
  trialEndDate?: string;
  autoRenew: boolean;
  items: SubscriptionItem[];
  invoices: Invoice[];
}

interface SubscriptionData {
  tenant: {
    id: string;
    tenantCode: string;
    name: string;
    planCode: string;
    odoo19PartnerId: number | null;
  };
  subscription: Subscription | null;
  features: Array<{
    moduleCode: string;
    isAllowed: boolean;
    isVisible: boolean;
  }>;
  enabledModules: string[];
}

interface CartItem {
  productId: string;
  product: Product;
  quantity: number;
}

export default function SubscriptionPage() {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('PLAN');

  // Note: Subscription management is restricted to BILLING_ADMIN role on the server.
  // Read-only viewing is allowed for all authenticated users.

  // Fetch current subscription
  const { data: subscriptionData, isLoading: isLoadingSub } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await fetch('/api/subscription');
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data as SubscriptionData;
    },
  });

  // Fetch available products
  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['subscription-products'],
    queryFn: async () => {
      const res = await fetch('/api/subscription/products');
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data as { products: Product[]; grouped: Record<string, Product[]>; categories: string[] };
    },
  });

  // Create subscription mutation
  const createSubscriptionMutation = useMutation({
    mutationFn: async (items: Array<{ productId: string; quantity: number }>) => {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: items, startTrial: true, billingCycle: 'MONTHLY' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to create subscription');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      setCart([]);
      setShowCart(false);
    },
  });

  // Add item to subscription mutation
  const addItemMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      const res = await fetch('/api/subscription/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to add item');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    },
  });

  // Remove item from subscription mutation
  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await fetch(`/api/subscription/items/${itemId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to remove item');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
    },
  });

  // Stripe Checkout mutation
  const stripeCheckoutMutation = useMutation({
    mutationFn: async (products: Array<{ productCode: string; quantity: number }>) => {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products, billingCycle: 'monthly' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to create checkout session');
      return data.data;
    },
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  // Stripe Customer Portal mutation
  const stripePortalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to open portal');
      return data.data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const isLoading = isLoadingSub || isLoadingProducts;
  const subscription = subscriptionData?.subscription;
  const products = productsData?.products || [];
  const groupedProducts = productsData?.grouped || {};
  const categories = productsData?.categories || [];

  // Cart helpers
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { productId: product.id, product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing && existing.quantity > 1) {
        return prev.map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item
        );
      }
      return prev.filter((item) => item.productId !== productId);
    });
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.priceMonthly * item.quantity, 0);
  }, [cart]);

  const cartHasBasePlan = useMemo(() => {
    return cart.some((item) => item.product.productType === 'BASE_PLAN');
  }, [cart]);

  const formatPrice = (price: number) => {
    if (price === 0) return t('subscription.free');
    return `¥${price.toLocaleString()}`;
  };

  const getProductName = (product: Product) => {
    if (locale === 'zh') return product.nameZh || product.name;
    if (locale === 'ja') return product.nameJa || product.name;
    return product.name;
  };

  const getProductDescription = (product: Product) => {
    if (locale === 'zh') return product.descriptionZh || product.description;
    if (locale === 'ja') return product.descriptionJa || product.description;
    return product.description;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      ACTIVE: { label: 'active', className: 'bg-green-100 text-green-800' },
      TRIAL: { label: 'trial', className: 'bg-blue-100 text-blue-800' },
      PAST_DUE: { label: 'pastDue', className: 'bg-red-100 text-red-800' },
      CANCELLED: { label: 'cancelled', className: 'bg-gray-100 text-gray-800' },
      EXPIRED: { label: 'expired', className: 'bg-orange-100 text-orange-800' },
    };
    const badge = badges[status] || badges.ACTIVE;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.className}`}>
        {t(`subscription.status.${badge.label}`)}
      </span>
    );
  };

  const getInvoiceStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      PAID: { label: 'paid', className: 'text-green-600' },
      OPEN: { label: 'unpaid', className: 'text-yellow-600' },
      DRAFT: { label: 'draft', className: 'text-gray-600' },
      VOID: { label: 'void', className: 'text-gray-400' },
    };
    const badge = badges[status] || badges.DRAFT;
    return (
      <span className={`text-sm font-medium ${badge.className}`}>
        {t(`subscription.invoiceStatus.${badge.label}`)}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-title">{t('subscription.title')}</h1>
          <p className="text-gray-500 mt-1">{t('subscription.description')}</p>
        </div>

        {/* Cart Button */}
        {!subscription && cart.length > 0 && (
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ShoppingCart className="w-5 h-5" />
            <span>{cart.length}</span>
            <span className="font-medium">{formatPrice(cartTotal)}/月</span>
          </button>
        )}
      </div>

      {/* Current Subscription Status */}
      {subscription && (
        <div className="card p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-medium">{t('subscription.currentSubscription')}</h2>
            {getStatusBadge(subscription.status)}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-500">{t('subscription.monthlyPrice')}</p>
              <p className="font-medium text-xl">{formatPrice(subscription.totalAmount)}/月</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('subscription.nextBilling')}</p>
              <p className="font-medium flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(subscription.nextBillingDate).toLocaleDateString('ja-JP')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('subscription.billingCycle')}</p>
              <p className="font-medium">{t(`subscription.cycle.${subscription.billingCycle.toLowerCase()}`)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">订阅项目数</p>
              <p className="font-medium">{subscription.items.length} 个</p>
            </div>
          </div>

          {/* Trial Period Warning */}
          {subscription.isInTrial && subscription.trialEndDate && (
            <div className="p-4 bg-blue-50 rounded-lg flex items-start gap-3">
              <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">{t('subscription.trialPeriod')}</p>
                <p className="text-sm text-blue-700">
                  {t('subscription.trialEnds', {
                    date: new Date(subscription.trialEndDate).toLocaleDateString('ja-JP'),
                  })}
                </p>
              </div>
            </div>
          )}

          {/* Manage Subscription Button */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={() => stripePortalMutation.mutate()}
              disabled={stripePortalMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <Settings className="w-4 h-4" />
              管理订阅
              {stripePortalMutation.isPending && <span className="ml-1">...</span>}
            </button>
            <button
              onClick={() => stripePortalMutation.mutate()}
              disabled={stripePortalMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              支付方式
            </button>
          </div>
        </div>
      )}

      {/* No Active Subscription */}
      {!subscription && subscriptionData && (
        <div className="card p-6 bg-yellow-50 border-yellow-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">{t('subscription.noActiveSubscription')}</p>
              <p className="text-sm text-yellow-700 mt-1">请从下方选择基础套餐和所需模块开始订阅</p>
            </div>
          </div>
        </div>
      )}

      {/* Current Subscription Items */}
      {subscription && subscription.items.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-medium mb-4">当前订阅项目</h2>
          <div className="space-y-3">
            {subscription.items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                    {CATEGORY_INFO[item.category]?.icon || <Package className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium">{item.productNameZh || item.productName}</p>
                    <p className="text-sm text-gray-500">{item.productCode}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-medium">{formatPrice(item.unitPrice)}/月</p>
                    {item.quantity > 1 && (
                      <p className="text-sm text-gray-500">x {item.quantity} = {formatPrice(item.subtotal)}</p>
                    )}
                  </div>
                  {item.productType !== 'BASE_PLAN' && (
                    <button
                      onClick={() => removeItemMutation.mutate(item.id)}
                      disabled={removeItemMutation.isPending}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enabled Modules */}
      {subscriptionData && subscriptionData.enabledModules.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-medium mb-4">{t('subscription.enabledModules')}</h2>
          <div className="flex flex-wrap gap-2">
            {subscriptionData.enabledModules.map((module) => (
              <span
                key={module}
                className="px-3 py-1 rounded-full text-sm bg-green-50 text-green-700 flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                {module}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Product Catalog */}
      <div className="card p-6">
        <h2 className="text-lg font-medium mb-4">
          {subscription ? '添加更多产品' : '选择订阅产品'}
        </h2>

        {/* Category Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition ${
                activeCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {CATEGORY_INFO[category]?.icon}
              <span>{CATEGORY_INFO[category]?.labelZh || category}</span>
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(groupedProducts[activeCategory] || []).map((product) => {
            const isSubscribed = subscription?.items.some((item) => item.productId === product.id);
            const cartItem = cart.find((item) => item.productId === product.id);

            return (
              <div
                key={product.id}
                className={`p-4 border rounded-xl transition ${
                  isSubscribed ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-blue-200'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium">{getProductName(product)}</h3>
                    <p className="text-sm text-gray-500">{product.productCode}</p>
                  </div>
                  {isSubscribed && (
                    <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                      已订阅
                    </span>
                  )}
                </div>

                {getProductDescription(product) && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{getProductDescription(product)}</p>
                )}

                {/* Included Modules */}
                {product.includedModules.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">包含模块:</p>
                    <div className="flex flex-wrap gap-1">
                      {product.includedModules.map((m) => (
                        <span key={m} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {product.enablesModule && (
                  <div className="mb-3">
                    <span className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded">
                      启用: {product.enablesModule}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center mt-4">
                  <span className="text-lg font-bold">{formatPrice(product.priceMonthly)}/月</span>

                  {subscription ? (
                    // Add to existing subscription
                    !isSubscribed && (
                      <button
                        onClick={() => addItemMutation.mutate({ productId: product.id, quantity: 1 })}
                        disabled={addItemMutation.isPending}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )
                  ) : (
                    // Add to cart (new subscription)
                    <div className="flex items-center gap-2">
                      {cartItem ? (
                        <>
                          <button
                            onClick={() => removeFromCart(product.id)}
                            className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center font-medium">{cartItem.quantity}</span>
                          <button
                            onClick={() => addToCart(product)}
                            className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => addToCart(product)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoice History */}
      {subscription && subscription.invoices.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            {t('subscription.invoiceHistory')}
          </h2>
          <div className="space-y-3">
            {subscription.invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium">{invoice.invoiceNumber}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(invoice.issueDate).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatPrice(invoice.amount)}</p>
                  {getInvoiceStatusBadge(invoice.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact for help */}
      <div className="card p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{t('subscription.needHelp')}</h3>
            <p className="text-sm text-gray-600 mt-1">{t('subscription.contactUs')}</p>
            <a
              href="mailto:support@seisei.tokyo"
              className="text-sm text-blue-600 hover:underline mt-2 inline-block"
            >
              support@seisei.tokyo
            </a>
          </div>
        </div>
      </div>

      {/* Cart Modal (for new subscriptions) */}
      {showCart && !subscription && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                订阅购物车
              </h3>
              <button onClick={() => setShowCart(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.map((item) => (
                <div key={item.productId} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{getProductName(item.product)}</p>
                    <p className="text-sm text-gray-500">{item.product.productCode}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="p-1 bg-gray-200 rounded hover:bg-gray-300"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => addToCart(item.product)}
                        className="p-1 bg-gray-200 rounded hover:bg-gray-300"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="font-medium w-24 text-right">
                      {formatPrice(item.product.priceMonthly * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t">
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-600">月额合计</span>
                <span className="text-2xl font-bold">{formatPrice(cartTotal)}/月</span>
              </div>

              {!cartHasBasePlan && (
                <div className="p-3 bg-yellow-50 text-yellow-700 rounded-lg mb-4 text-sm">
                  请至少选择一个基础套餐
                </div>
              )}

              {(createSubscriptionMutation.isError || stripeCheckoutMutation.isError) && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg mb-4 text-sm">
                  {createSubscriptionMutation.error?.message || stripeCheckoutMutation.error?.message || '创建订阅失败'}
                </div>
              )}

              <div className="space-y-3">
                {/* Free Trial Button */}
                <button
                  onClick={() => {
                    createSubscriptionMutation.mutate(
                      cart.map((item) => ({ productId: item.productId, quantity: item.quantity }))
                    );
                  }}
                  disabled={!cartHasBasePlan || createSubscriptionMutation.isPending}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createSubscriptionMutation.isPending ? '处理中...' : '开始免费试用'}
                </button>

                {/* Stripe Checkout Button */}
                <button
                  onClick={() => {
                    stripeCheckoutMutation.mutate(
                      cart.map((item) => ({ productCode: item.product.productCode, quantity: item.quantity }))
                    );
                  }}
                  disabled={!cartHasBasePlan || stripeCheckoutMutation.isPending}
                  className="w-full py-3 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  {stripeCheckoutMutation.isPending ? '跳转中...' : '立即支付订阅'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
