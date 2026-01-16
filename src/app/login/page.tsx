'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ChevronDown, ChevronUp, Building2, Mail, Loader2 } from 'lucide-react';

const STORAGE_KEY = 'biznexus_login_info';
const TENANT_PREFIX = 'TEN-';

// Google Icon Component
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentLocale, setCurrentLocale] = useState(locale);
  const [showEnterpriseLogin, setShowEnterpriseLogin] = useState(false);
  const [showEmailRegistration, setShowEmailRegistration] = useState(false);

  // Form data - tenantSuffix is the part after "TEN-"
  const [formData, setFormData] = useState({
    tenantSuffix: '',
    username: '',
    password: '',
  });

  // Email registration state
  const [emailRegState, setEmailRegState] = useState({
    email: '',
    code: '',
    step: 'email' as 'email' | 'verify',
    isSending: false,
    isVerifying: false,
    cooldown: 0,
  });

  // Check for OAuth errors or tenant info from URL
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        oauth_denied: locale === 'zh' ? '授权被拒绝' : locale === 'ja' ? '認証が拒否されました' : 'Authorization denied',
        invalid_state: locale === 'zh' ? '无效的请求状态' : locale === 'ja' ? '無効なリクエスト状態' : 'Invalid request state',
        token_exchange_failed: locale === 'zh' ? '认证失败' : locale === 'ja' ? '認証に失敗しました' : 'Authentication failed',
        oauth_error: locale === 'zh' ? '登录出错' : locale === 'ja' ? 'ログインエラー' : 'Login error',
      };
      setError(errorMessages[errorParam] || errorParam);
    }

    // Pre-fill tenant code if provided (for existing OAuth users)
    const tenantParam = searchParams.get('tenant');
    if (tenantParam) {
      const suffix = tenantParam.replace('TEN-', '');
      setFormData(prev => ({ ...prev, tenantSuffix: suffix }));
      setShowEnterpriseLogin(true);
    }
  }, [searchParams, locale]);

  // Load saved login info on mount
  useEffect(() => {
    setCurrentLocale(locale);

    // Load saved credentials from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFormData({
          tenantSuffix: parsed.tenantSuffix || '',
          username: parsed.username || '',
          password: '',
        });
        // If there's saved tenant info, show enterprise login
        if (parsed.tenantSuffix) {
          setShowEnterpriseLogin(true);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [locale]);

  const changeLanguage = (newLocale: string) => {
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000`;
    window.location.reload();
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  // Email registration handlers
  const handleSendCode = async () => {
    if (!emailRegState.email || !emailRegState.email.includes('@')) {
      setError(getText('请输入有效的邮箱地址', '有効なメールアドレスを入力してください', 'Please enter a valid email address'));
      return;
    }

    setError('');
    setEmailRegState(prev => ({ ...prev, isSending: true }));

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailRegState.email, locale }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to send code');
      }

      // Move to verify step and start cooldown
      setEmailRegState(prev => ({ ...prev, step: 'verify', cooldown: 60 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setEmailRegState(prev => ({ ...prev, isSending: false }));
    }
  };

  const handleVerifyCode = async () => {
    if (!emailRegState.code || emailRegState.code.length !== 6) {
      setError(getText('请输入6位验证码', '6桁の認証コードを入力してください', 'Please enter 6-digit code'));
      return;
    }

    setError('');
    setEmailRegState(prev => ({ ...prev, isVerifying: true }));

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailRegState.email, code: emailRegState.code, locale }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Invalid code');
      }

      // Redirect to registration page with token
      router.push(`/register?email=${encodeURIComponent(data.email)}&token=${encodeURIComponent(data.token)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setEmailRegState(prev => ({ ...prev, isVerifying: false }));
    }
  };

  // Cooldown timer
  useEffect(() => {
    if (emailRegState.cooldown > 0) {
      const timer = setTimeout(() => {
        setEmailRegState(prev => ({ ...prev, cooldown: prev.cooldown - 1 }));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [emailRegState.cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const fullTenantCode = TENANT_PREFIX + formData.tenantSuffix.toUpperCase();
    const normalizedUsername = formData.username.toLowerCase();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCode: fullTenantCode,
          username: normalizedUsername,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || t('loginError'));
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          tenantSuffix: formData.tenantSuffix,
          username: formData.username,
        }));
      } catch {
        // Ignore storage errors
      }

      router.push('/home');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  const getText = (zh: string, ja: string, en: string) => {
    return locale === 'zh' ? zh : locale === 'ja' ? ja : en;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Seisei BizNexus</h1>
            <p className="text-gray-500 mt-2">
              {getText('智能业务管理平台', 'スマートビジネス管理', 'Smart Business Management')}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Free Start Section */}
          <div className="space-y-4 mb-6">
            {/* Google Login Button */}
            <button
              onClick={handleGoogleLogin}
              className="w-full py-3 px-4 bg-white border-2 border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition flex items-center justify-center gap-3"
            >
              <GoogleIcon className="w-5 h-5" />
              {getText('使用 Google 账号登录', 'Google でログイン', 'Continue with Google')}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">
                  {getText('或', 'または', 'or')}
                </span>
              </div>
            </div>
          </div>

          {/* Email Registration Toggle */}
          <button
            onClick={() => {
              setShowEmailRegistration(!showEmailRegistration);
              if (!showEmailRegistration) setShowEnterpriseLogin(false);
            }}
            className="w-full py-3 px-4 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2 border border-gray-200"
          >
            <Mail className="w-5 h-5" />
            {getText('邮箱注册', 'メールで登録', 'Register with Email')}
            {showEmailRegistration ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Email Registration Form */}
          {showEmailRegistration && (
            <div className="space-y-4 mt-4 pt-4 border-t border-gray-100">
              {emailRegState.step === 'email' ? (
                <>
                  <div>
                    <label htmlFor="regEmail" className="block text-sm font-medium text-gray-700 mb-1">
                      {getText('邮箱地址', 'メールアドレス', 'Email Address')}
                    </label>
                    <input
                      type="email"
                      id="regEmail"
                      value={emailRegState.email}
                      onChange={(e) => setEmailRegState(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      placeholder="your@email.com"
                      autoComplete="email"
                    />
                  </div>
                  <button
                    onClick={handleSendCode}
                    disabled={emailRegState.isSending}
                    className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {emailRegState.isSending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {getText('发送中...', '送信中...', 'Sending...')}
                      </>
                    ) : (
                      getText('发送验证码', '認証コードを送信', 'Send Verification Code')
                    )}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    {getText(
                      `验证码已发送至 ${emailRegState.email}`,
                      `${emailRegState.email} に認証コードを送信しました`,
                      `Verification code sent to ${emailRegState.email}`
                    )}
                  </p>
                  <div>
                    <label htmlFor="verifyCode" className="block text-sm font-medium text-gray-700 mb-1">
                      {getText('验证码', '認証コード', 'Verification Code')}
                    </label>
                    <input
                      type="text"
                      id="verifyCode"
                      value={emailRegState.code}
                      onChange={(e) => setEmailRegState(prev => ({ ...prev, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-center text-2xl tracking-widest font-mono"
                      placeholder="000000"
                      maxLength={6}
                      autoComplete="one-time-code"
                    />
                  </div>
                  <button
                    onClick={handleVerifyCode}
                    disabled={emailRegState.isVerifying}
                    className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {emailRegState.isVerifying ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {getText('验证中...', '確認中...', 'Verifying...')}
                      </>
                    ) : (
                      getText('验证并注册', '確認して登録', 'Verify & Register')
                    )}
                  </button>
                  <button
                    onClick={handleSendCode}
                    disabled={emailRegState.cooldown > 0 || emailRegState.isSending}
                    className="w-full py-2 px-4 text-blue-600 font-medium rounded-lg hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailRegState.cooldown > 0
                      ? getText(`${emailRegState.cooldown}秒后可重发`, `${emailRegState.cooldown}秒後に再送信`, `Resend in ${emailRegState.cooldown}s`)
                      : getText('重新发送验证码', '認証コードを再送信', 'Resend Code')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Enterprise Login Toggle */}
          <button
            onClick={() => {
              setShowEnterpriseLogin(!showEnterpriseLogin);
              if (!showEnterpriseLogin) setShowEmailRegistration(false);
            }}
            className="w-full py-3 px-4 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2 border border-gray-200"
          >
            <Building2 className="w-5 h-5" />
            {getText('企业账号登录', '企業アカウントでログイン', 'Enterprise Login')}
            {showEnterpriseLogin ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Enterprise Login Form (Collapsible) */}
          {showEnterpriseLogin && (
            <form onSubmit={handleSubmit} className="space-y-4 mt-4 pt-4 border-t border-gray-100">
              <div>
                <label htmlFor="tenantCode" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('tenantCode')}
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-4 py-3 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-gray-600 font-medium text-sm">
                    {TENANT_PREFIX}
                  </span>
                  <input
                    type="text"
                    id="tenantCode"
                    value={formData.tenantSuffix}
                    onChange={(e) => setFormData({ ...formData, tenantSuffix: e.target.value.toUpperCase() })}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition uppercase"
                    placeholder="DEMO01"
                    required
                    autoCapitalize="characters"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('username')}
                </label>
                <input
                  type="text"
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('password')}
                </label>
                <input
                  type="password"
                  id="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? t('loggingIn') : t('loginButton')}
              </button>
            </form>
          )}

          {/* New User Hint */}
          <p className="mt-6 text-center text-sm text-gray-500">
            {getText('新用户？使用 Google 或邮箱注册', '新規登録は Google またはメールで', 'New user? Register with Google or Email')}
          </p>
        </div>

        {/* Language Selector */}
        <div className="mt-6 flex justify-center gap-2 text-sm">
          <button
            onClick={() => changeLanguage('ja')}
            className={`px-3 py-1 rounded-full transition ${currentLocale === 'ja' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            日本語
          </button>
          <button
            onClick={() => changeLanguage('zh')}
            className={`px-3 py-1 rounded-full transition ${currentLocale === 'zh' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            中文
          </button>
          <button
            onClick={() => changeLanguage('en')}
            className={`px-3 py-1 rounded-full transition ${currentLocale === 'en' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            English
          </button>
        </div>
      </div>
    </div>
  );
}
