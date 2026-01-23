'use client';

import { useState, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FolderTree, Plus, Edit2, Trash2, ChevronRight, ChevronDown, Upload, X } from 'lucide-react';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/use-pos';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchBar, FilterOption } from '@/components/ui/search-bar';
import { PageHeader } from '@/components/ui/page-header';
import type { PosCategory } from '@/types';

interface CategoryFormData {
  name: string;
  parent_id: number | null;
  sequence: number;
  image_1920: string | null;
  imagePreview: string | null;
}

export default function ProductCategoriesPage() {
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PosCategory | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    parent_id: null,
    sequence: 10,
    image_1920: null,
    imagePreview: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useCategories({
    limit: 200,
    search: searchQuery || undefined,
  });

  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  // Build tree structure
  const categoryTree = useMemo(() => {
    if (!data?.items) return [];

    const items = data.items;
    const rootCategories: (PosCategory & { children: PosCategory[] })[] = [];
    const childMap = new Map<number, PosCategory[]>();

    items.forEach((cat) => {
      const parentId = cat.parent_id ? cat.parent_id[0] : null;
      if (parentId) {
        if (!childMap.has(parentId)) {
          childMap.set(parentId, []);
        }
        childMap.get(parentId)!.push(cat);
      } else {
        rootCategories.push({ ...cat, children: [] });
      }
    });

    rootCategories.forEach((root) => {
      root.children = childMap.get(root.id) || [];
    });

    return rootCategories;
  }, [data?.items]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilterChange = (newFilters: FilterOption[]) => {
    setFilters(newFilters);
  };

  const openCreateModal = (parentId?: number) => {
    setEditingCategory(null);
    setFormData({
      name: '',
      parent_id: parentId || null,
      sequence: 10,
      image_1920: null,
      imagePreview: null,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (category: PosCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      parent_id: category.parent_id ? category.parent_id[0] : null,
      sequence: category.sequence,
      image_1920: null,
      imagePreview: category.image_128 ? `data:image/png;base64,${category.image_128}` : null,
    });
    setIsModalOpen(true);
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
      if (editingCategory) {
        const updateData: Parameters<typeof updateMutation.mutateAsync>[0] = {
          id: editingCategory.id,
          name: formData.name,
          parent_id: formData.parent_id,
          sequence: formData.sequence,
        };
        if (formData.image_1920 !== null) {
          updateData.image_1920 = formData.image_1920 || undefined;
        }
        await updateMutation.mutateAsync(updateData);
      } else {
        await createMutation.mutateAsync({
          name: formData.name,
          parent_id: formData.parent_id || undefined,
          sequence: formData.sequence,
          image_1920: formData.image_1920 || undefined,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Failed to save category:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('category.deleteConfirm'))) return;
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
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

  const renderCategory = (category: PosCategory & { children: PosCategory[] }, level = 0) => {
    const hasChildren = category.children.length > 0;
    const isExpanded = expandedIds.has(category.id);

    return (
      <div key={category.id}>
        <div
          className={`flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-100 ${
            level > 0 ? 'bg-gray-50/50' : ''
          }`}
          style={{ paddingLeft: `${level * 24 + 12}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(category.id)} className="p-1 hover:bg-gray-200 rounded">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
            {category.image_128 ? (
              <img
                src={`data:image/png;base64,${category.image_128}`}
                alt={category.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <FolderTree className="w-5 h-5 text-gray-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate">{category.name}</h3>
            <p className="text-xs text-gray-500">
              {t('category.sequence')}: {category.sequence}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => openCreateModal(category.id)}
              className="p-2 hover:bg-gray-200 rounded-lg"
              title={t('category.addSub')}
            >
              <Plus className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={() => openEditModal(category)}
              className="p-2 hover:bg-gray-200 rounded-lg"
              title={t('common.edit')}
            >
              <Edit2 className="w-4 h-4 text-blue-600" />
            </button>
            <button
              onClick={() => handleDelete(category.id)}
              className="p-2 hover:bg-gray-200 rounded-lg"
              title={t('common.delete')}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {category.children.map((child) =>
              renderCategory({ ...child, children: [] }, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="section-gap">
      <PageHeader
        title={t('category.title')}
        backHref="/products"
        action={
          <button onClick={() => openCreateModal()} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('category.add')}</span>
          </button>
        }
      />

      <SearchBar
        placeholder={t('category.searchPlaceholder')}
        filterGroups={[]}
        activeFilters={filters}
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
      />

      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">
          {t('common.error')}: {(error as Error).message}
        </div>
      ) : !categoryTree.length ? (
        <EmptyState
          icon="folder"
          title={t('category.noCategories')}
          description={t('category.noCategoriesDesc')}
        />
      ) : (
        <div className="card overflow-hidden">
          {categoryTree.map((category) => renderCategory(category))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingCategory ? t('category.edit') : t('category.add')}
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
                    <label className="form-label">{t('category.image')}</label>
                    <div className="flex items-start gap-4">
                      <div className="relative w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300">
                        {formData.imagePreview ? (
                          <>
                            <img src={formData.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={removeImage}
                              className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <FolderTree className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                          id="category-image-input"
                        />
                        <label htmlFor="category-image-input" className="btn btn-sm btn-secondary cursor-pointer">
                          <Upload className="w-4 h-4" />
                          {t('product.uploadImage')}
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Name */}
                  <div className="form-row">
                    <label className="form-label">{t('category.name')} *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input"
                      required
                      autoFocus
                    />
                  </div>

                  {/* Parent Category */}
                  <div className="form-row">
                    <label className="form-label">{t('category.parent')}</label>
                    <select
                      value={formData.parent_id || ''}
                      onChange={(e) => setFormData({ ...formData, parent_id: e.target.value ? parseInt(e.target.value) : null })}
                      className="input"
                    >
                      <option value="">{t('category.noParent')}</option>
                      {data?.items
                        .filter((c) => c.id !== editingCategory?.id)
                        .map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Sequence */}
                  <div className="form-row">
                    <label className="form-label">{t('category.sequence')}</label>
                    <input
                      type="number"
                      value={formData.sequence}
                      onChange={(e) => setFormData({ ...formData, sequence: parseInt(e.target.value) || 10 })}
                      className="input"
                      min="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('category.sequenceHint')}</p>
                  </div>
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
