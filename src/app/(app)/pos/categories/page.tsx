'use client';

import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FolderTree, Plus, Edit2, Trash2, GripVertical, ChevronRight, ChevronDown, ChevronLeft, Upload } from 'lucide-react';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/use-pos';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchBar, FilterOption } from '@/components/ui/search-bar';
import type { PosCategory } from '@/types';

interface CategoryFormData {
  name: string;
  parent_id: number | null;
  sequence: number;
  image_1920: string | null;
  imagePreview: string | null;
}

export default function CategoriesPage() {
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

    // Group by parent
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

    // Attach children to parents
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
          updateData.image_1920 = formData.image_1920 || null;
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
    if (confirm(t('category.confirmDelete'))) {
      try {
        await deleteMutation.mutateAsync(id);
      } catch (err) {
        alert((err as Error).message);
      }
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

  const renderCategory = (category: PosCategory & { children?: PosCategory[] }, level = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedIds.has(category.id);

    return (
      <div key={category.id}>
        <div
          className={`flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-100 ${
            level > 0 ? 'bg-gray-50/50' : ''
          }`}
          style={{ paddingLeft: `${level * 24 + 12}px` }}
        >
          <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />

          {hasChildren ? (
            <button onClick={() => toggleExpand(category.id)} className="p-1">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-600" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center overflow-hidden">
            {category.image_128 ? (
              <img
                src={`data:image/png;base64,${category.image_128}`}
                alt={category.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <FolderTree className="w-5 h-5 text-blue-600" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900">{category.name}</h3>
            <p className="text-xs text-gray-500">
              {t('category.sequence')}: {category.sequence}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => openCreateModal(category.id)}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
              title={t('category.addChild')}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => openEditModal(category)}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
              title={t('common.edit')}
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(category.id)}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
              title={t('common.delete')}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {category.children!.map((child) =>
              renderCategory({ ...child, children: [] }, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/pos" className="page-title flex items-center gap-1 hover:text-[var(--color-primary)] transition-colors">
          <ChevronLeft className="w-5 h-5" />
          {t('category.title')}
        </Link>
        <button
          onClick={() => openCreateModal()}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('category.add')}
        </button>
      </div>

      <SearchBar
        placeholder={t('common.search')}
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
      ) : !data?.items.length ? (
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingCategory ? t('category.edit') : t('category.add')}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Category Icon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('category.icon')}
                </label>
                <div className="flex items-start gap-4">
                  <div className="relative w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300">
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
                          className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <FolderTree className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                      id="category-icon-input"
                    />
                    <label
                      htmlFor="category-icon-input"
                      className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      {t('category.uploadIcon')}
                    </label>
                    <p className="mt-1 text-xs text-gray-500">
                      {t('product.imageHint')}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('category.name')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('category.parent')}
                </label>
                <select
                  value={formData.parent_id || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      parent_id: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  className="input w-full"
                >
                  <option value="">{t('category.noParent')}</option>
                  {data?.items
                    .filter((c) => c.id !== editingCategory?.id)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.parent_id ? `${cat.parent_id[1]} / ${cat.name}` : cat.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('category.sequence')}
                </label>
                <input
                  type="number"
                  value={formData.sequence}
                  onChange={(e) =>
                    setFormData({ ...formData, sequence: parseInt(e.target.value) || 0 })
                  }
                  className="input w-full"
                  min="0"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
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
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
