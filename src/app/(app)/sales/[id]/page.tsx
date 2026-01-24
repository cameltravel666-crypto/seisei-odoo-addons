'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Truck,
  FileText,
  Mail,
  Share2,
  Edit,
  Plus,
  Minus,
  Search,
  Trash2,
  Save,
  X,
  Pencil,
} from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import { EmailComposeModal } from '@/components/email-compose-modal';
import type { ApiResponse } from '@/types';
import { StickyActionBar, StickyActionBarContent } from '@/components/documents';

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
  id: number;
  productId: number | null;
  productName: string;
  /** User-editable line name/description */
  name: string;
  quantity: number;
  qtyDelivered: number;
  qtyInvoiced: number;
  priceUnit: number;
  subtotal: number;
  uom: string;
}

interface SalesOrderDetail {
  id: number;
  name: string;
  /** User-editable document name (stored in client_order_ref) */
  displayName: string | null;
  partnerId: number | null;
  partnerName: string;
  dateOrder: string;
  commitmentDate: string | null;
  amountTotal: number;
  amountUntaxed: number;
  amountTax: number;
  state: string;
  notes: string | null;
  userId: number | null;
  userName: string;
  currency: string;
  deliveryStatus: string | null;
  invoiceStatus: string | null;
  lines: OrderLine[];
}

// Format JPY with thousand separators
const formatJPY = (value: number): string => {
  const safeValue = isNaN(value) ? 0 : value;
  return `¥ ${safeValue.toLocaleString('ja-JP')}`;
};

const stateColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-yellow-100 text-yellow-800',
  sale: 'bg-green-100 text-green-800',
  done: 'bg-green-100 text-green-800',
  cancel: 'bg-red-100 text-red-800',
};

export default function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [order, setOrder] = useState<SalesOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showLangDialog, setShowLangDialog] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedLines, setEditedLines] = useState<OrderLine[]>([]);
  const [editedPartnerId, setEditedPartnerId] = useState<number | null>(null);
  const [editedPartnerName, setEditedPartnerName] = useState('');
  const [editedDateOrder, setEditedDateOrder] = useState('');
  const [editedDisplayName, setEditedDisplayName] = useState<string>('');

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  // Product search state
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Bottom Sheet state for editing line
  const [editingLine, setEditingLine] = useState<OrderLine | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [editPrice, setEditPrice] = useState(0);
  const [editLineName, setEditLineName] = useState('');

  // Fetch order details
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/sales/${id}`);
        const data: ApiResponse<SalesOrderDetail> = await res.json();
        if (data.success && data.data) {
          setOrder(data.data);
        } else {
          setError(data.error?.message || 'Failed to load order');
        }
      } catch {
        setError('Failed to load order');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrder();
  }, [id]);

  const getStatusLabel = (state: string) => {
    const labels: Record<string, string> = {
      draft: t('sales.draft'),
      sent: t('sales.sent'),
      sale: t('sales.confirmed'),
      done: t('sales.done'),
      cancel: t('status.cancelled'),
    };
    return labels[state] || state;
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('ja-JP');

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

  // Debounced customer search
  useEffect(() => {
    if (!showCustomerDropdown) return;
    const timer = setTimeout(() => fetchCustomers(customerSearch), 300);
    return () => clearTimeout(timer);
  }, [customerSearch, showCustomerDropdown, fetchCustomers]);

  // Debounced product search
  useEffect(() => {
    if (!showProductDropdown) return;
    const timer = setTimeout(() => fetchProducts(productSearch), 300);
    return () => clearTimeout(timer);
  }, [productSearch, showProductDropdown, fetchProducts]);

  // Enter edit mode
  const handleEnterEditMode = () => {
    if (!order) return;
    setEditedLines([...order.lines]);
    setEditedPartnerId(order.partnerId);
    setEditedPartnerName(order.partnerName);
    setCustomerSearch(order.partnerName);
    setEditedDateOrder(order.dateOrder.split(' ')[0]);
    setEditedDisplayName(order.displayName || '');
    setEditMode(true);
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditMode(false);
    setEditedLines([]);
    setShowCustomerDropdown(false);
    setShowProductDropdown(false);
  };

  // Save changes
  const handleSaveChanges = async () => {
    if (!order) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/sales/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editedDisplayName || undefined,
          partnerId: editedPartnerId,
          dateOrder: editedDateOrder,
          lines: editedLines.map((line) => ({
            id: line.id > 0 ? line.id : undefined,
            productId: line.productId,
            name: line.name,
            quantity: line.quantity,
            priceUnit: line.priceUnit,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Refetch order details
        const refreshRes = await fetch(`/api/sales/${id}`);
        const refreshData = await refreshRes.json();
        if (refreshData.success && refreshData.data) {
          setOrder(refreshData.data);
        }
        setEditMode(false);
        queryClient.invalidateQueries({ queryKey: ['sales'] });
      } else {
        alert(data.error?.message || 'Failed to save changes');
      }
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Save display name (can be called from header without full edit mode)
  const handleSaveDisplayName = async (newName: string) => {
    if (!order) return;

    try {
      const res = await fetch(`/api/sales/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: newName || undefined }),
      });

      const data = await res.json();
      if (data.success) {
        setOrder((prev) => prev ? { ...prev, displayName: newName || null } : null);
        queryClient.invalidateQueries({ queryKey: ['sales'] });
      } else {
        alert(data.error?.message || 'Failed to save name');
      }
    } catch (error) {
      console.error('Failed to save name:', error);
      alert('Failed to save name');
    }
  };

  // Select customer in edit mode
  const handleSelectCustomer = (customer: Customer) => {
    setEditedPartnerId(customer.id);
    setEditedPartnerName(customer.name);
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  };

  // Add product in edit mode
  const handleAddProduct = (product: Product) => {
    const newLine: OrderLine = {
      id: -Date.now(),
      productId: product.id,
      productName: product.name,
      name: product.name,
      quantity: 1,
      qtyDelivered: 0,
      qtyInvoiced: 0,
      priceUnit: product.price,
      subtotal: product.price,
      uom: product.uom,
    };
    setEditedLines((prev) => [...prev, newLine]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  // Remove line in edit mode
  const handleRemoveLine = (lineId: number) => {
    setEditedLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  // Open line edit sheet
  const openEditSheet = (line: OrderLine) => {
    setEditingLine(line);
    setEditQty(line.quantity);
    setEditPrice(line.priceUnit);
    setEditLineName(line.name);
  };

  // Save line edit
  const closeEditSheet = () => {
    if (editingLine) {
      setEditedLines((prev) =>
        prev.map((line) =>
          line.id === editingLine.id
            ? { ...line, name: editLineName, quantity: editQty, priceUnit: editPrice, subtotal: editQty * editPrice }
            : line
        )
      );
    }
    setEditingLine(null);
  };

  // Calculate edited total
  const editedTotal = editedLines.reduce((sum, line) => sum + line.quantity * line.priceUnit, 0);

  // Confirm order
  const handleConfirm = async () => {
    if (!order || order.state !== 'draft') return;

    setIsConfirming(true);
    try {
      const res = await fetch(`/api/sales/${id}/confirm`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setOrder((prev) => prev ? { ...prev, state: 'sale' } : null);
        queryClient.invalidateQueries({ queryKey: ['sales'] });
      } else {
        alert(data.error?.message || 'Failed to confirm order');
      }
    } catch {
      alert('Failed to confirm order');
    } finally {
      setIsConfirming(false);
    }
  };

  // Open email compose modal
  const handleSendEmail = () => {
    if (!order) return;
    setShowEmailModal(true);
  };

  // Handle successful email send
  const handleEmailSuccess = () => {
    if (order && order.state === 'draft') {
      setOrder((prev) => prev ? { ...prev, state: 'sent' } : null);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    }
  };

  // Show language selection dialog before generating PDF
  const handleSharePdfClick = () => {
    setShowLangDialog(true);
  };

  // Generate and share PDF with selected language
  const handleSharePdf = async (lang: string) => {
    if (!order) return;

    setShowLangDialog(false);
    setIsGeneratingPdf(true);
    try {
      const res = await fetch(`/api/sales/${id}/pdf?lang=${lang}`);

      if (!res.ok) {
        const data = await res.json();
        alert(data.error?.message || t('sales.pdfFailed'));
        return;
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/pdf')) {
        alert(t('sales.pdfFailed'));
        return;
      }

      const blob = await res.blob();
      const prefix = order.state === 'draft' || order.state === 'sent' ? 'Quote' : 'SO';
      const filename = `${prefix}_${order.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      // Check if Web Share API is available and can share files
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `見積書: ${order.name}`,
          text: `${order.partnerName} 様への見積書 ${order.name}`,
          files: [file],
        });
      } else {
        // Fallback: download the PDF
        downloadPdf(blob, filename);
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      alert(t('sales.pdfFailed'));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const downloadPdf = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 mb-4">
          <ArrowLeft className="w-5 h-5" />
          {t('common.back')}
        </button>
        <div className="card p-6 text-center text-red-600">{error || 'Order not found'}</div>
      </div>
    );
  }

  const canConfirm = order.state === 'draft' || order.state === 'sent';
  const canSendEmail = order.state !== 'cancel';
  const canSharePdf = order.state === 'sale' || order.state === 'done';
  const canEdit = order.state === 'draft' || order.state === 'sent';

  return (
    <div className="pb-32 md:pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => editMode ? handleCancelEdit() : router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            {editMode ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
          <div className="flex-1 min-w-0">
            {/* Document Number */}
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">{order.name}</h1>
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${stateColors[order.state] || 'bg-gray-100'}`}>
                {getStatusLabel(order.state)}
              </span>
            </div>
            {/* User-editable Display Name */}
            {editMode ? (
              <input
                type="text"
                value={editedDisplayName}
                onChange={(e) => setEditedDisplayName(e.target.value)}
                placeholder={t('documents.documentName')}
                maxLength={60}
                className="mt-1 w-full text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            ) : order.displayName ? (
              <p className="text-sm text-gray-600 truncate">{order.displayName}</p>
            ) : canEdit ? (
              <button
                onClick={handleEnterEditMode}
                className="mt-0.5 text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" />
                {t('documents.addName')}
              </button>
            ) : null}
          </div>
        </div>
        {/* Edit button for draft orders */}
        {canEdit && !editMode && (
          <button
            onClick={handleEnterEditMode}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition min-w-[44px] min-h-[44px]"
          >
            <Edit className="w-4 h-4" />
            {t('common.edit')}
          </button>
        )}
      </div>

      {/* Order Info Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        {editMode ? (
          <div className="space-y-4">
            {/* Customer Selection */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('sales.customer')}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => {
                    setShowCustomerDropdown(true);
                    fetchCustomers(customerSearch);
                  }}
                  placeholder={t('sales.searchCustomer')}
                  className="input w-full pl-9 py-2 text-sm"
                />
                {editedPartnerName && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
                )}
              </div>
              {showCustomerDropdown && (
                <div className="absolute z-20 left-4 right-4 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
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
            {/* Date */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('sales.orderDate')}</label>
              <input
                type="date"
                value={editedDateOrder}
                onChange={(e) => setEditedDateOrder(e.target.value)}
                className="input w-full py-2 text-sm"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">{t('sales.customer')}</div>
                <div className="font-medium text-gray-900">{order.partnerName}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t('sales.orderDate')}</div>
                <div className="font-medium text-gray-900">{formatDate(order.dateOrder)}</div>
              </div>
              {order.commitmentDate && (
                <div>
                  <div className="text-xs text-gray-500">{t('sales.deliveryDate')}</div>
                  <div className="font-medium text-gray-900">{formatDate(order.commitmentDate)}</div>
                </div>
              )}
              <div>
                <div className="text-xs text-gray-500">{t('sales.salesperson')}</div>
                <div className="font-medium text-gray-900">{order.userName}</div>
              </div>
            </div>

            {/* Status indicators */}
            {order.state === 'sale' && (
              <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {order.deliveryStatus === 'full' ? t('sales.delivered') : t('sales.deliveryPending')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {order.invoiceStatus === 'invoiced' ? t('sales.invoiced') : t('sales.invoicePending')}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order Lines */}
      <div className="bg-white rounded-lg border border-gray-200 mb-3">
        {editMode ? (
          <>
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
                  className="input w-full pl-9 pr-16 py-2 text-sm"
                />
                <button
                  onClick={() => fetchProducts(productSearch)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {showProductDropdown && (
                <div className="absolute z-20 left-4 right-4 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {isLoadingProducts ? (
                    <div className="p-3 text-center text-gray-500 text-sm">{t('common.loading')}</div>
                  ) : products.length === 0 ? (
                    <div className="p-3 text-center text-gray-500 text-sm">{t('common.noData')}</div>
                  ) : (
                    products.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => handleAddProduct(product)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-900 text-sm truncate">{product.name}</span>
                          <span className="text-gray-600 text-sm ml-2">{formatJPY(product.price)}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Editable Lines */}
            {editedLines.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-sm">{t('sales.noProducts')}</div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {editedLines.map((line) => (
                  <div
                    key={line.id}
                    onClick={() => openEditSheet(line)}
                    className="px-4 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100"
                  >
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">{line.productName}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{formatJPY(line.quantity * line.priceUnit)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveLine(line.id);
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('sales.quantity')} {line.quantity} × {t('sales.unitPrice')} {formatJPY(line.priceUnit)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => setShowLines(!showLines)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <span className="font-medium text-gray-900">{t('sales.orderLines')} ({order.lines.length})</span>
              {showLines ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {showLines && (
              <div className="border-t border-gray-100 divide-y divide-gray-100">
                {order.lines.map((line) => (
                  <div key={line.id} className="px-4 py-3">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">{line.productName}</div>
                      </div>
                      <div className="font-bold text-gray-900">{formatJPY(line.subtotal)}</div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('sales.quantity')} {line.quantity} × {t('sales.unitPrice')} {formatJPY(line.priceUnit)}
                    </div>
                    {order.state === 'sale' && (
                      <div className="text-xs text-gray-400 mt-1">
                        {t('sales.delivered')}: {line.qtyDelivered} / {t('sales.invoiced')}: {line.qtyInvoiced}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Totals */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3">
        <div className="space-y-2">
          {editMode ? (
            <div className="flex justify-between text-base font-bold">
              <span className="text-gray-900">{t('order.total')}</span>
              <span className="text-blue-600">{formatJPY(editedTotal)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('order.subtotal')}</span>
                <span className="text-gray-900">{formatJPY(order.amountUntaxed)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('sales.tax')}</span>
                <span className="text-gray-900">{formatJPY(order.amountTax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
                <span className="text-gray-900">{t('order.total')}</span>
                <span className="text-gray-900">{formatJPY(order.amountTotal)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Notes */}
      {order.notes && !editMode && (
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 mb-3">
          <div className="text-xs text-yellow-700 mb-1">{t('order.note')}</div>
          <div className="text-sm text-yellow-900 whitespace-pre-wrap">{order.notes}</div>
        </div>
      )}

      {/* Sticky Bottom Bar with safe-area-inset-bottom support */}
      <StickyActionBar>
        <StickyActionBarContent>
          {editMode ? (
            /* Edit mode buttons */
            <div className="flex gap-2">
              <button
                onClick={handleCancelEdit}
                className="flex-1 btn bg-gray-100 text-gray-700 hover:bg-gray-200 py-3 flex items-center justify-center gap-2 min-h-[44px]"
              >
                <X className="w-5 h-5" />
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={isSaving || editedLines.length === 0}
                className="flex-1 btn btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    {t('common.save')}
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Normal mode buttons */
            <div className="flex gap-2">
              {canConfirm && (
                <button
                  onClick={handleConfirm}
                  disabled={isConfirming}
                  className="flex-1 btn btn-primary py-3 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {isConfirming ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      {t('sales.confirmOrder')}
                    </>
                  )}
                </button>
              )}

              {canSendEmail && (
                <button
                  onClick={handleSendEmail}
                  className="flex-1 btn bg-blue-600 text-white hover:bg-blue-700 py-3 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <Mail className="w-5 h-5" />
                  {t('sales.sendEmail')}
                </button>
              )}

              {canSharePdf && (
                <button
                  onClick={handleSharePdfClick}
                  disabled={isGeneratingPdf}
                  className="flex-1 btn bg-gray-800 text-white hover:bg-gray-900 py-3 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Share2 className="w-5 h-5" />
                      {t('sales.sharePdf')}
                    </>
                  )}
                </button>
              )}

              {order.state === 'cancel' && (
                <div className="flex-1 text-center text-gray-500 py-3">
                  {t('status.cancelled')}
                </div>
              )}
            </div>
          )}
        </StickyActionBarContent>
      </StickyActionBar>

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

      {/* Bottom Sheet for Editing Line */}
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

            <div className="px-4 pb-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
              {/* Product Name */}
              <h3 className="font-semibold text-gray-900 text-lg mb-4 line-clamp-2">
                {editingLine.productName}
              </h3>

              {/* Editable Line Name/Description */}
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-2">{t('documents.lineName')}</label>
                <input
                  type="text"
                  value={editLineName}
                  onChange={(e) => setEditLineName(e.target.value)}
                  placeholder={editingLine.productName}
                  maxLength={120}
                  className="input w-full py-3 text-base"
                />
              </div>

              {/* Quantity with Stepper - 44x44 touch targets */}
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-2">{t('sales.quantity')}</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditQty(Math.max(1, editQty - 1))}
                    className="w-11 h-11 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300"
                  >
                    <Minus className="w-5 h-5 text-gray-700" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editQty}
                    onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="input w-24 h-11 text-center text-lg font-medium"
                    min="1"
                  />
                  <button
                    onClick={() => setEditQty(editQty + 1)}
                    className="w-11 h-11 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 active:bg-gray-300"
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
                  {formatJPY(editQty * editPrice)}
                </span>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={closeEditSheet}
                  className="w-full btn btn-primary min-h-[44px] py-3 text-base"
                >
                  {t('common.confirm')}
                </button>
                <button
                  onClick={() => {
                    handleRemoveLine(editingLine.id);
                    setEditingLine(null);
                  }}
                  className="w-full min-h-[44px] py-3 text-red-500 font-medium text-sm hover:bg-red-50 rounded-lg"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Language Selection Dialog for PDF */}
      {showLangDialog && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowLangDialog(false)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
            <div className="bg-white rounded-xl shadow-xl overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 text-center">
                  PDF 语言 / PDF Language
                </h3>
              </div>
              <div className="p-2">
                <button
                  onClick={() => handleSharePdf('ja')}
                  className="w-full p-4 text-left hover:bg-gray-50 rounded-lg flex items-center gap-3"
                >
                  <span className="text-2xl">🇯🇵</span>
                  <span className="font-medium text-gray-900">日本語</span>
                </button>
                <button
                  onClick={() => handleSharePdf('zh')}
                  className="w-full p-4 text-left hover:bg-gray-50 rounded-lg flex items-center gap-3"
                >
                  <span className="text-2xl">🇨🇳</span>
                  <span className="font-medium text-gray-900">中文</span>
                </button>
                <button
                  onClick={() => handleSharePdf('en')}
                  className="w-full p-4 text-left hover:bg-gray-50 rounded-lg flex items-center gap-3"
                >
                  <span className="text-2xl">🇺🇸</span>
                  <span className="font-medium text-gray-900">English</span>
                </button>
              </div>
              <div className="p-3 border-t border-gray-100">
                <button
                  onClick={() => setShowLangDialog(false)}
                  className="w-full py-2.5 text-gray-500 font-medium text-sm hover:bg-gray-50 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Email Compose Modal */}
      {order && (
        <EmailComposeModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          orderId={order.id}
          orderName={order.name}
          partnerName={order.partnerName}
          orderType="sales"
          onSuccess={handleEmailSuccess}
        />
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
