'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Building2, Mail, Loader2, Eye, EyeOff, Globe, HelpCircle } from 'lucide-react';

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

type TabType = 'login' | 'register';

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabType>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [currentLocale, setCurrentLocale] = useState(locale);
  const [showPassword, setShowPassword] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Form data
  const [formData, setFormData] = useState({
    tenantCode: '',
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

  const getText = useCallback((zh: string, ja: string, en: string) => {
    return locale === 'zh' ? zh : locale === 'ja' ? ja : en;
  }, [locale]);

  // Check for OAuth errors or tenant info from URL
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        oauth_denied: getText('授权被拒绝', '認証が拒否されました', 'Authorization denied'),
        invalid_state: getText('无效的请求状态', '無効なリクエスト状態', 'Invalid request state'),
        token_exchange_failed: getText('认证失败', '認証に失敗しました', 'Authentication failed'),
        oauth_error: getText('登录出错', 'ログインエラー', 'Login error'),
      };
      setError(errorMessages[errorParam] || errorParam);
    }

    // Pre-fill tenant code if provided (remove TEN- prefix for display)
    const tenantParam = searchParams.get('tenant');
    if (tenantParam) {
      const codeWithoutPrefix = tenantParam.replace(/^TEN-/i, '');
      setFormData(prev => ({ ...prev, tenantCode: codeWithoutPrefix }));
    }

    // Check for registration redirect
    const tab = searchParams.get('tab');
    if (tab === 'register') {
      setActiveTab('register');
    }
  }, [searchParams, getText]);

  // Load saved login info on mount
  useEffect(() => {
    setCurrentLocale(locale);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Remove TEN- prefix from saved tenant code for display
        const savedCode = (parsed.tenantCode || '').replace(/^TEN-/i, '');
        setFormData({
          tenantCode: savedCode,
          username: parsed.username || '',
          password: '',
        });
        setRememberMe(parsed.rememberMe ?? true);
      }
    } catch {
      // Ignore parse errors
    }
  }, [locale]);

  // Cooldown timer
  useEffect(() => {
    if (emailRegState.cooldown > 0) {
      const timer = setTimeout(() => {
        setEmailRegState(prev => ({ ...prev, cooldown: prev.cooldown - 1 }));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [emailRegState.cooldown]);

  const changeLanguage = (newLocale: string) => {
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000`;
    localStorage.setItem('preferred_locale', newLocale);
    setShowLanguageMenu(false);
    window.location.reload();
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  // Normalize tenant code input - always add TEN- prefix
  const normalizeTenantCode = (input: string): string => {
    // Remove any existing prefix and clean up
    let normalized = input.trim().toUpperCase().replace(/^TEN-/i, '');
    // Remove any non-alphanumeric characters
    normalized = normalized.replace(/[^A-Z0-9]/g, '');
    // Add prefix
    return normalized ? TENANT_PREFIX + normalized : '';
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    const codeWithoutPrefix = formData.tenantCode.replace(/^TEN-/i, '').trim();
    if (!codeWithoutPrefix) {
      errors.tenantCode = getText(
        '请输入租户代码',
        'テナントコードを入力してください',
        'Please enter tenant code'
      );
    } else if (!/^[A-Z0-9]+$/.test(codeWithoutPrefix.toUpperCase())) {
      errors.tenantCode = getText(
        '租户代码只能包含字母和数字',
        'テナントコードは英数字のみ使用できます',
        'Tenant code can only contain letters and numbers'
      );
    }

    if (!formData.username.trim()) {
      errors.username = getText(
        '请输入用户名或邮箱',
        'ユーザー名またはメールアドレスを入力してください',
        'Please enter username or email'
      );
    }

    if (!formData.password) {
      errors.password = getText(
        '请输入密码',
        'パスワードを入力してください',
        'Please enter password'
      );
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
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

      router.push(`/register?email=${encodeURIComponent(data.email)}&token=${encodeURIComponent(data.token)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setEmailRegState(prev => ({ ...prev, isVerifying: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError('');

    const fullTenantCode = normalizeTenantCode(formData.tenantCode);
    const normalizedUsername = formData.username.toLowerCase().trim();

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
        // Generic error message to prevent account enumeration
        throw new Error(getText(
          '账号或密码不正确',
          'アカウントまたはパスワードが正しくありません',
          'Invalid account or password'
        ));
      }

      // Save login info if remember me is checked
      if (rememberMe) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            tenantCode: fullTenantCode,
            username: formData.username,
            rememberMe: true,
          }));
        } catch {
          // Ignore storage errors
        }
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }

      router.push('/home');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    // For now, show a helpful message. Can be expanded to full flow later.
    alert(getText(
      '请联系管理员重置密码，或使用 Google 账号登录',
      '管理者に連絡してパスワードをリセットするか、Googleアカウントでログインしてください',
      'Please contact your administrator to reset password, or login with Google'
    ));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        {/* Language Selector - Top Right */}
        <div className="flex justify-end mb-4 relative">
          <button
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 bg-white/80 backdrop-blur rounded-full shadow-sm border border-gray-200 transition"
          >
            <Globe className="w-4 h-4" />
            {currentLocale === 'ja' ? '日本語' : currentLocale === 'zh' ? '中文' : 'EN'}
          </button>

          {showLanguageMenu && (
            <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[120px]">
              <button
                onClick={() => changeLanguage('ja')}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${currentLocale === 'ja' ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
              >
                日本語
              </button>
              <button
                onClick={() => changeLanguage('zh')}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${currentLocale === 'zh' ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
              >
                中文
              </button>
              <button
                onClick={() => changeLanguage('en')}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${currentLocale === 'en' ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
              >
                English
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Logo */}
          <div className="text-center pt-8 pb-4 px-8">
            <h1 className="text-2xl font-bold text-gray-900">Seisei BizNexus</h1>
            <p className="text-gray-500 mt-1 text-sm">
              {getText('智能业务管理平台', 'スマートビジネス管理', 'Smart Business Management')}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-8">
            <button
              onClick={() => { setActiveTab('login'); setError(''); setFieldErrors({}); }}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === 'login'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {getText('登录', 'ログイン', 'Login')}
            </button>
            <button
              onClick={() => { setActiveTab('register'); setError(''); setFieldErrors({}); }}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === 'register'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {getText('注册', '新規登録', 'Register')}
            </button>
          </div>

          <div className="p-8">
            {/* Global Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {activeTab === 'login' ? (
              <>
                {/* Google Login */}
                <button
                  onClick={handleGoogleLogin}
                  className="w-full h-12 px-4 bg-white border-2 border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition flex items-center justify-center gap-3"
                >
                  <GoogleIcon className="w-5 h-5" />
                  {getText('使用 Google 登录', 'Google でログイン', 'Continue with Google')}
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-gray-500">
                      {getText('或使用企业账号', 'または企業アカウント', 'or with enterprise account')}
                    </span>
                  </div>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Tenant Code */}
                  <div>
                    <label htmlFor="tenantCode" className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                      {getText('租户代码', 'テナントコード', 'Tenant Code')}
                      <button
                        type="button"
                        className="text-gray-400 hover:text-gray-600"
                        title={getText(
                          '租户代码由管理员提供，例如: DEMO01',
                          'テナントコードは管理者から提供されます。例: DEMO01',
                          'Tenant code is provided by your administrator, e.g., DEMO01'
                        )}
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </label>
                    <div className="flex">
                      <span className="inline-flex items-center px-4 h-12 text-gray-500 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg font-medium">
                        TEN-
                      </span>
                      <input
                        type="text"
                        id="tenantCode"
                        value={formData.tenantCode.replace(/^TEN-/i, '')}
                        onChange={(e) => {
                          // Only store the code part without prefix, allow alphanumeric
                          const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                          setFormData({ ...formData, tenantCode: value });
                          setFieldErrors({ ...fieldErrors, tenantCode: '' });
                        }}
                        className={`flex-1 h-12 px-4 border rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition uppercase ${
                          fieldErrors.tenantCode ? 'border-red-300 bg-red-50' : 'border-gray-300'
                        }`}
                        placeholder="DEMO01"
                        autoCapitalize="characters"
                        autoComplete="organization"
                      />
                    </div>
                    {fieldErrors.tenantCode && (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors.tenantCode}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {getText(
                        '示例: DEMO01 (只需输入代码部分)',
                        '例: DEMO01 (コード部分のみ入力)',
                        'Example: DEMO01 (enter code part only)'
                      )}
                    </p>
                  </div>

                  {/* Username */}
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                      {getText('用户名 / 邮箱', 'ユーザー名 / メール', 'Username / Email')}
                    </label>
                    <input
                      type="text"
                      id="username"
                      value={formData.username}
                      onChange={(e) => {
                        setFormData({ ...formData, username: e.target.value });
                        setFieldErrors({ ...fieldErrors, username: '' });
                      }}
                      className={`w-full h-12 px-4 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                        fieldErrors.username ? 'border-red-300 bg-red-50' : 'border-gray-300'
                      }`}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="username"
                    />
                    {fieldErrors.username && (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors.username}</p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                      {getText('密码', 'パスワード', 'Password')}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        value={formData.password}
                        onChange={(e) => {
                          setFormData({ ...formData, password: e.target.value });
                          setFieldErrors({ ...fieldErrors, password: '' });
                        }}
                        className={`w-full h-12 px-4 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                          fieldErrors.password ? 'border-red-300 bg-red-50' : 'border-gray-300'
                        }`}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
                    )}
                  </div>

                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">
                        {getText('记住我', 'ログイン状態を保持', 'Remember me')}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {getText('忘记密码?', 'パスワードを忘れた?', 'Forgot password?')}
                    </button>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {getText('登录中...', 'ログイン中...', 'Logging in...')}
                      </>
                    ) : (
                      getText('登录', 'ログイン', 'Login')
                    )}
                  </button>
                </form>

                {/* Enterprise SSO Section */}
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                    <Building2 className="w-4 h-4" />
                    {getText('企业 SSO 登录', '企業SSOログイン', 'Enterprise SSO Login')}
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    {getText(
                      '仅适用于已开通 SSO 的企业 (Google Workspace/Azure AD)',
                      'SSO対応企業のみ (Google Workspace/Azure AD)',
                      'For SSO-enabled organizations only (Google Workspace/Azure AD)'
                    )}
                  </p>
                  <button
                    onClick={handleGoogleLogin}
                    className="w-full h-10 px-4 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2"
                  >
                    <GoogleIcon className="w-4 h-4" />
                    {getText('使用企业 Google 账号', 'Google Workspaceでログイン', 'Sign in with Google Workspace')}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Register Tab */}

                {/* Google Register */}
                <button
                  onClick={handleGoogleLogin}
                  className="w-full h-12 px-4 bg-white border-2 border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition flex items-center justify-center gap-3"
                >
                  <GoogleIcon className="w-5 h-5" />
                  {getText('使用 Google 注册', 'Google で登録', 'Register with Google')}
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-gray-500">
                      {getText('或使用邮箱', 'またはメールで', 'or with email')}
                    </span>
                  </div>
                </div>

                {/* Email Registration Form */}
                <div className="space-y-4">
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
                          className="w-full h-12 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                          placeholder="your@email.com"
                          autoComplete="email"
                        />
                      </div>
                      <button
                        onClick={handleSendCode}
                        disabled={emailRegState.isSending}
                        className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {emailRegState.isSending ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {getText('发送中...', '送信中...', 'Sending...')}
                          </>
                        ) : (
                          <>
                            <Mail className="w-5 h-5" />
                            {getText('发送验证码', '認証コードを送信', 'Send Verification Code')}
                          </>
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
                          className="w-full h-12 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-center text-2xl tracking-widest font-mono"
                          placeholder="000000"
                          maxLength={6}
                          autoComplete="one-time-code"
                        />
                      </div>
                      <button
                        onClick={handleVerifyCode}
                        disabled={emailRegState.isVerifying}
                        className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {emailRegState.isVerifying ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {getText('验证中...', '確認中...', 'Verifying...')}
                          </>
                        ) : (
                          getText('验证并继续', '確認して続行', 'Verify & Continue')
                        )}
                      </button>
                      <button
                        onClick={handleSendCode}
                        disabled={emailRegState.cooldown > 0 || emailRegState.isSending}
                        className="w-full h-10 px-4 text-blue-600 font-medium rounded-lg hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {emailRegState.cooldown > 0
                          ? getText(`${emailRegState.cooldown}秒后可重发`, `${emailRegState.cooldown}秒後に再送信`, `Resend in ${emailRegState.cooldown}s`)
                          : getText('重新发送验证码', '認証コードを再送信', 'Resend Code')}
                      </button>
                      <button
                        onClick={() => setEmailRegState(prev => ({ ...prev, step: 'email', code: '' }))}
                        className="w-full text-sm text-gray-500 hover:text-gray-700"
                      >
                        {getText('使用其他邮箱', '別のメールを使用', 'Use different email')}
                      </button>
                    </>
                  )}
                </div>

                {/* Already have account */}
                <p className="mt-6 text-center text-sm text-gray-500">
                  {getText('已有账号?', 'アカウントをお持ちですか?', 'Already have an account?')}
                  {' '}
                  <button
                    onClick={() => setActiveTab('login')}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {getText('立即登录', 'ログイン', 'Login now')}
                  </button>
                </p>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          © 2026 Seisei Inc. All rights reserved.
        </p>
      </div>
    </div>
  );
}
