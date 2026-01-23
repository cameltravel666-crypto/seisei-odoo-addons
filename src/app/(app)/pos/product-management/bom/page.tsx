'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus, Edit2, Trash2, Search, ChevronDown, ChevronUp, ChevronLeft, Package, Loader2 } from 'lucide-react';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { FormRow, FormGroup } from '@/components/ui/form-row';
import type { ApiResponse } from '@/types';

interface BomLine {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  uomId: number;
  uomName: string;
  sequence: number;
}

interface Bom {
  id: number;
  productTemplateId: number;
  productTemplateName: string;
  productId: number | null;
  productName: string | null;
  quantity: number;
  uomId: number;
  uomName: string;
  code: string | null;
  type: string;
  active: boolean;
  lines: BomLine[];
}

interface Product {
  id: number;
  name: string;
  code: string | null;
}

interface BomData {
  items: Bom[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface ProductsData {
  items: Product[];
}

interface FormLine {
  productId: number | null;
  quantity: number;
}

interface FormData {
  productTemplateId: number | null;
  quantity: number;
  code: string;
  type: string;
  lines: FormLine[];
}

const bomTypes = [
  { value: 'normal', label: '制造' },
  { value: 'phantom', label: '套件/组合' },
];

export default function BomPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBom, setEditingBom] = useState<Bom | null>(null);
  const [formData, setFormData] = useState<FormData>({
    productTemplateId: null,
    quantity: 1,
    code: '',
    type: 'normal',
    lines: [],
  });

  // Fetch BOMs
  const { data, isLoading, error } = useQuery({
    queryKey: ['boms', page, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/products/bom?${params}`);
      const json: ApiResponse<BomData> = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data!;
    },
  });

  // Fetch products for selection
  const { data: productsData } = useQuery({
    queryKey: ['productsForBom'],
    queryFn: async () => {
      const res = await fetch('/api/products?limit=500');
      const json: ApiResponse<ProductsData> = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to fetch');
      return json.data!;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch('/api/products/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to create');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
      setIsModalOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData & { id: number }) => {
      const res = await fetch('/api/products/bom', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to update');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
      setIsModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch('/api/products/bom', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to delete');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms'] });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPage(1);
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openCreateModal = () => {
    setEditingBom(null);
    setFormData({
      productTemplateId: null,
      quantity: 1,
      code: '',
      type: 'normal',
      lines: [{ productId: null, quantity: 1 }],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (bom: Bom) => {
    setEditingBom(bom);
    setFormData({
      productTemplateId: bom.productTemplateId,
      quantity: bom.quantity,
      code: bom.code || '',
      type: bom.type,
      lines: bom.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('products.confirmDeleteBom'))) {
      try {
        await deleteMutation.mutateAsync(id);
      } catch (err) {
        alert((err as Error).message);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Filter out empty lines
      const cleanedData = {
        ...formData,
        lines: formData.lines.filter((l) => l.productId !== null),
      };

      if (editingBom) {
        await updateMutation.mutateAsync({ ...cleanedData, id: editingBom.id });
      } else {
        await createMutation.mutateAsync(cleanedData);
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { productId: null, quantity: 1 }],
    });
  };

  const removeLine = (index: number) => {
    if (formData.lines.length <= 1) return;
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index),
    });
  };

  const updateLine = (index: number, field: keyof FormLine, value: number | null) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isFormValid = formData.productTemplateId !== null && formData.lines.some((l) => l.productId !== null);
  const selectedProduct = productsData?.items.find((p) => p.id === formData.productTemplateId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/pos" className="page-title flex items-center gap-1 hover:text-[var(--color-primary)] transition-colors">
          <ChevronLeft className="w-5 h-5" />
          {t('products.bom')}
        </Link>
        <button onClick={openCreateModal} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {t('products.addBom')}
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('products.searchBomPlaceholder')}
            className="input pl-10 w-full"
          />
        </div>
      </form>

      {/* BOM List */}
      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">
          {t('common.error')}: {(error as Error).message}
        </div>
      ) : !data?.items.length ? (
        <EmptyState icon="file" title={t('products.noBoms')} description={t('products.noBomsDesc')} />
      ) : (
        <>
          <div className="card overflow-hidden divide-y divide-gray-100">
            {data.items.map((bom) => {
              const isExpanded = expandedIds.has(bom.id);

              return (
                <div key={bom.id}>
                  <div className="flex items-center gap-3 p-4 hover:bg-gray-50">
                    <button onClick={() => toggleExpand(bom.id)} className="p-1">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      )}
                    </button>

                    <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                      <FlaskConical className="w-5 h-5 text-green-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900">{bom.productTemplateName}</h3>
                      <p className="text-xs text-gray-500">
                        {bom.code && <span className="mr-2">{bom.code}</span>}
                        {bomTypes.find((bt) => bt.value === bom.type)?.label || bom.type}
                        {' · '}
                        {bom.lines.length} {t('products.components')}
                      </p>
                    </div>

                    <div className="text-right mr-4">
                      <div className="font-medium text-gray-900 tabular-nums">
                        {bom.quantity} {bom.uomName}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(bom)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(bom.id)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && bom.lines.length > 0 && (
                    <div className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                      <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                        {t('products.components')}
                      </div>
                      <div className="space-y-2">
                        {bom.lines.map((line) => (
                          <div key={line.id} className="flex items-center gap-3 text-sm">
                            <Package className="w-4 h-4 text-gray-400" />
                            <span className="flex-1 text-gray-700">{line.productName}</span>
                            <span className="text-gray-900 tabular-nums font-medium">
                              {line.quantity} {line.uomName}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {data.pagination.totalPages > 1 && (
            <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          )}

          <p className="text-center text-xs text-gray-500">
            {t('common.totalItems', { count: data.pagination.total })}
          </p>
        </>
      )}

      {/* Edit/Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBom ? t('products.editBom') : t('products.addBom')}
        footer={
          <ModalFooter
            error={
              !isFormValid && formData.productTemplateId !== null
                ? (t('products.bomRequiresAtLeastOneComponent') || '请至少添加一个组件')
                : undefined
            }
            left={
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="btn btn-secondary"
                disabled={isSaving}
              >
                {t('common.cancel')}
              </button>
            }
            right={
              <button
                type="submit"
                form="bom-form"
                className="btn btn-primary"
                disabled={!isFormValid || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('common.save')
                )}
              </button>
            }
          />
        }
      >
        <form id="bom-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Finished Product */}
          <FormRow label={t('products.finishedProduct')} required={!editingBom}>
            {editingBom ? (
              <input
                type="text"
                value={selectedProduct?.code ? `[${selectedProduct.code}] ${selectedProduct.name}` : selectedProduct?.name || ''}
                className="input input-readonly"
                readOnly
              />
            ) : (
              <select
                value={formData.productTemplateId || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    productTemplateId: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                className="input"
                required
              >
                <option value="">{t('common.select')}</option>
                {productsData?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `[${p.code}] ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            )}
          </FormRow>

          {/* Two column grid: Quantity + Type */}
          <div className="form-grid form-grid-2">
            <FormRow label={t('products.bomQuantity')}>
              <input
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 1 })}
                className="input tabular-nums"
                min="0.01"
                step="0.01"
              />
            </FormRow>
            <FormRow label={t('products.bomType')}>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="input"
              >
                {bomTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </FormRow>
          </div>

          {/* BOM Code */}
          <FormRow label={t('products.bomCode')} hint={editingBom ? undefined : 'BOM001'}>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className={`input ${editingBom ? 'input-readonly' : ''}`}
              placeholder="BOM001"
              readOnly={!!editingBom}
            />
          </FormRow>

          {/* Components Group */}
          <FormGroup
            title={t('products.components')}
            action={
              <button type="button" onClick={addLine} className="btn-text">
                + {t('products.addComponent')}
              </button>
            }
          >
            <div className="space-y-2">
              {formData.lines.map((line, index) => (
                <div key={index} className="component-row">
                  <select
                    value={line.productId || ''}
                    onChange={(e) =>
                      updateLine(index, 'productId', e.target.value ? parseInt(e.target.value) : null)
                    }
                    className="input component-row-select"
                  >
                    <option value="">{t('common.select')}</option>
                    {productsData?.items
                      .filter((p) => p.id !== formData.productTemplateId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code ? `[${p.code}] ${p.name}` : p.name}
                        </option>
                      ))}
                  </select>
                  <input
                    type="number"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, 'quantity', parseFloat(e.target.value) || 0)}
                    className="input component-row-qty tabular-nums text-right"
                    min="0.01"
                    step="0.01"
                    placeholder={t('purchase.quantity')}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="component-row-delete"
                    disabled={formData.lines.length <= 1}
                    title={formData.lines.length <= 1 ? t('common.error') : undefined}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </FormGroup>
        </form>
      </Modal>
    </div>
  );
}
