'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { User, Mail, Phone, Building2, ArrowLeft, Save } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

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
  isCompany: boolean;
}

export default function CreateContactPage() {
  const t = useTranslations();
  const router = useRouter();
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
    isCompany: false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
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
      router.push('/contacts');
    },
  });

  const handleInputChange = (field: keyof ContactFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="page-title">{t('contacts.addContact')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 max-w-2xl space-y-6">
        {/* Contact Type Toggle */}
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="contactType"
              checked={!formData.isCompany}
              onChange={() => handleInputChange('isCompany', false)}
              className="w-4 h-4 text-blue-600"
            />
            <User className="w-4 h-4 text-rose-500" />
            <span>{t('contacts.filterPerson')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="contactType"
              checked={formData.isCompany}
              onChange={() => handleInputChange('isCompany', true)}
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
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="input"
              placeholder={formData.isCompany ? t('contacts.companyName') : t('contacts.personName')}
              autoFocus
              required
            />
          </div>

          <div className="form-row">
            <label className="form-label flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {t('contacts.email')}
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
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
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className="input"
              />
            </div>
            <div className="form-row">
              <label className="form-label">{t('contacts.mobile')}</label>
              <input
                type="tel"
                value={formData.mobile}
                onChange={(e) => handleInputChange('mobile', e.target.value)}
                className="input"
              />
            </div>
          </div>

          {!formData.isCompany && (
            <div className="form-row">
              <label className="form-label">{t('contacts.function')}</label>
              <input
                type="text"
                value={formData.function}
                onChange={(e) => handleInputChange('function', e.target.value)}
                className="input"
                placeholder={t('contacts.functionPlaceholder')}
              />
            </div>
          )}

          <div className="form-row">
            <label className="form-label">{t('contacts.website')}</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => handleInputChange('website', e.target.value)}
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
              value={formData.street}
              onChange={(e) => handleInputChange('street', e.target.value)}
              className="input"
            />
          </div>

          <div className="form-row">
            <label className="form-label">{t('contacts.street2')}</label>
            <input
              type="text"
              value={formData.street2}
              onChange={(e) => handleInputChange('street2', e.target.value)}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-row">
              <label className="form-label">{t('contacts.city')}</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                className="input"
              />
            </div>
            <div className="form-row">
              <label className="form-label">{t('contacts.zip')}</label>
              <input
                type="text"
                value={formData.zip}
                onChange={(e) => handleInputChange('zip', e.target.value)}
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
              value={formData.comment}
              onChange={(e) => handleInputChange('comment', e.target.value)}
              className="input min-h-[80px]"
              rows={3}
              placeholder={t('contacts.notesPlaceholder')}
            />
          </div>
        </div>

        {/* Error */}
        {createMutation.error && (
          <div className="text-red-600 text-sm">
            {(createMutation.error as Error).message}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn btn-secondary"
            disabled={createMutation.isPending}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMutation.isPending || !formData.name.trim()}
          >
            <Save className="w-4 h-4 mr-1" />
            {createMutation.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
