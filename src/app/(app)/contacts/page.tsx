'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { User, Mail, Phone, Building2, MapPin, Search, Plus, Edit2, Save, X, ChevronRight, Archive, ArchiveRestore } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { Modal, ModalFooter } from '@/components/ui/modal';

type FilterType = 'all' | 'company' | 'person';

interface Contact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  isCompany: boolean;
  parentName: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  countryName: string | null;
  function: string | null;
  website: string | null;
  comment: string | null;
  active: boolean;
}

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  mobile: string;
  street: string;
  street2: string;
  city: string;
  zip: string;
  function: string;
  website: string;
  comment: string;
}

export default function ContactsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [createFormData, setCreateFormData] = useState<ContactFormData & { isCompany: boolean }>({
    name: '',
    email: '',
    phone: '',
    mobile: '',
    street: '',
    street2: '',
    city: '',
    zip: '',
    function: '',
    website: '',
    comment: '',
    isCompany: false,
  });
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    phone: '',
    mobile: '',
    street: '',
    street2: '',
    city: '',
    zip: '',
    function: '',
    website: '',
    comment: '',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['contacts', page, searchQuery, filter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      if (searchQuery) params.set('search', searchQuery);
      if (filter !== 'all') params.set('filter', filter);

      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  // Fetch single contact detail
  const { data: contactDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['contact', selectedContact?.id],
    queryFn: async () => {
      if (!selectedContact?.id) return null;
      const res = await fetch(`/api/contacts/${selectedContact.id}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data as Contact;
    },
    enabled: !!selectedContact?.id && isDetailOpen,
  });

  // Update contact mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; values: Partial<ContactFormData> }) => {
      const res = await fetch(`/api/contacts/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.values),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to update');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', selectedContact?.id] });
      setIsEditing(false);
    },
  });

  // Archive/Unarchive contact mutation
  const archiveMutation = useMutation({
    mutationFn: async (data: { id: number; active: boolean }) => {
      const res = await fetch(`/api/contacts/${data.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: data.active }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to archive');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', selectedContact?.id] });
    },
  });

  // Create contact mutation
  const createMutation = useMutation({
    mutationFn: async (data: ContactFormData & { isCompany: boolean }) => {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Failed to create');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setIsCreateOpen(false);
      setCreateFormData({
        name: '',
        email: '',
        phone: '',
        mobile: '',
        street: '',
        street2: '',
        city: '',
        zip: '',
        function: '',
        website: '',
        comment: '',
        isCompany: false,
      });
    },
  });

  const handleArchive = () => {
    if (contactDetail && selectedContact) {
      archiveMutation.mutate({
        id: selectedContact.id,
        active: !contactDetail.active,
      });
    }
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPage(1);
  };

  const openDetail = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDetailOpen(true);
    setIsEditing(false);
  };

  const closeDetail = () => {
    setIsDetailOpen(false);
    setSelectedContact(null);
    setIsEditing(false);
  };

  const startEditing = () => {
    if (contactDetail) {
      setFormData({
        name: contactDetail.name || '',
        email: contactDetail.email || '',
        phone: contactDetail.phone || '',
        mobile: contactDetail.mobile || '',
        street: contactDetail.street || '',
        street2: contactDetail.street2 || '',
        city: contactDetail.city || '',
        zip: contactDetail.zip || '',
        function: contactDetail.function || '',
        website: contactDetail.website || '',
        comment: contactDetail.comment || '',
      });
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const saveChanges = () => {
    if (selectedContact) {
      updateMutation.mutate({
        id: selectedContact.id,
        values: formData,
      });
    }
  };

  const handleInputChange = (field: keyof ContactFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateInputChange = (field: keyof (ContactFormData & { isCompany: boolean }), value: string | boolean) => {
    setCreateFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateContact = () => {
    if (createFormData.name.trim()) {
      createMutation.mutate(createFormData);
    }
  };

  const openCreateModal = () => {
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateFormData({
      name: '',
      email: '',
      phone: '',
      mobile: '',
      street: '',
      street2: '',
      city: '',
      zip: '',
      function: '',
      website: '',
      comment: '',
      isCompany: false,
    });
    createMutation.reset();
  };

  return (
    <div className="space-y-4">
      {/* Header with title and add button */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">{t('nav.contacts')}</h1>
        <button
          onClick={openCreateModal}
          className="btn btn-primary btn-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('contacts.addContact')}</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {(['all', 'company', 'person'] as FilterType[]).map((type) => (
          <button
            key={type}
            onClick={() => { setFilter(type); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              filter === type
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(`contacts.filter${type.charAt(0).toUpperCase() + type.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('contacts.searchPlaceholder')}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </form>

      {isLoading ? (
        <Loading text={t('common.loading')} />
      ) : error ? (
        <div className="card p-6 text-center text-red-600">{(error as Error).message}</div>
      ) : !data?.items.length ? (
        <EmptyState icon="user" title={t('contacts.noContacts')} description={t('contacts.noContactsDesc')} />
      ) : (
        <>
          {/* Contacts Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data.items as Contact[]).map((contact) => (
              <div
                key={contact.id}
                className="card p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openDetail(contact)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    contact.isCompany ? 'bg-amber-50' : 'bg-rose-50'
                  }`}>
                    {contact.isCompany ? (
                      <Building2 className="w-6 h-6 text-amber-500" />
                    ) : (
                      <User className="w-6 h-6 text-rose-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{contact.name}</h3>
                    {contact.parentName && (
                      <p className="text-sm text-gray-500 truncate">{contact.parentName}</p>
                    )}
                    {contact.function && !contact.isCompany && (
                      <p className="text-sm text-gray-500 truncate">{contact.function}</p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
                <div className="space-y-2 text-sm">
                  {contact.email && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                  )}
                  {(contact.phone || contact.mobile) && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Phone className="w-4 h-4 flex-shrink-0" />
                      <span>{contact.mobile || contact.phone}</span>
                    </div>
                  )}
                  {(contact.city || contact.countryName) && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">
                        {[contact.city, contact.countryName].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data.pagination.totalPages > 1 && (
            <Pagination page={page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
          )}
          <p className="text-center text-sm text-gray-500">{t('common.totalItems', { count: data.pagination.total })}</p>
        </>
      )}

      {/* Contact Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={closeDetail}
        title={isEditing ? t('contacts.editContact') : t('contacts.contactDetail')}
        footer={
          <ModalFooter
            error={updateMutation.error || archiveMutation.error ? ((updateMutation.error || archiveMutation.error) as Error).message : undefined}
            left={
              !isEditing && contactDetail && (
                <button
                  type="button"
                  onClick={handleArchive}
                  className={`btn ${contactDetail.active ? 'btn-secondary' : 'btn-success'} flex items-center gap-1`}
                  disabled={archiveMutation.isPending}
                >
                  {contactDetail.active ? (
                    <>
                      <Archive className="w-4 h-4" />
                      {archiveMutation.isPending ? t('common.loading') : t('contacts.archive')}
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="w-4 h-4" />
                      {archiveMutation.isPending ? t('common.loading') : t('contacts.unarchive')}
                    </>
                  )}
                </button>
              )
            }
            right={
              isEditing ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="btn btn-secondary"
                    disabled={updateMutation.isPending}
                  >
                    <X className="w-4 h-4 mr-1" />
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={saveChanges}
                    className="btn btn-primary"
                    disabled={updateMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {updateMutation.isPending ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startEditing}
                  className="btn btn-primary"
                >
                  <Edit2 className="w-4 h-4 mr-1" />
                  {t('common.edit')}
                </button>
              )
            }
          />
        }
      >
        {isLoadingDetail ? (
          <Loading text={t('common.loading')} />
        ) : contactDetail ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                contactDetail.isCompany ? 'bg-amber-50' : 'bg-rose-50'
              }`}>
                {contactDetail.isCompany ? (
                  <Building2 className="w-8 h-8 text-amber-500" />
                ) : (
                  <User className="w-8 h-8 text-rose-500" />
                )}
              </div>
              <div>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="input text-lg font-semibold"
                    placeholder={t('contacts.name')}
                  />
                ) : (
                  <h3 className="text-lg font-semibold text-gray-900">{contactDetail.name}</h3>
                )}
                {contactDetail.parentName && (
                  <p className="text-sm text-gray-500">{contactDetail.parentName}</p>
                )}
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700 border-b pb-2">{t('contacts.contactInfo')}</h4>

              {/* Email */}
              <div className="form-row">
                <label className="form-label flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {t('contacts.email')}
                </label>
                {isEditing ? (
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="input"
                  />
                ) : (
                  <p className="text-gray-900">{contactDetail.email || '-'}</p>
                )}
              </div>

              {/* Phone */}
              <div className="form-row">
                <label className="form-label flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {t('contacts.phone')}
                </label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="input"
                  />
                ) : (
                  <p className="text-gray-900">{contactDetail.phone || '-'}</p>
                )}
              </div>

              {/* Mobile */}
              <div className="form-row">
                <label className="form-label flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {t('contacts.mobile')}
                </label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => handleInputChange('mobile', e.target.value)}
                    className="input"
                  />
                ) : (
                  <p className="text-gray-900">{contactDetail.mobile || '-'}</p>
                )}
              </div>

              {/* Function/Title (for persons only) */}
              {!contactDetail.isCompany && (
                <div className="form-row">
                  <label className="form-label">{t('contacts.function')}</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.function}
                      onChange={(e) => handleInputChange('function', e.target.value)}
                      className="input"
                    />
                  ) : (
                    <p className="text-gray-900">{contactDetail.function || '-'}</p>
                  )}
                </div>
              )}

              {/* Website */}
              <div className="form-row">
                <label className="form-label">{t('contacts.website')}</label>
                {isEditing ? (
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    className="input"
                  />
                ) : (
                  <p className="text-gray-900">
                    {contactDetail.website ? (
                      <a href={contactDetail.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {contactDetail.website}
                      </a>
                    ) : '-'}
                  </p>
                )}
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700 border-b pb-2">{t('contacts.address')}</h4>

              <div className="form-row">
                <label className="form-label">{t('contacts.street')}</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.street}
                    onChange={(e) => handleInputChange('street', e.target.value)}
                    className="input"
                  />
                ) : (
                  <p className="text-gray-900">{contactDetail.street || '-'}</p>
                )}
              </div>

              <div className="form-row">
                <label className="form-label">{t('contacts.street2')}</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.street2}
                    onChange={(e) => handleInputChange('street2', e.target.value)}
                    className="input"
                  />
                ) : (
                  <p className="text-gray-900">{contactDetail.street2 || '-'}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-row">
                  <label className="form-label">{t('contacts.city')}</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="input"
                    />
                  ) : (
                    <p className="text-gray-900">{contactDetail.city || '-'}</p>
                  )}
                </div>
                <div className="form-row">
                  <label className="form-label">{t('contacts.zip')}</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.zip}
                      onChange={(e) => handleInputChange('zip', e.target.value)}
                      className="input"
                    />
                  ) : (
                    <p className="text-gray-900">{contactDetail.zip || '-'}</p>
                  )}
                </div>
              </div>

              {!isEditing && contactDetail.countryName && (
                <div className="form-row">
                  <label className="form-label">{t('contacts.country')}</label>
                  <p className="text-gray-900">{contactDetail.countryName}</p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700 border-b pb-2">{t('contacts.notes')}</h4>
              <div className="form-row">
                {isEditing ? (
                  <textarea
                    value={formData.comment}
                    onChange={(e) => handleInputChange('comment', e.target.value)}
                    className="input min-h-[100px]"
                    rows={4}
                  />
                ) : (
                  <p className="text-gray-900 whitespace-pre-wrap">{contactDetail.comment || '-'}</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Create Contact Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={closeCreateModal}
        title={t('contacts.addContact')}
        footer={
          <ModalFooter
            error={createMutation.error ? (createMutation.error as Error).message : undefined}
            right={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="btn btn-secondary"
                  disabled={createMutation.isPending}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleCreateContact}
                  className="btn btn-primary"
                  disabled={createMutation.isPending || !createFormData.name.trim()}
                >
                  <Save className="w-4 h-4 mr-1" />
                  {createMutation.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            }
          />
        }
      >
        <div className="space-y-6">
          {/* Contact Type Toggle */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="contactType"
                checked={!createFormData.isCompany}
                onChange={() => handleCreateInputChange('isCompany', false)}
                className="w-4 h-4 text-blue-600"
              />
              <User className="w-4 h-4 text-rose-500" />
              <span>{t('contacts.filterPerson')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="contactType"
                checked={createFormData.isCompany}
                onChange={() => handleCreateInputChange('isCompany', true)}
                className="w-4 h-4 text-blue-600"
              />
              <Building2 className="w-4 h-4 text-amber-500" />
              <span>{t('contacts.filterCompany')}</span>
            </label>
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700 border-b pb-2">{t('contacts.contactInfo')}</h4>

            <div className="form-row">
              <label className="form-label">{t('contacts.name')} *</label>
              <input
                type="text"
                value={createFormData.name}
                onChange={(e) => handleCreateInputChange('name', e.target.value)}
                className="input"
                placeholder={createFormData.isCompany ? t('contacts.companyName') : t('contacts.personName')}
                autoFocus
              />
            </div>

            <div className="form-row">
              <label className="form-label flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {t('contacts.email')}
              </label>
              <input
                type="email"
                value={createFormData.email}
                onChange={(e) => handleCreateInputChange('email', e.target.value)}
                className="input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-row">
                <label className="form-label flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {t('contacts.phone')}
                </label>
                <input
                  type="tel"
                  value={createFormData.phone}
                  onChange={(e) => handleCreateInputChange('phone', e.target.value)}
                  className="input"
                />
              </div>
              <div className="form-row">
                <label className="form-label">{t('contacts.mobile')}</label>
                <input
                  type="tel"
                  value={createFormData.mobile}
                  onChange={(e) => handleCreateInputChange('mobile', e.target.value)}
                  className="input"
                />
              </div>
            </div>

            {!createFormData.isCompany && (
              <div className="form-row">
                <label className="form-label">{t('contacts.function')}</label>
                <input
                  type="text"
                  value={createFormData.function}
                  onChange={(e) => handleCreateInputChange('function', e.target.value)}
                  className="input"
                  placeholder={t('contacts.functionPlaceholder')}
                />
              </div>
            )}

            <div className="form-row">
              <label className="form-label">{t('contacts.website')}</label>
              <input
                type="url"
                value={createFormData.website}
                onChange={(e) => handleCreateInputChange('website', e.target.value)}
                className="input"
                placeholder="https://"
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700 border-b pb-2">{t('contacts.address')}</h4>

            <div className="form-row">
              <label className="form-label">{t('contacts.street')}</label>
              <input
                type="text"
                value={createFormData.street}
                onChange={(e) => handleCreateInputChange('street', e.target.value)}
                className="input"
              />
            </div>

            <div className="form-row">
              <label className="form-label">{t('contacts.street2')}</label>
              <input
                type="text"
                value={createFormData.street2}
                onChange={(e) => handleCreateInputChange('street2', e.target.value)}
                className="input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-row">
                <label className="form-label">{t('contacts.city')}</label>
                <input
                  type="text"
                  value={createFormData.city}
                  onChange={(e) => handleCreateInputChange('city', e.target.value)}
                  className="input"
                />
              </div>
              <div className="form-row">
                <label className="form-label">{t('contacts.zip')}</label>
                <input
                  type="text"
                  value={createFormData.zip}
                  onChange={(e) => handleCreateInputChange('zip', e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700 border-b pb-2">{t('contacts.notes')}</h4>
            <div className="form-row">
              <textarea
                value={createFormData.comment}
                onChange={(e) => handleCreateInputChange('comment', e.target.value)}
                className="input min-h-[80px]"
                rows={3}
                placeholder={t('contacts.notesPlaceholder')}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
