'use client';

import { useState, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Package, Star, Check, X, MoreVertical, Plus, Edit2, Upload, Trash2 } from 'lucide-react';
import { useProducts, useCategories, useCreateProduct, useUpdateProduct, useBatchUpdateProducts } from '@/hooks/use-pos';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { SearchBar, FilterOption, FilterGroup } from '@/components/ui/search-bar';
import { PageHeader, Toolbar, ToolbarCheckbox } from '@/components/ui/page-header';
import type { PosProduct } from '@/types';

interface ProductFormData {
  name: string;
  default_code: string;
  list_price: number;
  pos_categ_ids: number[];
  available_in_pos: boolean;
  image_1920: string | null;
  imagePreview: string | null;
}

export default function ProductsListPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showActions, setShowActions] = useState<number | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<PosProduct | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    default_code: '',
    list_price: 0,
    pos_categ_ids: [],
    available_in_pos: true,
    image_1920: null,
    imagePreview: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get category filter
  const categoryFilter = filters.find(f => f.field === 'category')?.value;
  const availableFilter = filters.find(f => f.field === 'available')?.value;

  const { data: categoriesData } = useCategories({ limit: 100 });

  const { data, isLoading, error } = useProducts({
    page,
    limit: 20,
    search: searchQuery || undefined,
    categoryId: categoryFilter ? parseInt(categoryFilter) : undefined,
    available: availableFilter === 'true' ? true : availableFilter === 'false' ? false : undefined,
  });

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const batchUpdateMutation = useBatchUpdateProducts();

  // Build filter groups with categories
  const filterGroups: FilterGroup[] = useMemo(() => {
    const groups: FilterGroup[] = [
      {
        id: 'availability',
        label: t('pos.available'),
        field: 'available',
        options: [
          { value: '', label: t('common.all') },
          { value: 'true', label: t('pos.available') },
          { value: 'false', label: t('pos.soldOut') },
        ],
      },
    ];

    // Add category filter if categories loaded
    if (categoriesData?.items.length) {
      groups.unshift({
        id: 'category',
        label: t('category.title'),
        field: 'category',
        options: [
          { value: '', label: t('common.all') },
          ...categoriesData.items.map((cat) => ({
            value: cat.id.toString(),
            label: cat.name,
          })),
        ],
      });
    }

    return groups;
  }, [t, categoriesData]);

  const products = data?.items || [];

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(price);
  };

  const handleFilterChange = (newFilters: FilterOption[]) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  };

  // Modal handlers
  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      default_code: '',
      list_price: 0,
      pos_categ_ids: [],
      available_in_pos: true,
      image_1920: null,
      imagePreview: null,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (product: PosProduct) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      default_code: product.default_code || '',
      list_price: product.list_price,
      pos_categ_ids: product.pos_categ_ids || [],
      available_in_pos: product.available_in_pos,
      image_1920: null,
      imagePreview: product.image_128 ? `data:image/png;base64,${product.image_128}` : null,
    });
    setIsModalOpen(true);
    setShowActions(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const base64Data = result.split(',')[1];
      setFormData((prev) => ({
        ...prev,
        image_1920: base64Data,
        imagePreview: result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setFormData((prev) => ({
      ...prev,
      image_1920: '',
      imagePreview: null,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        const updateData: Parameters<typeof updateMutation.mutateAsync>[0] = {
          id: editingProduct.id,
          name: formData.name,
          default_code: formData.default_code,
          list_price: formData.list_price,
          pos_categ_ids: formData.pos_categ_ids,
          available_in_pos: formData.available_in_pos,
        };
        if (formData.image_1920 !== null) {
          updateData.image_1920 = formData.image_1920 || null;
        }
        await updateMutation.mutateAsync(updateData);
      } else {
        await createMutation.mutateAsync({
          name: formData.name,
          default_code: formData.default_code || undefined,
          list_price: formData.list_price,
          pos_categ_ids: formData.pos_categ_ids.length > 0 ? formData.pos_categ_ids : undefined,
          available_in_pos: formData.available_in_pos,
          image_1920: formData.image_1920 || undefined,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Failed to save product:', err);
    }
  };

  const toggleAvailable = async (product: PosProduct) => {
    try {
      await updateMutation.mutateAsync({
        id: product.id,
        available_in_pos: !product.available_in_pos,
      });
    } catch (err) {
      console.error('Failed to update product:', err);
    }
    setShowActions(null);
  };

  const batchSetAvailable = async (available: boolean) => {
    if (selectedIds.size === 0) return;
    try {
      await batchUpdateMutation.mutateAsync({
        ids: Array.from(selectedIds),
        available_in_pos: available,
      });
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Failed to batch update:', err);
    }
  };

  const handleCategoryChange = (categoryId: number, checked: boolean) => {
    setFormData((prev) => {
      const newIds = checked
        ? [...prev.pos_categ_ids, categoryId]
        : prev.pos_categ_ids.filter((id) => id !== categoryId);
      return { ...prev, pos_categ_ids: newIds };
    });
  };

  const isAllSelected = selectedIds.size === products.length && products.length > 0;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < products.length;

  return (
    <div className="section-gap">
      <PageHeader
        title={t('products.productList')}
        backHref="/products"
        action={
          <button onClick={openCreateModal} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('product.add')}</span>
          </button>
        }
      />

      <SearchBar
        placeholder={t('products.searchPlaceholder')}
        filterGroups={filterGroups}
        activeFilters={filters}
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
      />

      {products.length > 0 && (
        <div className="flex items-center gap-[var(--space-3)] flex-wrap">
          <Toolbar variant={selectedIds.size > 0 ? 'info' : 'default'}>
            <ToolbarCheckbox
              checked={isAllSelected}
              indeterminate={isSomeSelected}
              onChange={selectAll}
              label={selectedIds.size > 0
                ? t('product.selected', { count: selectedIds.size })
                : t('product.selectAll')
              }
            />
          </Toolbar>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-[var(--space-2)] flex-wrap">
              <button
                onClick={() => batchSetAvailable(true)}
                className="btn btn-xs btn-success"
                disabled={batchUpdateMutation.isPending}
              >
                {t('pos.markAvailable')}
              </button>
              <button
                onClick={() => batchSetAvailable(false)}
                className="btn btn-xs btn-secondary"
                disabled={batchUpdateMutation.isPending}
              >
                {t('pos.markSoldOut')}
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">
          {t('common.error')}: {(error as Error).message}
        </div>
      ) : !products.length ? (
        <EmptyState
          icon="package"
          title={t('pos.noProducts')}
          description={t('pos.noProductsDesc')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className={`card p-3 relative group transition-shadow ${
                  selectedIds.has(product.id) ? 'ring-2 ring-blue-500' : ''
                } ${!product.available_in_pos ? 'opacity-60' : ''}`}
              >
                <div className="flex gap-3">
                  <div className="flex-shrink-0 pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                  </div>

                  <div
                    className="flex-shrink-0 w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
                    onClick={() => openEditModal(product)}
                  >
                    {product.image_128 ? (
                      <img
                        src={`data:image/png;base64,${product.image_128}`}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-gray-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600"
                      onClick={() => openEditModal(product)}
                    >
                      {product.name}
                    </h3>
                    {product.default_code && (
                      <p className="text-xs text-gray-500 mt-0.5">{product.default_code}</p>
                    )}
                    <p className="font-semibold text-blue-600 mt-1">
                      {formatPrice(product.list_price)}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {product.available_in_pos ? (
                        <span className="badge badge-success text-xs">{t('pos.available')}</span>
                      ) : (
                        <span className="badge text-xs bg-gray-100 text-gray-500">{t('pos.soldOut')}</span>
                      )}
                      {product.is_favorite && (
                        <span className="badge badge-warning text-xs">{t('pos.recommended')}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <button
                      onClick={() => setShowActions(showActions === product.id ? null : product.id)}
                      className="p-1 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>

                    {showActions === product.id && (
                      <div className="absolute right-3 top-12 card p-1 min-w-[140px] z-20 shadow-lg">
                        <button
                          onClick={() => openEditModal(product)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 rounded flex items-center gap-2"
                        >
                          <Edit2 className="w-4 h-4 text-blue-600" />
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => toggleAvailable(product)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 rounded flex items-center gap-2"
                          disabled={updateMutation.isPending}
                        >
                          {product.available_in_pos ? (
                            <>
                              <X className="w-4 h-4 text-red-500" />
                              {t('pos.markSoldOut')}
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4 text-green-500" />
                              {t('pos.markAvailable')}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={data?.pagination.totalPages || 1}
            onPageChange={setPage}
          />

          <p className="text-center text-sm text-gray-500">
            {t('common.totalItems', { count: data?.pagination.total || 0 })}
          </p>
        </>
      )}

      {showActions !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setShowActions(null)} />
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingProduct ? t('product.edit') : t('product.add')}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="modal-close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="space-y-4">
                  {/* Image */}
                  <div className="form-row">
                    <label className="form-label">{t('product.image')}</label>
                    <div className="flex items-start gap-4">
                      <div className="relative w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300">
                        {formData.imagePreview ? (
                          <>
                            <img src={formData.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={removeImage}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <Package className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                          id="product-image-input"
                        />
                        <label htmlFor="product-image-input" className="btn btn-sm btn-secondary cursor-pointer">
                          <Upload className="w-4 h-4" />
                          {t('product.uploadImage')}
                        </label>
                        <p className="text-xs text-gray-500 mt-1">{t('product.imageHint')}</p>
                      </div>
                    </div>
                  </div>

                  {/* Name */}
                  <div className="form-row">
                    <label className="form-label">{t('product.name')} *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input"
                      required
                      autoFocus
                    />
                  </div>

                  {/* Code */}
                  <div className="form-row">
                    <label className="form-label">{t('product.code')}</label>
                    <input
                      type="text"
                      value={formData.default_code}
                      onChange={(e) => setFormData({ ...formData, default_code: e.target.value })}
                      className="input"
                      placeholder={t('product.codePlaceholder')}
                    />
                  </div>

                  {/* Price */}
                  <div className="form-row">
                    <label className="form-label">{t('product.price')} *</label>
                    <input
                      type="number"
                      value={formData.list_price}
                      onChange={(e) => setFormData({ ...formData, list_price: parseFloat(e.target.value) || 0 })}
                      className="input"
                      min="0"
                      step="1"
                      required
                    />
                  </div>

                  {/* Categories */}
                  <div className="form-row">
                    <label className="form-label">{t('category.title')}</label>
                    <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                      {categoriesData?.items.map((cat) => (
                        <label key={cat.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.pos_categ_ids.includes(cat.id)}
                            onChange={(e) => handleCategoryChange(cat.id, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                          />
                          <span className="text-sm">{cat.name}</span>
                        </label>
                      ))}
                      {!categoriesData?.items.length && (
                        <p className="text-sm text-gray-500 py-2">{t('category.noCategories')}</p>
                      )}
                    </div>
                  </div>

                  {/* Availability */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.available_in_pos}
                      onChange={(e) => setFormData({ ...formData, available_in_pos: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm">{t('product.availableForSale')}</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <div />
                <div className="modal-footer-actions">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary">
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending ? t('common.loading') : t('common.save')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
