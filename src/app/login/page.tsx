'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Mail, Loader2, Eye, EyeOff, Globe, HelpCircle, ChevronDown } from 'lucide-react';

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

// Tab component with sliding indicator
function AuthTabs({
  activeTab,
  onTabChange,
  labels
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  labels: { login: string; register: string };
}) {
  return (
    <div
      className="relative flex mx-6 mt-6 bg-gray-100 rounded-xl p-1"
      role="tablist"
      aria-label="Authentication tabs"
    >
      {/* Sliding indicator */}
      <div
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm transition-transform duration-200 ease-out"
        style={{
          transform: activeTab === 'login' ? 'translateX(0)' : 'translateX(100%)',
        }}
        aria-hidden="true"
      />

      <button
        role="tab"
        aria-selected={activeTab === 'login'}
        aria-controls="login-panel"
        id="login-tab"
        onClick={() => onTabChange('login')}
        className={`relative flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 min-h-[44px] ${
          activeTab === 'login' ? 'text-gray-900' : 'text-gray-500'
        }`}
      >
        {labels.login}
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'register'}
        aria-controls="register-panel"
        id="register-tab"
        onClick={() => onTabChange('register')}
        className={`relative flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 min-h-[44px] ${
          activeTab === 'register' ? 'text-gray-900' : 'text-gray-500'
        }`}
      >
        {labels.register}
      </button>
    </div>
  );
}

// Unified tenant code input component
function TenantCodeInput({
  value,
  onChange,
  error,
  placeholder,
  helpText,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder: string;
  helpText: string;
}) {
  return (
    <div>
      <div
        className={`flex items-center h-12 border rounded-xl overflow-hidden transition-all ${
          error
            ? 'border-red-300 bg-red-50 focus-within:ring-2 focus-within:ring-red-500'
            : 'border-gray-200 bg-gray-50 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent focus-within:bg-white'
        }`}
      >
        <span className="px-4 text-gray-400 font-medium select-none border-r border-gray-200 bg-gray-100 h-full flex items-center">
          TEN-
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            onChange(val);
          }}
          className="flex-1 h-full px-4 bg-transparent focus:outline-none uppercase font-medium tracking-wide"
          placeholder={placeholder}
          autoCapitalize="characters"
          autoComplete="organization"
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-gray-400">{helpText}</p>
      )}
    </div>
  );
}

// Language selector component
function LanguageSelector({
  currentLocale,
  isChanging,
  onChangeLanguage,
}: {
  currentLocale: string;
  isChanging: boolean;
  onChangeLanguage: (locale: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: 'ja', label: '日本語' },
    { code: 'zh', label: '中文' },
    { code: 'en', label: 'English' },
  ];

  const currentLabel = languages.find(l => l.code === currentLocale)?.label || 'Language';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isChanging}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 bg-white/90 backdrop-blur-sm rounded-full shadow-sm border border-gray-200/80 transition-all min-h-[44px] disabled:opacity-70"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {isChanging ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Globe className="w-4 h-4" />
        )}
        <span>{currentLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !isChanging && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div
            className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-20 min-w-[140px] overflow-hidden"
            role="listbox"
          >
            {languages.map((lang) => (
              <button
                key={lang.code}
                role="option"
                aria-selected={currentLocale === lang.code}
                onClick={() => {
                  setIsOpen(false);
                  if (lang.code !== currentLocale) {
                    onChangeLanguage(lang.code);
                  }
                }}
                className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors min-h-[44px] ${
                  currentLocale === lang.code
                    ? 'text-blue-600 font-medium bg-blue-50'
                    : 'text-gray-700'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<TabType>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (emailRegState.cooldown > 0) {
      const timer = setTimeout(() => {
        setEmailRegState(prev => ({ ...prev, cooldown: prev.cooldown - 1 }));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [emailRegState.cooldown]);

  // Smooth language change
  const changeLanguage = useCallback((newLocale: string) => {
    setIsChangingLanguage(true);
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000`;
    localStorage.setItem('preferred_locale', newLocale);

    // Use router.refresh() for smoother transition
    startTransition(() => {
      router.refresh();
      // Small delay to ensure the refresh completes
      setTimeout(() => {
        setIsChangingLanguage(false);
      }, 300);
    });
  }, [router]);

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  // Normalize tenant code input - always add TEN- prefix
  const normalizeTenantCode = (input: string): string => {
    let normalized = input.trim().toUpperCase().replace(/^TEN-/i, '');
    normalized = normalized.replace(/[^A-Z0-9]/g, '');
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
    alert(getText(
      '请联系管理员重置密码，或使用 Google 账号登录',
      '管理者に連絡してパスワードをリセットするか、Googleアカウントでログインしてください',
      'Please contact your administrator to reset password, or login with Google'
    ));
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setError('');
    setFieldErrors({});
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-gradient-to-br from-slate-50 to-blue-100">
      {/* Safe area padding for iOS */}
      <div className="flex-1 flex flex-col px-4 py-6" style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>

        {/* Language Selector - Top Right */}
        <div className="flex justify-end mb-4">
          <LanguageSelector
            currentLocale={locale}
            isChanging={isChangingLanguage || isPending}
            onChangeLanguage={changeLanguage}
          />
        </div>

        {/* Main Content - Centered */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[400px]">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              {/* Logo */}
              <div className="text-center pt-8 pb-2 px-6">
                <h1 className="text-2xl font-bold text-gray-900">Seisei BizNexus</h1>
                <p className="text-gray-500 mt-1 text-sm">
                  {getText('智能业务管理平台', 'スマートビジネス管理', 'Smart Business Management')}
                </p>
              </div>

              {/* Tabs - iOS style segmented control */}
              <AuthTabs
                activeTab={activeTab}
                onTabChange={handleTabChange}
                labels={{
                  login: getText('登录', 'ログイン', 'Login'),
                  register: getText('注册', '新規登録', 'Register'),
                }}
              />

              {/* Content */}
              <div className="p-6">
                {/* Global Error Message */}
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                    {error}
                  </div>
                )}

                {/* Tab Panels */}
                <div
                  id="login-panel"
                  role="tabpanel"
                  aria-labelledby="login-tab"
                  hidden={activeTab !== 'login'}
                >
                  {activeTab === 'login' && (
                    <div className="space-y-4">
                      {/* Google Login */}
                      <button
                        onClick={handleGoogleLogin}
                        className="w-full h-12 px-4 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition flex items-center justify-center gap-3 min-h-[48px]"
                      >
                        <GoogleIcon className="w-5 h-5" />
                        {getText('使用 Google 登录', 'Google でログイン', 'Continue with Google')}
                      </button>

                      {/* Divider */}
                      <div className="relative my-5">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="px-3 bg-white text-gray-400">
                            {getText('或使用企业账号', 'または企業アカウント', 'or with enterprise account')}
                          </span>
                        </div>
                      </div>

                      {/* Login Form */}
                      <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Tenant Code */}
                        <div>
                          <label htmlFor="tenantCode" className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                            {getText('租户代码', 'テナントコード', 'Tenant Code')}
                            <button
                              type="button"
                              className="text-gray-400 hover:text-gray-600 p-1 min-w-[44px] min-h-[44px] -m-1 flex items-center justify-center"
                              title={getText(
                                '租户代码由管理员提供，例如: DEMO01',
                                'テナントコードは管理者から提供されます。例: DEMO01',
                                'Tenant code is provided by your administrator, e.g., DEMO01'
                              )}
                            >
                              <HelpCircle className="w-4 h-4" />
                            </button>
                          </label>
                          <TenantCodeInput
                            value={formData.tenantCode.replace(/^TEN-/i, '')}
                            onChange={(value) => {
                              setFormData({ ...formData, tenantCode: value });
                              setFieldErrors({ ...fieldErrors, tenantCode: '' });
                            }}
                            error={fieldErrors.tenantCode}
                            placeholder="DEMO01"
                            helpText={getText(
                              '示例: DEMO01',
                              '例: DEMO01',
                              'Example: DEMO01'
                            )}
                          />
                        </div>

                        {/* Username */}
                        <div>
                          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
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
                            className={`w-full h-12 px-4 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                              fieldErrors.username ? 'border-red-300 bg-red-50' : 'border-gray-200'
                            }`}
                            autoCapitalize="none"
                            autoCorrect="off"
                            autoComplete="username"
                          />
                          {fieldErrors.username && (
                            <p className="mt-1.5 text-xs text-red-600">{fieldErrors.username}</p>
                          )}
                        </div>

                        {/* Password */}
                        <div>
                          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
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
                              className={`w-full h-12 px-4 pr-12 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                                fieldErrors.password ? 'border-red-300 bg-red-50' : 'border-gray-200'
                              }`}
                              autoComplete="current-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-gray-400 hover:text-gray-600"
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                          {fieldErrors.password && (
                            <p className="mt-1.5 text-xs text-red-600">{fieldErrors.password}</p>
                          )}
                        </div>

                        {/* Remember Me & Forgot Password */}
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
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
                            className="text-sm text-blue-600 hover:text-blue-700 min-h-[44px] px-2"
                          >
                            {getText('忘记密码?', 'パスワードを忘れた?', 'Forgot password?')}
                          </button>
                        </div>

                        {/* Submit Button */}
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px]"
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
                    </div>
                  )}
                </div>

                <div
                  id="register-panel"
                  role="tabpanel"
                  aria-labelledby="register-tab"
                  hidden={activeTab !== 'register'}
                >
                  {activeTab === 'register' && (
                    <div className="space-y-4">
                      {/* Google Register */}
                      <button
                        onClick={handleGoogleLogin}
                        className="w-full h-12 px-4 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition flex items-center justify-center gap-3 min-h-[48px]"
                      >
                        <GoogleIcon className="w-5 h-5" />
                        {getText('使用 Google 注册', 'Google で登録', 'Register with Google')}
                      </button>

                      {/* Divider */}
                      <div className="relative my-5">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="px-3 bg-white text-gray-400">
                            {getText('或使用邮箱', 'またはメールで', 'or with email')}
                          </span>
                        </div>
                      </div>

                      {/* Email Registration Form */}
                      <div className="space-y-4">
                        {emailRegState.step === 'email' ? (
                          <>
                            <div>
                              <label htmlFor="regEmail" className="block text-sm font-medium text-gray-700 mb-2">
                                {getText('邮箱地址', 'メールアドレス', 'Email Address')}
                              </label>
                              <input
                                type="email"
                                id="regEmail"
                                value={emailRegState.email}
                                onChange={(e) => setEmailRegState(prev => ({ ...prev, email: e.target.value }))}
                                className="w-full h-12 px-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                placeholder="your@email.com"
                                autoComplete="email"
                              />
                            </div>
                            <button
                              onClick={handleSendCode}
                              disabled={emailRegState.isSending}
                              className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px]"
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
                            <p className="text-sm text-gray-600 text-center">
                              {getText(
                                `验证码已发送至`,
                                `認証コードを送信しました`,
                                `Verification code sent to`
                              )}
                              <br />
                              <span className="font-medium text-gray-900">{emailRegState.email}</span>
                            </p>
                            <div>
                              <label htmlFor="verifyCode" className="block text-sm font-medium text-gray-700 mb-2">
                                {getText('验证码', '認証コード', 'Verification Code')}
                              </label>
                              <input
                                type="text"
                                id="verifyCode"
                                value={emailRegState.code}
                                onChange={(e) => setEmailRegState(prev => ({ ...prev, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                                className="w-full h-14 px-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-center text-2xl tracking-[0.5em] font-mono"
                                placeholder="000000"
                                maxLength={6}
                                autoComplete="one-time-code"
                                inputMode="numeric"
                              />
                            </div>
                            <button
                              onClick={handleVerifyCode}
                              disabled={emailRegState.isVerifying}
                              className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px]"
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
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={handleSendCode}
                                disabled={emailRegState.cooldown > 0 || emailRegState.isSending}
                                className="w-full h-11 px-4 text-blue-600 font-medium rounded-xl hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                              >
                                {emailRegState.cooldown > 0
                                  ? getText(`${emailRegState.cooldown}秒后可重发`, `${emailRegState.cooldown}秒後に再送信`, `Resend in ${emailRegState.cooldown}s`)
                                  : getText('重新发送验证码', '認証コードを再送信', 'Resend Code')}
                              </button>
                              <button
                                onClick={() => setEmailRegState(prev => ({ ...prev, step: 'email', code: '' }))}
                                className="w-full text-sm text-gray-500 hover:text-gray-700 min-h-[44px]"
                              >
                                {getText('使用其他邮箱', '別のメールを使用', 'Use different email')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Already have account */}
                      <p className="pt-2 text-center text-sm text-gray-500">
                        {getText('已有账号?', 'アカウントをお持ちですか?', 'Already have an account?')}
                        {' '}
                        <button
                          onClick={() => handleTabChange('login')}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {getText('立即登录', 'ログイン', 'Login now')}
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Outside card */}
        <div className="mt-6 text-center space-y-2">
          {/* Legal Links */}
          <div className="flex items-center justify-center gap-3 text-xs">
            <a
              href="/legal/tokusho"
              className="text-gray-500 hover:text-gray-700 transition"
            >
              {getText('特定商取引法', '特定商取引法', 'Legal Notice')}
            </a>
            <span className="text-gray-300">|</span>
            <a
              href="https://seisei.tokyo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-700 transition"
            >
              seisei.tokyo
            </a>
          </div>
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Seisei Inc. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
