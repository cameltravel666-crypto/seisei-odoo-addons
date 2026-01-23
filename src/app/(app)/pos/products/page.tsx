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

export default function ProductsPage() {
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
  const recommendedFilter = filters.find(f => f.field === 'recommended')?.value;

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
      {
        id: 'recommended',
        label: t('pos.recommended'),
        field: 'recommended',
        options: [
          { value: '', label: t('common.all') },
          { value: 'true', label: t('pos.recommended') },
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

  // Filter products client-side for recommended (availability is now server-side)
  const filteredProducts = useMemo(() => {
    if (!data?.items) return [];
    let items = data.items;

    if (recommendedFilter === 'true') {
      items = items.filter((p) => p.is_favorite);
    }

    return items;
  }, [data?.items, recommendedFilter]);

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
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      // Extract base64 data without the data URL prefix
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
        // Only include image if it was changed
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

  const toggleRecommended = async (product: PosProduct) => {
    try {
      await updateMutation.mutateAsync({
        id: product.id,
        is_favorite: !product.is_favorite,
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

  const batchSetRecommended = async (recommended: boolean) => {
    if (selectedIds.size === 0) return;
    try {
      await batchUpdateMutation.mutateAsync({
        ids: Array.from(selectedIds),
        is_favorite: recommended,
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

  const isAllSelected = selectedIds.size === filteredProducts.length && filteredProducts.length > 0;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < filteredProducts.length;

  return (
    <div className="section-gap">
      {/* Page Header - Title + Action Button */}
      <PageHeader
        title={t('pos.products')}
        backHref="/pos"
        action={
          <button onClick={openCreateModal} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('product.add')}</span>
          </button>
        }
      />

      {/* Search Bar - Fixed 44px height */}
      <SearchBar
        placeholder={t('products.searchPlaceholder')}
        filterGroups={filterGroups}
        activeFilters={filters}
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
      />

      {/* Toolbar - Select All + Batch Actions */}
      {filteredProducts.length > 0 && (
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

          {/* Batch actions - Only show when items selected */}
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
              <button
                onClick={() => batchSetRecommended(true)}
                className="btn btn-xs"
                style={{ backgroundColor: 'var(--color-warning)', color: 'white' }}
                disabled={batchUpdateMutation.isPending}
              >
                <Star className="w-3 h-3" />
              </button>
              <button
                onClick={() => batchSetRecommended(false)}
                className="btn btn-xs btn-ghost"
                disabled={batchUpdateMutation.isPending}
              >
                <Star className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-[var(--space-6)] text-center text-[var(--color-danger)]">
          {t('common.error')}: {(error as Error).message}
        </div>
      ) : !filteredProducts.length ? (
        <EmptyState
          icon="package"
          title={t('pos.noProducts')}
          description={t('pos.noProductsDesc')}
        />
      ) : (
        <>
          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-3)]">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className={`card p-[var(--space-3)] relative group transition-shadow ${
                  selectedIds.has(product.id) ? 'ring-2 ring-[var(--color-primary)]' : ''
                } ${!product.available_in_pos ? 'opacity-60' : ''}`}
              >
                <div className="flex gap-[var(--space-3)]">
                  {/* Selection checkbox */}
                  <div className="flex-shrink-0 pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      className="w-4 h-4 rounded border-[var(--color-border-default)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                    />
                  </div>

                  {/* Product image - click to edit */}
                  <div
                    className="flex-shrink-0 w-16 h-16 bg-[var(--color-bg-muted)] rounded-[var(--radius-md)] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
                    onClick={() => openEditModal(product)}
                  >
                    {product.image_128 ? (
                      <img
                        src={`data:image/png;base64,${product.image_128}`}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-[var(--color-text-tertiary)]" />
                    )}
                  </div>

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-body font-medium text-clamp-2 cursor-pointer hover:text-[var(--color-primary)]"
                      onClick={() => openEditModal(product)}
                    >
                      {product.name}
                    </h3>
                    {product.default_code && (
                      <p className="text-micro mt-0.5">{product.default_code}</p>
                    )}
                    <p className="text-body font-semibold text-[var(--color-primary)] mt-1 tabular-nums">
                      {formatPrice(product.list_price)}
                    </p>
                    {/* Status badges */}
                    <div className="flex flex-wrap gap-1 mt-[var(--space-2)]">
                      {product.available_in_pos ? (
                        <span className="badge badge-success">{t('pos.available')}</span>
                      ) : (
                        <span className="badge" style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-secondary)' }}>
                          {t('pos.soldOut')}
                        </span>
                      )}
                      {product.is_favorite && (
                        <span className="badge badge-warning">{t('pos.recommended')}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions menu */}
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => setShowActions(showActions === product.id ? null : product.id)}
                      className="btn-icon btn-icon-sm btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {showActions === product.id && (
                      <div className="absolute right-[var(--space-3)] top-12 card p-[var(--space-1)] min-w-[160px] z-20 shadow-elevated">
                        <button
                          onClick={() => openEditModal(product)}
                          className="w-full px-[var(--space-3)] py-[var(--space-2)] text-left text-sub hover:bg-[var(--color-bg-muted)] rounded-[var(--radius-sm)] flex items-center gap-[var(--space-2)]"
                        >
                          <Edit2 className="w-4 h-4 text-[var(--color-primary)]" />
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => toggleAvailable(product)}
                          className="w-full px-[var(--space-3)] py-[var(--space-2)] text-left text-sub hover:bg-[var(--color-bg-muted)] rounded-[var(--radius-sm)] flex items-center gap-[var(--space-2)]"
                          disabled={updateMutation.isPending}
                        >
                          {product.available_in_pos ? (
                            <>
                              <X className="w-4 h-4 text-[var(--color-danger)]" />
                              {t('pos.markSoldOut')}
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4 text-[var(--color-success)]" />
                              {t('pos.markAvailable')}
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => toggleRecommended(product)}
                          className="w-full px-[var(--space-3)] py-[var(--space-2)] text-left text-sub hover:bg-[var(--color-bg-muted)] rounded-[var(--radius-sm)] flex items-center gap-[var(--space-2)]"
                          disabled={updateMutation.isPending}
                        >
                          <Star
                            className={`w-4 h-4 ${
                              product.is_favorite ? 'text-[var(--color-warning)] fill-[var(--color-warning)]' : 'text-[var(--color-text-tertiary)]'
                            }`}
                          />
                          {product.is_favorite ? t('pos.removeRecommended') : t('pos.markRecommended')}
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

          <p className="text-center text-sub">
            {t('common.totalItems', { count: data?.pagination.total || 0 })}
          </p>
        </>
      )}

      {/* Click outside to close actions */}
      {showActions !== null && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowActions(null)}
        />
      )}

      {/* Create/Edit Modal - Using design tokens */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingProduct ? t('product.edit') : t('product.add')}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="modal-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid" style={{ gap: 'var(--row-gap)' }}>
                  {/* Product Image */}
                  <div className="form-row">
                    <label className="form-label">{t('product.image')}</label>
                    <div className="flex items-start gap-[var(--space-4)]">
                      {/* Image Preview */}
                      <div className="relative w-20 h-20 bg-[var(--color-bg-muted)] rounded-[var(--radius-md)] flex items-center justify-center overflow-hidden border-2 border-dashed border-[var(--color-border-default)]">
                        {formData.imagePreview ? (
                          <>
                            <img
                              src={formData.imagePreview}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={removeImage}
                              className="absolute top-1 right-1 p-1 bg-[var(--color-danger)] text-white rounded-full hover:bg-[var(--color-danger-hover)]"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <Package className="w-8 h-8 text-[var(--color-text-tertiary)]" />
                        )}
                      </div>

                      {/* Upload Button */}
                      <div className="flex-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                          id="product-image-input"
                        />
                        <label
                          htmlFor="product-image-input"
                          className="btn btn-sm btn-secondary cursor-pointer"
                        >
                          <Upload className="w-4 h-4" />
                          {t('product.uploadImage')}
                        </label>
                        <p className="form-hint mt-1">{t('product.imageHint')}</p>
                      </div>
                    </div>
                  </div>

                  {/* Product Name */}
                  <div className="form-row">
                    <label className="form-label form-label-required">{t('product.name')}</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input"
                      required
                      autoFocus
                    />
                  </div>

                  {/* Product Code */}
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
                    <label className="form-label form-label-required">{t('product.price')}</label>
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
                    <div className="max-h-32 overflow-y-auto border border-[var(--color-border-default)] rounded-[var(--radius-md)] p-[var(--space-2)]">
                      {categoriesData?.items.map((cat) => (
                        <label key={cat.id} className="flex items-center gap-[var(--space-2)] py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.pos_categ_ids.includes(cat.id)}
                            onChange={(e) => handleCategoryChange(cat.id, e.target.checked)}
                            className="w-4 h-4 rounded border-[var(--color-border-default)] text-[var(--color-primary)]"
                          />
                          <span className="text-body">{cat.name}</span>
                        </label>
                      ))}
                      {!categoriesData?.items.length && (
                        <p className="text-sub py-[var(--space-2)]">{t('category.noCategories')}</p>
                      )}
                    </div>
                  </div>

                  {/* Availability */}
                  <label className="flex items-center gap-[var(--space-3)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.available_in_pos}
                      onChange={(e) => setFormData({ ...formData, available_in_pos: e.target.checked })}
                      className="w-4 h-4 rounded border-[var(--color-border-default)] text-[var(--color-primary)]"
                    />
                    <span className="text-body">{t('product.availableForSale')}</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <div />
                <div className="modal-footer-actions">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="btn btn-secondary"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? t('common.loading')
                      : t('common.save')}
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
