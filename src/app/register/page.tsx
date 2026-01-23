'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Building2, User, Phone, Briefcase, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';

export default function RegisterPage() {
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

  const getText = (zh: string, ja: string, en: string) => {
    return locale === 'zh' ? zh : locale === 'ja' ? ja : en;
  };

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
          locale, // Pass user's language preference for welcome email
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
    { value: '', label: getText('请选择行业', '業種を選択', 'Select Industry...') },
    { value: 'restaurant', label: getText('餐饮', '飲食店', 'Restaurant') },
    { value: 'retail', label: getText('零售', '小売', 'Retail') },
    { value: 'service', label: getText('服务业', 'サービス', 'Service') },
    { value: 'consulting', label: getText('咨询', 'コンサルティング', 'Consulting') },
    { value: 'realestate', label: getText('房产中介', '不動産', 'Real Estate') },
  ];

  if (success) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex flex-col bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="flex-1 flex items-center justify-center px-4 py-6" style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
          <div className="w-full max-w-[400px]">
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {getText('注册成功!', '登録完了!', 'Registration Complete!')}
              </h1>
              <p className="text-gray-600">
                {getText('正在跳转...', 'リダイレクト中...', 'Redirecting...')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-gradient-to-br from-slate-50 to-blue-100">
      <div className="flex-1 flex items-center justify-center px-4 py-6" style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
        <div className="w-full max-w-[400px]">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="text-center pt-8 pb-4 px-6">
              <h1 className="text-2xl font-bold text-gray-900">Seisei BizNexus</h1>
              <p className="text-gray-500 mt-1 text-sm">
                {getText('完成注册', '登録を完了', 'Complete Registration')}
              </p>
              {email && (
                <p className="text-sm text-blue-600 mt-3 flex items-center justify-center gap-1.5 bg-blue-50 py-2 px-4 rounded-lg mx-auto inline-flex">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{email}</span>
                </p>
              )}
            </div>

            <div className="p-6">
              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {/* Registration Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Company Name */}
                <div>
                  <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      {getText('公司名称', '会社名', 'Company Name')}
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <input
                    type="text"
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full h-12 px-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder={getText('请输入公司名称', '会社名を入力', 'Enter company name')}
                    required
                  />
                </div>

                {/* Contact Name */}
                <div>
                  <label htmlFor="contactName" className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="flex items-center gap-1.5">
                      <User className="w-4 h-4 text-gray-400" />
                      {getText('联系人姓名', '担当者名', 'Contact Name')}
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <input
                    type="text"
                    id="contactName"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full h-12 px-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder={getText('请输入姓名', '名前を入力', 'Enter your name')}
                    required
                  />
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4 text-gray-400" />
                      {getText('联系电话', '電話番号', 'Phone Number')}
                      <span className="text-gray-400 text-xs ml-1">({getText('选填', '任意', 'Optional')})</span>
                    </span>
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full h-12 px-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="090-1234-5678"
                  />
                </div>

                {/* Industry */}
                <div>
                  <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-gray-400" />
                      {getText('行业', '業種', 'Industry')}
                      <span className="text-gray-400 text-xs ml-1">({getText('选填', '任意', 'Optional')})</span>
                    </span>
                  </label>
                  <select
                    id="industry"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full h-12 px-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none bg-white bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%239CA3AF%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-10"
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
                  className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px] mt-6"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {getText('创建中...', '作成中...', 'Creating...')}
                    </>
                  ) : (
                    <>
                      {getText('开始使用', '開始する', 'Get Started')}
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              {/* Footer */}
              <p className="mt-6 text-center text-sm text-gray-500">
                {getText('已有账号？', 'アカウントをお持ちですか？', 'Already have an account?')}
                {' '}
                <a href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                  {getText('登录', 'ログイン', 'Login')}
                </a>
              </p>
            </div>
          </div>

          {/* Copyright */}
          <p className="mt-6 text-center text-xs text-gray-400">
            © 2026 Seisei Inc. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
