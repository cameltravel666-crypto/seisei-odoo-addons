'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Lock, Loader2, Eye, EyeOff, CheckCircle2, XCircle, Globe, Building2, ShieldCheck } from 'lucide-react';

interface InvitationData {
  email: string;
  role: string;
  type: string;
  expiresAt: string;
  tenant: {
    code: string;
    name: string;
  } | null;
}

type PageState = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

export default function SetPasswordPage() {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [pageState, setPageState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [errorCode, setErrorCode] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [currentLocale, setCurrentLocale] = useState(locale);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const getText = useCallback((zh: string, ja: string, en: string) => {
    return locale === 'zh' ? zh : locale === 'ja' ? ja : en;
  }, [locale]);

  // Role display names
  const roleLabels: Record<string, { zh: string; ja: string; en: string }> = {
    BILLING_ADMIN: { zh: '账务管理员', ja: '課金管理者', en: 'Billing Admin' },
    ORG_ADMIN: { zh: '组织管理员', ja: '組織管理者', en: 'Organization Admin' },
    MANAGER: { zh: '经理', ja: 'マネージャー', en: 'Manager' },
    OPERATOR: { zh: '操作员', ja: 'オペレーター', en: 'Operator' },
  };

  const getRoleLabel = (role: string) => {
    const labels = roleLabels[role];
    if (!labels) return role;
    return locale === 'zh' ? labels.zh : locale === 'ja' ? labels.ja : labels.en;
  };

  // Error messages by code
  const getErrorMessage = useCallback((code: string): string => {
    const messages: Record<string, { zh: string; ja: string; en: string }> = {
      MISSING_TOKEN: {
        zh: '缺少邀请令牌',
        ja: '招待トークンがありません',
        en: 'Missing invitation token',
      },
      INVALID_TOKEN: {
        zh: '邀请链接无效',
        ja: '招待リンクが無効です',
        en: 'Invalid invitation link',
      },
      TOKEN_USED: {
        zh: '此邀请已被使用',
        ja: 'この招待は既に使用されています',
        en: 'This invitation has already been used',
      },
      TOKEN_REVOKED: {
        zh: '此邀请已被取消',
        ja: 'この招待はキャンセルされました',
        en: 'This invitation has been cancelled',
      },
      TOKEN_EXPIRED: {
        zh: '邀请链接已过期',
        ja: '招待リンクの有効期限が切れています',
        en: 'This invitation has expired',
      },
      WEAK_PASSWORD: {
        zh: '密码强度不足',
        ja: 'パスワードの強度が不十分です',
        en: 'Password is too weak',
      },
    };
    const msg = messages[code];
    if (msg) {
      return locale === 'zh' ? msg.zh : locale === 'ja' ? msg.ja : msg.en;
    }
    return getText('发生错误', 'エラーが発生しました', 'An error occurred');
  }, [locale, getText]);

  // Verify token on mount
  useEffect(() => {
    setCurrentLocale(locale);

    if (!token) {
      setErrorCode('MISSING_TOKEN');
      setErrorMessage(getErrorMessage('MISSING_TOKEN'));
      setPageState('error');
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`/api/auth/invitation/${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok) {
          setErrorCode(data.error?.code || 'INVALID_TOKEN');
          setErrorMessage(data.error?.message || getErrorMessage('INVALID_TOKEN'));
          setPageState('error');
          return;
        }

        setInvitation(data.data);
        setPageState('ready');
      } catch {
        setErrorCode('INVALID_TOKEN');
        setErrorMessage(getErrorMessage('INVALID_TOKEN'));
        setPageState('error');
      }
    };

    verifyToken();
  }, [token, getErrorMessage, locale]);

  const changeLanguage = (newLocale: string) => {
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000`;
    localStorage.setItem('preferred_locale', newLocale);
    setShowLanguageMenu(false);
    window.location.reload();
  };

  // Password validation
  const validatePassword = (pwd: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    if (pwd.length < 8) {
      errors.push(getText('至少8个字符', '8文字以上', 'At least 8 characters'));
    }
    if (!/[A-Z]/.test(pwd)) {
      errors.push(getText('至少一个大写字母', '大文字を1つ以上', 'At least one uppercase letter'));
    }
    if (!/[a-z]/.test(pwd)) {
      errors.push(getText('至少一个小写字母', '小文字を1つ以上', 'At least one lowercase letter'));
    }
    if (!/[0-9]/.test(pwd)) {
      errors.push(getText('至少一个数字', '数字を1つ以上', 'At least one number'));
    }
    return { valid: errors.length === 0, errors };
  };

  const passwordValidation = validatePassword(password);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!password) {
      errors.password = getText('请输入密码', 'パスワードを入力してください', 'Please enter a password');
    } else if (!passwordValidation.valid) {
      errors.password = getText('密码不符合要求', 'パスワードが要件を満たしていません', 'Password does not meet requirements');
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = getText('密码不匹配', 'パスワードが一致しません', 'Passwords do not match');
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !token) {
      return;
    }

    setPageState('submitting');
    setFieldErrors({});

    try {
      const res = await fetch('/api/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          displayName: displayName.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorCode(data.error?.code || 'INTERNAL_ERROR');
        setErrorMessage(data.error?.message || getText('设置密码失败', 'パスワードの設定に失敗しました', 'Failed to set password'));
        setPageState('ready');
        return;
      }

      setPageState('success');
    } catch {
      setErrorMessage(getText('网络错误，请重试', 'ネットワークエラー。再試行してください', 'Network error. Please try again.'));
      setPageState('ready');
    }
  };

  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-100 p-4">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">
            {getText('验证邀请...', '招待を確認中...', 'Verifying invitation...')}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {getText('邀请无效', '招待が無効です', 'Invalid Invitation')}
            </h1>
            <p className="text-gray-600 mb-6">{errorMessage}</p>

            {errorCode === 'TOKEN_EXPIRED' && (
              <p className="text-sm text-gray-500 mb-4">
                {getText(
                  '请联系管理员重新发送邀请',
                  '管理者に連絡して招待を再送信してもらってください',
                  'Please contact your administrator to resend the invitation'
                )}
              </p>
            )}

            <button
              onClick={() => router.push('/login')}
              className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
            >
              {getText('返回登录', 'ログインに戻る', 'Go to Login')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {getText('密码设置成功', 'パスワードが設定されました', 'Password Set Successfully')}
            </h1>
            <p className="text-gray-600 mb-6">
              {getText(
                '您现在可以使用新密码登录',
                '新しいパスワードでログインできます',
                'You can now log in with your new password'
              )}
            </p>
            <button
              onClick={() => router.push(`/login?tenant=${invitation?.tenant?.code || ''}`)}
              className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
            >
              {getText('立即登录', 'ログイン', 'Login Now')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Ready state - show form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        {/* Language Selector */}
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
          {/* Header */}
          <div className="text-center pt-8 pb-4 px-8">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {getText('设置密码', 'パスワード設定', 'Set Your Password')}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              {getText('完成账户设置', 'アカウント設定を完了する', 'Complete your account setup')}
            </p>
          </div>

          {/* Invitation Info */}
          {invitation && (
            <div className="mx-8 mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{getText('邮箱', 'メール', 'Email')}:</span>
                  <span className="font-medium text-gray-900">{invitation.email}</span>
                </div>
                {invitation.tenant && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{getText('组织', '組織', 'Organization')}:</span>
                    <span className="font-medium text-gray-900 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      {invitation.tenant.name}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">{getText('角色', 'ロール', 'Role')}:</span>
                  <span className="font-medium text-gray-900">{getRoleLabel(invitation.role)}</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-4">
            {/* Error Message */}
            {errorMessage && pageState === 'ready' && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {errorMessage}
              </div>
            )}

            {/* Display Name (Optional) */}
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                {getText('显示名称', '表示名', 'Display Name')}
                <span className="text-gray-400 font-normal ml-1">
                  ({getText('可选', '任意', 'optional')})
                </span>
              </label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-12 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder={getText('您的名字', 'お名前', 'Your name')}
                autoComplete="name"
              />
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
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors({ ...fieldErrors, password: '' });
                  }}
                  className={`w-full h-12 px-4 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                    fieldErrors.password ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                  autoComplete="new-password"
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

              {/* Password Requirements */}
              {password && (
                <div className="mt-2 space-y-1">
                  {[
                    { check: password.length >= 8, text: getText('至少8个字符', '8文字以上', 'At least 8 characters') },
                    { check: /[A-Z]/.test(password), text: getText('包含大写字母', '大文字を含む', 'Contains uppercase') },
                    { check: /[a-z]/.test(password), text: getText('包含小写字母', '小文字を含む', 'Contains lowercase') },
                    { check: /[0-9]/.test(password), text: getText('包含数字', '数字を含む', 'Contains number') },
                  ].map((req, i) => (
                    <div key={i} className={`flex items-center gap-1.5 text-xs ${req.check ? 'text-green-600' : 'text-gray-400'}`}>
                      {req.check ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-current" />
                      )}
                      {req.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                {getText('确认密码', 'パスワード確認', 'Confirm Password')}
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors({ ...fieldErrors, confirmPassword: '' });
                  }}
                  className={`w-full h-12 px-4 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                    fieldErrors.confirmPassword ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.confirmPassword}</p>
              )}
              {confirmPassword && password === confirmPassword && (
                <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {getText('密码匹配', 'パスワードが一致しました', 'Passwords match')}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={pageState === 'submitting'}
              className="w-full h-12 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {pageState === 'submitting' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {getText('设置中...', '設定中...', 'Setting password...')}
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  {getText('设置密码', 'パスワードを設定', 'Set Password')}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          © 2026 Seisei Inc. All rights reserved.
        </p>
      </div>
    </div>
  );
}
