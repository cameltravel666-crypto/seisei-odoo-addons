'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  FileText,
  Palette,
  Save,
  Loader2,
  ArrowLeft,
  Upload,
  X,
} from 'lucide-react';

interface CompanyData {
  id: number;
  name: string;
  street: string;
  street2: string;
  city: string;
  stateId: number | null;
  stateName: string;
  zip: string;
  countryId: number | null;
  countryName: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  vat: string;
  companyRegistry: string;
  currencyId: number | null;
  currencyName: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
}

interface Country {
  id: number;
  name: string;
  code: string;
}

interface State {
  id: number;
  name: string;
  code: string;
}

export default function CompanySettingsPage() {
  const locale = useLocale();
  const router = useRouter();

  const [company, setCompany] = useState<CompanyData | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const getText = useCallback((zh: string, ja: string, en: string) => {
    return locale === 'zh' ? zh : locale === 'ja' ? ja : en;
  }, [locale]);

  // Fetch company data
  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        setError('');

        // Fetch company data and countries in parallel
        const [companyRes, countriesRes] = await Promise.all([
          fetch('/api/settings/company'),
          fetch('/api/settings/company/countries'),
        ]);

        if (!companyRes.ok) {
          const data = await companyRes.json();
          throw new Error(data.error?.message || 'Failed to fetch company data');
        }

        const companyData = await companyRes.json();
        setCompany(companyData.data);

        if (countriesRes.ok) {
          const countriesData = await countriesRes.json();
          setCountries(countriesData.data || []);
        }

        // If company has a country, fetch states
        if (companyData.data?.countryId) {
          const statesRes = await fetch(`/api/settings/company/countries?countryId=${companyData.data.countryId}`);
          if (statesRes.ok) {
            const statesData = await statesRes.json();
            setStates(statesData.data || []);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load company data');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  // Fetch states when country changes
  const handleCountryChange = async (countryId: number | null) => {
    if (!company) return;

    setCompany({ ...company, countryId, stateId: null, stateName: '' });
    setStates([]);

    if (countryId) {
      try {
        const res = await fetch(`/api/settings/company/countries?countryId=${countryId}`);
        if (res.ok) {
          const data = await res.json();
          setStates(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch states:', err);
      }
    }
  };

  // Handle form submission
  const handleSave = async () => {
    if (!company) return;

    try {
      setIsSaving(true);
      setError('');
      setSuccessMessage('');

      const res = await fetch('/api/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to save company settings');
      }

      setSuccessMessage(getText('保存成功', '保存しました', 'Saved successfully'));
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle logo upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      // Remove the data:image/xxx;base64, prefix
      const base64Data = base64.split(',')[1];
      setCompany({ ...company, logo: base64Data });
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    if (company) {
      setCompany({ ...company, logo: null });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error && !company) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/settings')}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold">
            {getText('公司信息', '会社情報', 'Company Information')}
          </h1>
          <p className="text-sm text-gray-500">
            {getText('管理公司基本信息', '会社の基本情報を管理', 'Manage company basic information')}
          </p>
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg flex items-center gap-2">
          <Save className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {error && company && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          {error}
        </div>
      )}

      {company && (
        <>
          {/* Logo Section */}
          <div className="card p-6">
            <h2 className="font-medium mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-400" />
              {getText('公司名称与标识', '会社名とロゴ', 'Company Name & Logo')}
            </h2>

            <div className="flex items-start gap-6">
              {/* Logo */}
              <div className="flex-shrink-0">
                <div className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 relative overflow-hidden">
                  {company.logo ? (
                    <>
                      <img
                        src={`data:image/png;base64,${company.logo}`}
                        alt="Company logo"
                        className="w-full h-full object-contain"
                      />
                      <button
                        onClick={removeLogo}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600">
                      <Upload className="w-6 h-6" />
                      <span className="text-xs">{getText('上传', 'アップロード', 'Upload')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Company Name */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getText('公司名称', '会社名', 'Company Name')}
                </label>
                <input
                  type="text"
                  value={company.name}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Address Section */}
          <div className="card p-6">
            <h2 className="font-medium mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-gray-400" />
              {getText('地址', '住所', 'Address')}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getText('街道', '番地', 'Street')}
                </label>
                <input
                  type="text"
                  value={company.street}
                  onChange={(e) => setCompany({ ...company, street: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={getText('街道地址', '番地', 'Street address')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getText('详细地址', '建物名など', 'Street 2')}
                </label>
                <input
                  type="text"
                  value={company.street2}
                  onChange={(e) => setCompany({ ...company, street2: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={getText('楼层、房间号等', 'ビル名、部屋番号など', 'Building, room number, etc.')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {getText('城市', '市区町村', 'City')}
                  </label>
                  <input
                    type="text"
                    value={company.city}
                    onChange={(e) => setCompany({ ...company, city: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {getText('邮政编码', '郵便番号', 'ZIP Code')}
                  </label>
                  <input
                    type="text"
                    value={company.zip}
                    onChange={(e) => setCompany({ ...company, zip: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {getText('国家/地区', '国', 'Country')}
                  </label>
                  <select
                    value={company.countryId || ''}
                    onChange={(e) => handleCountryChange(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">{getText('选择国家', '国を選択', 'Select country')}</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {getText('省/州', '都道府県', 'State/Province')}
                  </label>
                  <select
                    value={company.stateId || ''}
                    onChange={(e) => setCompany({
                      ...company,
                      stateId: e.target.value ? parseInt(e.target.value) : null,
                    })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={states.length === 0}
                  >
                    <option value="">{getText('选择省/州', '都道府県を選択', 'Select state')}</option>
                    {states.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div className="card p-6">
            <h2 className="font-medium mb-4 flex items-center gap-2">
              <Phone className="w-5 h-5 text-gray-400" />
              {getText('联系方式', '連絡先', 'Contact')}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {getText('电话', '電話', 'Phone')}
                  </label>
                  <input
                    type="tel"
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {getText('手机', '携帯電話', 'Mobile')}
                  </label>
                  <input
                    type="tel"
                    value={company.mobile}
                    onChange={(e) => setCompany({ ...company, mobile: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="w-4 h-4 inline mr-1" />
                  {getText('邮箱', 'メール', 'Email')}
                </label>
                <input
                  type="email"
                  value={company.email}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Globe className="w-4 h-4 inline mr-1" />
                  {getText('网站', 'ウェブサイト', 'Website')}
                </label>
                <input
                  type="url"
                  value={company.website}
                  onChange={(e) => setCompany({ ...company, website: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://"
                />
              </div>
            </div>
          </div>

          {/* Legal & Tax Section */}
          <div className="card p-6">
            <h2 className="font-medium mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              {getText('法律与税务', '法人情報', 'Legal & Tax')}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getText('税号ID', '税務ID', 'Tax ID (VAT)')}
                </label>
                <input
                  type="text"
                  value={company.vat}
                  onChange={(e) => setCompany({ ...company, vat: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={getText('例如：T7000012050002', '例：T7000012050002', 'e.g., T7000012050002')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getText('公司注册号', '法人番号', 'Company Registry')}
                </label>
                <input
                  type="text"
                  value={company.companyRegistry}
                  onChange={(e) => setCompany({ ...company, companyRegistry: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getText('币种', '通貨', 'Currency')}
                </label>
                <input
                  type="text"
                  value={company.currencyName}
                  disabled
                  className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {getText('币种在系统中设置', '通貨はシステムで設定されます', 'Currency is set in the system')}
                </p>
              </div>
            </div>
          </div>

          {/* Color Section */}
          <div className="card p-6">
            <h2 className="font-medium mb-4 flex items-center gap-2">
              <Palette className="w-5 h-5 text-gray-400" />
              {getText('品牌颜色', 'ブランドカラー', 'Brand Colors')}
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getText('主色调', 'プライマリカラー', 'Primary Color')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={company.primaryColor || '#3B82F6'}
                    onChange={(e) => setCompany({ ...company, primaryColor: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={company.primaryColor}
                    onChange={(e) => setCompany({ ...company, primaryColor: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="#3B82F6"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {getText('辅助色', 'セカンダリカラー', 'Secondary Color')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={company.secondaryColor || '#6B7280'}
                    onChange={(e) => setCompany({ ...company, secondaryColor: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={company.secondaryColor}
                    onChange={(e) => setCompany({ ...company, secondaryColor: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="#6B7280"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 md:relative md:bg-transparent md:border-0 md:p-0">
            <div className="max-w-2xl mx-auto">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {getText('保存', '保存', 'Save')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
