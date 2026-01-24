'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Plus, Minus, Check, Search, ShoppingCart, Package } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Loading } from '@/components/ui/loading';
import type { ApiResponse } from '@/types';

interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
}

interface Product {
  id: number;
  name: string;
  code: string | null;
  price: number;
  uom: string;
}

interface OrderLine {
  productId: number;
  productName: string;
  quantity: number;
  priceUnit: number;
  uom: string;
}

// Unified currency formatter for JPY with thousand separators
const formatJPY = (value: number): string => {
  const safeValue = isNaN(value) ? 0 : value;
  return `¥ ${safeValue.toLocaleString('ja-JP')}`;
};

// Calculate subtotal with NaN protection
const calcSubtotal = (qty: number, price: number): number => {
  const safeQty = isNaN(qty) ? 0 : qty;
  const safePrice = isNaN(price) ? 0 : price;
  return safeQty * safePrice;
};

export default function CreateSalesOrderPage() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Form state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [dateOrder, setDateOrder] = useState(new Date().toISOString().split('T')[0]);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);

  // Search state
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Loading state
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bottom Sheet state for editing
  const [editingLine, setEditingLine] = useState<OrderLine | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [editPrice, setEditPrice] = useState(0);

  // Swipe state
  const [swipedLineId, setSwipedLineId] = useState<number | null>(null);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);

  // Fetch customers
  const fetchCustomers = useCallback(async (search: string) => {
    setIsLoadingCustomers(true);
    try {
      const res = await fetch(`/api/sales/customers?search=${encodeURIComponent(search)}&limit=10`);
      const data: ApiResponse<Customer[]> = await res.json();
      if (data.success) {
        setCustomers(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setIsLoadingCustomers(false);
    }
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async (search: string) => {
    setIsLoadingProducts(true);
    try {
      const res = await fetch(`/api/sales/products?search=${encodeURIComponent(search)}&limit=10`);
      const data: ApiResponse<Product[]> = await res.json();
      if (data.success) {
        setProducts(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showCustomerDropdown) {
        fetchCustomers(customerSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, showCustomerDropdown, fetchCustomers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (showProductDropdown) {
        fetchProducts(productSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch, showProductDropdown, fetchProducts]);

  // Select customer
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  };

  // Add product line
  const handleAddProduct = (product: Product) => {
    const exists = orderLines.find((line) => line.productId === product.id);
    if (exists) {
      setOrderLines((prev) =>
        prev.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line
        )
      );
    } else {
      setOrderLines((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          priceUnit: product.price,
          uom: product.uom,
        },
      ]);
    }
    setProductSearch('');
    setShowProductDropdown(false);
  };

  // Open Bottom Sheet to edit line
  const openEditSheet = (line: OrderLine) => {
    setEditingLine(line);
    setEditQty(line.quantity);
    setEditPrice(line.priceUnit);
    setSwipedLineId(null);
  };

  // Close Bottom Sheet and save changes
  const closeEditSheet = () => {
    if (editingLine) {
      setOrderLines((prev) =>
        prev.map((line) =>
          line.productId === editingLine.productId
            ? { ...line, quantity: editQty, priceUnit: editPrice }
            : line
        )
      );
    }
    setEditingLine(null);
  };

  // Delete line from sheet
  const deleteFromSheet = () => {
    if (editingLine) {
      setOrderLines((prev) => prev.filter((line) => line.productId !== editingLine.productId));
      setEditingLine(null);
    }
  };

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent, productId: number) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent, productId: number) => {
    touchCurrentX.current = e.touches[0].clientX;
    const diff = touchStartX.current - touchCurrentX.current;
    if (diff > 50) {
      setSwipedLineId(productId);
    } else if (diff < -30) {
      setSwipedLineId(null);
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = 0;
    touchCurrentX.current = 0;
  };

  // Delete via swipe
  const handleSwipeDelete = (productId: number) => {
    setOrderLines((prev) => prev.filter((line) => line.productId !== productId));
    setSwipedLineId(null);
  };

  // Calculate total
  const totalAmount = orderLines.reduce(
    (sum, line) => sum + calcSubtotal(line.quantity, line.priceUnit),
    0
  );

  // Submit order
  const handleSubmit = async () => {
    if (!selectedCustomer || orderLines.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId: selectedCustomer.id,
          dateOrder,
          lines: orderLines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            priceUnit: line.priceUnit,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        router.push('/sales');
      } else {
        alert(data.error?.message || 'Failed to create order');
      }
    } catch (error) {
      console.error('Failed to create order:', error);
      alert('Failed to create order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pb-32 md:pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{t('sales.createOrder')}</h1>
      </div>

      {/* Customer Selection */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          {t('sales.customer')} *
        </label>
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setShowCustomerDropdown(true);
                if (!e.target.value) setSelectedCustomer(null);
              }}
              onFocus={() => {
                setShowCustomerDropdown(true);
                fetchCustomers(customerSearch);
              }}
              placeholder={t('sales.searchCustomer')}
              className="input w-full pl-9 py-2 text-sm"
            />
            {selectedCustomer && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
            )}
          </div>
          {showCustomerDropdown && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {isLoadingCustomers ? (
                <div className="p-3 text-center text-gray-500 text-sm">{t('common.loading')}</div>
              ) : customers.length === 0 ? (
                <div className="p-3 text-center text-gray-500 text-sm">{t('common.noData')}</div>
              ) : (
                customers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => handleSelectCustomer(customer)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    <div className="font-medium text-gray-900 text-sm">{customer.name}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Date */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          {t('sales.orderDate')}
        </label>
        <input
          type="date"
          value={dateOrder}
          onChange={(e) => setDateOrder(e.target.value)}
          className="input w-full py-2 text-sm"
        />
      </div>

      {/* Product Lines Section */}
      <div className="bg-white rounded-lg border border-gray-200 mb-3">
        {/* Header with count */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{t('sales.orderLines')}</span>
          </div>
          {orderLines.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {orderLines.length} {t('common.items')}
            </span>
          )}
        </div>

        {/* Add Product Row */}
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setShowProductDropdown(true);
              }}
              onFocus={() => {
                setShowProductDropdown(true);
                fetchProducts(productSearch);
              }}
              placeholder={t('sales.addProduct')}
              className="input w-full pl-9 pr-12 py-2.5 text-sm"
            />
            <button
              onClick={() => fetchProducts(productSearch)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {showProductDropdown && (
            <div className="absolute z-20 left-3 right-3 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {isLoadingProducts ? (
                <div className="p-4 text-center text-gray-500 text-sm">{t('common.loading')}</div>
              ) : products.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">{t('common.noData')}</div>
              ) : (
                products.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleAddProduct(product)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">{product.name}</div>
                        {product.code && (
                          <div className="text-xs text-gray-500 mt-0.5">{product.code}</div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-semibold text-gray-900 text-sm">{formatJPY(product.price)}</div>
                        <div className="text-xs text-gray-500">{product.uom}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Order Lines List */}
        {orderLines.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <div className="text-sm font-medium">{t('sales.noProducts')}</div>
            <div className="text-xs mt-1 text-gray-400">{t('sales.addProduct')}</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {orderLines.map((line) => {
              const subtotal = calcSubtotal(line.quantity, line.priceUnit);
              const isSwiped = swipedLineId === line.productId;

              return (
                <div
                  key={line.productId}
                  className="relative overflow-hidden"
                >
                  {/* Delete action revealed on swipe */}
                  <div
                    className={`absolute right-0 top-0 bottom-0 w-20 bg-red-500 flex items-center justify-center transition-transform duration-200 ${
                      isSwiped ? 'translate-x-0' : 'translate-x-full'
                    }`}
                  >
                    <button
                      onClick={() => handleSwipeDelete(line.productId)}
                      className="w-full h-full flex items-center justify-center text-white font-medium text-sm"
                    >
                      {t('common.delete')}
                    </button>
                  </div>

                  {/* Summary Row - tap to edit */}
                  <div
                    onClick={() => openEditSheet(line)}
                    onTouchStart={(e) => handleTouchStart(e, line.productId)}
                    onTouchMove={(e) => handleTouchMove(e, line.productId)}
                    onTouchEnd={handleTouchEnd}
                    className={`px-4 py-3 bg-white cursor-pointer active:bg-gray-50 transition-transform duration-200 ${
                      isSwiped ? '-translate-x-20' : 'translate-x-0'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      {/* Left: Product info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-base leading-snug line-clamp-2">
                          {line.productName || t('sales.noProducts')}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-gray-400">{t('sales.quantity')}:</span>
                            <span className="font-medium text-gray-700">{line.quantity}</span>
                            <span className="text-gray-400">{line.uom}</span>
                          </span>
                          <span className="text-gray-300">×</span>
                          <span className="inline-flex items-center gap-1">
                            <span className="text-gray-400">@</span>
                            <span className="font-medium text-gray-700">{formatJPY(line.priceUnit)}</span>
                          </span>
                        </div>
                      </div>
                      {/* Right: Subtotal */}
                      <div className="text-right flex-shrink-0 pt-0.5">
                        <div className="text-lg font-bold text-gray-900">{formatJPY(subtotal)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left: Total amount */}
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 mb-0.5">{t('order.total')}</span>
            <span className="text-xl font-bold text-gray-900">{formatJPY(totalAmount)}</span>
          </div>
          {/* Right: Action button */}
          <div className="flex flex-col items-end gap-1.5">
            {!selectedCustomer && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{t('sales.selectCustomerFirst')}</span>
            )}
            {selectedCustomer && orderLines.length === 0 && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{t('sales.addProductsFirst')}</span>
            )}
            <button
              onClick={handleSubmit}
              disabled={!selectedCustomer || orderLines.length === 0 || isSubmitting}
              className="btn btn-primary px-6 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loading text="" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {t('sales.createOrder')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(showCustomerDropdown || showProductDropdown) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setShowCustomerDropdown(false);
            setShowProductDropdown(false);
          }}
        />
      )}

      {/* Bottom Sheet for Editing */}
      {editingLine && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/40 z-50"
            onClick={closeEditSheet}
          />
          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 max-h-[70vh] overflow-y-auto animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="px-4 pb-8">
              {/* Product Name */}
              <h3 className="font-semibold text-gray-900 text-lg mb-6 line-clamp-2">
                {editingLine.productName}
              </h3>

              {/* Quantity with Stepper */}
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-2">{t('sales.quantity')}</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditQty(Math.max(1, editQty - 1))}
                    className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300"
                  >
                    <Minus className="w-5 h-5 text-gray-700" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editQty}
                    onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="input w-24 text-center text-lg font-medium"
                    min="1"
                  />
                  <button
                    onClick={() => setEditQty(editQty + 1)}
                    className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300"
                  >
                    <Plus className="w-5 h-5 text-gray-700" />
                  </button>
                </div>
              </div>

              {/* Unit Price */}
              <div className="mb-6">
                <label className="block text-sm text-gray-600 mb-2">{t('sales.unitPrice')}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={editPrice}
                  onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                  className="input w-full text-right text-lg"
                  min="0"
                />
              </div>

              {/* Subtotal Display */}
              <div className="flex justify-between items-center py-3 border-t border-gray-200 mb-6">
                <span className="text-gray-600">{t('order.subtotal')}</span>
                <span className="text-xl font-bold text-gray-900">
                  {formatJPY(calcSubtotal(editQty, editPrice))}
                </span>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={closeEditSheet}
                  className="w-full btn btn-primary py-3 text-base"
                >
                  {t('common.confirm')}
                </button>
                <button
                  onClick={deleteFromSheet}
                  className="w-full py-3 text-red-500 font-medium text-sm hover:bg-red-50 rounded-lg"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
