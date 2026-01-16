'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Building2, User, Phone, Briefcase, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Get email, name and token from URL params (set by OAuth callback or email verification)
  const email = searchParams.get('email') || '';
  const name = searchParams.get('name') || '';
  const emailToken = searchParams.get('token') || ''; // Token from email verification

  const [formData, setFormData] = useState({
    companyName: '',
    contactName: name,
    phone: '',
    industry: '',
  });

  useEffect(() => {
    // Update contact name if name param changes
    if (name) {
      setFormData(prev => ({ ...prev, contactName: name }));
    }
  }, [name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          ...formData,
          ...(emailToken && { emailToken }), // Include token if present (email verification flow)
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Registration failed');
      }

      setSuccess(true);

      // Redirect to home after short delay
      setTimeout(() => {
        router.push('/home');
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const industries = [
    { value: '', label: locale === 'zh' ? '请选择行业' : locale === 'ja' ? '業種を選択' : 'Select Industry...' },
    { value: 'restaurant', label: locale === 'zh' ? '餐饮' : locale === 'ja' ? '飲食店' : 'Restaurant' },
    { value: 'retail', label: locale === 'zh' ? '零售' : locale === 'ja' ? '小売' : 'Retail' },
    { value: 'service', label: locale === 'zh' ? '服务业' : locale === 'ja' ? 'サービス' : 'Service' },
    { value: 'consulting', label: locale === 'zh' ? '咨询' : locale === 'ja' ? 'コンサルティング' : 'Consulting' },
    { value: 'realestate', label: locale === 'zh' ? '房产中介' : locale === 'ja' ? '不動産' : 'Real Estate' },
  ];

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {locale === 'zh' ? '注册成功!' : locale === 'ja' ? '登録完了!' : 'Registration Complete!'}
            </h1>
            <p className="text-gray-600">
              {locale === 'zh' ? '正在跳转...' : locale === 'ja' ? 'リダイレクト中...' : 'Redirecting...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Seisei BizNexus</h1>
            <p className="text-gray-500 mt-2">
              {locale === 'zh' ? '完成注册' : locale === 'ja' ? '登録を完了' : 'Complete Registration'}
            </p>
            {email && (
              <p className="text-sm text-blue-600 mt-2 flex items-center justify-center gap-1">
                <CheckCircle className="w-4 h-4" />
                {email}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company Name */}
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  {locale === 'zh' ? '公司名称' : locale === 'ja' ? '会社名' : 'Company Name'}
                  <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="text"
                id="companyName"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder={locale === 'zh' ? '请输入公司名称' : locale === 'ja' ? '会社名を入力' : 'Enter company name'}
                required
              />
            </div>

            {/* Contact Name */}
            <div>
              <label htmlFor="contactName" className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {locale === 'zh' ? '联系人姓名' : locale === 'ja' ? '担当者名' : 'Contact Name'}
                  <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="text"
                id="contactName"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder={locale === 'zh' ? '请输入姓名' : locale === 'ja' ? '名前を入力' : 'Enter your name'}
                required
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  {locale === 'zh' ? '联系电话' : locale === 'ja' ? '電話番号' : 'Phone Number'}
                </span>
              </label>
              <input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder={locale === 'zh' ? '选填' : locale === 'ja' ? '任意' : 'Optional'}
              />
            </div>

            {/* Industry */}
            <div>
              <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1">
                  <Briefcase className="w-4 h-4" />
                  {locale === 'zh' ? '行业' : locale === 'ja' ? '業種' : 'Industry'}
                </span>
              </label>
              <select
                id="industry"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              >
                {industries.map((ind) => (
                  <option key={ind.value} value={ind.value}>
                    {ind.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {locale === 'zh' ? '创建中...' : locale === 'ja' ? '作成中...' : 'Creating...'}
                </>
              ) : (
                <>
                  {locale === 'zh' ? '开始使用' : locale === 'ja' ? '開始する' : 'Get Started'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-gray-500">
            {locale === 'zh' ? '已有账号？' : locale === 'ja' ? 'アカウントをお持ちですか？' : 'Already have an account?'}
            {' '}
            <a href="/login" className="text-blue-600 hover:underline">
              {locale === 'zh' ? '登录' : locale === 'ja' ? 'ログイン' : 'Login'}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
