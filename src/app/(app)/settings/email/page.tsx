'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Mail, Save, Loader2, Send, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import type { ApiResponse } from '@/types';

interface EmailConfig {
  id?: number;
  name?: string;
  host: string;
  port: number;
  user: string;
  encryption: 'none' | 'starttls' | 'ssl';
  active: boolean;
  configured: boolean;
}

// Common SMTP presets
const smtpPresets = [
  { name: 'Gmail', host: 'smtp.gmail.com', port: 587, encryption: 'starttls' as const },
  { name: 'Outlook/Office365', host: 'smtp.office365.com', port: 587, encryption: 'starttls' as const },
  { name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 587, encryption: 'starttls' as const },
  { name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, encryption: 'starttls' as const },
  { name: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, encryption: 'starttls' as const },
  { name: 'Mailgun', host: 'smtp.mailgun.org', port: 587, encryption: 'starttls' as const },
];

export default function EmailSettingsPage() {
  const t = useTranslations();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [config, setConfig] = useState<EmailConfig>({
    host: '',
    port: 587,
    user: '',
    encryption: 'starttls',
    active: true,
    configured: false,
  });
  const [password, setPassword] = useState('');
  const [testEmail, setTestEmail] = useState('');

  // Fetch current configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/settings/email');
        const data: ApiResponse<EmailConfig> = await res.json();
        if (data.success && data.data) {
          setConfig(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch email config:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // Apply preset
  const applyPreset = (preset: typeof smtpPresets[0]) => {
    setConfig(prev => ({
      ...prev,
      host: preset.host,
      port: preset.port,
      encryption: preset.encryption,
    }));
  };

  // Save configuration
  const handleSave = async () => {
    setIsSaving(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: config.id,
          name: config.name || `SMTP - ${config.host}`,
          host: config.host,
          port: config.port,
          user: config.user,
          password: password || undefined,
          encryption: config.encryption,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(prev => ({ ...prev, id: data.data.id, configured: true }));
        setTestResult({ success: true, message: t('email.configSaved') || '配置已保存' });
        setPassword(''); // Clear password field after save
      } else {
        setTestResult({ success: false, message: data.error?.message || '保存失败' });
      }
    } catch (error) {
      setTestResult({ success: false, message: '保存失败' });
    } finally {
      setIsSaving(false);
    }
  };

  // Test email
  const handleTest = async () => {
    if (!testEmail) {
      setTestResult({ success: false, message: '请输入测试邮箱地址' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: config.id,
          testEmail,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `测试邮件已发送至 ${testEmail}` });
      } else {
        setTestResult({ success: false, message: data.error?.message || '发送测试邮件失败' });
      }
    } catch (error) {
      setTestResult({ success: false, message: '发送测试邮件失败' });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold">{t('email.settings') || '邮件设置'}</h1>
          <p className="text-sm text-gray-500">{t('email.settingsDesc') || '配置 SMTP 发件服务器'}</p>
        </div>
      </div>

      {/* Status Badge */}
      {config.configured ? (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-green-800">{t('email.configured') || '邮件服务器已配置'}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-yellow-600" />
          <span className="text-yellow-800">{t('email.notConfigured') || '邮件服务器未配置，邮件将无法发送'}</span>
        </div>
      )}

      {/* Quick Presets */}
      <div className="card p-4">
        <h3 className="font-medium mb-3">{t('email.quickSetup') || '快速设置'}</h3>
        <div className="flex flex-wrap gap-2">
          {smtpPresets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Configuration Form */}
      <div className="card p-4 space-y-4">
        <h3 className="font-medium flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          {t('email.smtpConfig') || 'SMTP 配置'}
        </h3>

        {/* Host */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('email.host') || 'SMTP 服务器'} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={config.host}
            onChange={(e) => setConfig(prev => ({ ...prev, host: e.target.value }))}
            placeholder="smtp.example.com"
            className="input w-full"
          />
        </div>

        {/* Port & Encryption */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('email.port') || '端口'} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={config.port}
              onChange={(e) => setConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 587 }))}
              placeholder="587"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('email.encryption') || '加密方式'}
            </label>
            <select
              value={config.encryption}
              onChange={(e) => setConfig(prev => ({ ...prev, encryption: e.target.value as 'none' | 'starttls' | 'ssl' }))}
              className="input w-full"
            >
              <option value="none">{t('email.noEncryption') || '无'}</option>
              <option value="starttls">STARTTLS (587)</option>
              <option value="ssl">SSL/TLS (465)</option>
            </select>
          </div>
        </div>

        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('email.username') || '用户名'}
          </label>
          <input
            type="text"
            value={config.user}
            onChange={(e) => setConfig(prev => ({ ...prev, user: e.target.value }))}
            placeholder="your-email@example.com"
            className="input w-full"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('email.password') || '密码/应用密码'}
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={config.configured ? '••••••••（留空保持不变）' : '输入密码'}
              className="input w-full pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {t('email.passwordHint') || '对于 Gmail，请使用应用专用密码'}
          </p>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={isSaving || !config.host || !config.port}
          className="w-full btn btn-primary py-2.5 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {t('common.save') || '保存配置'}
        </button>
      </div>

      {/* Test Email */}
      {config.configured && (
        <div className="card p-4 space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Send className="w-5 h-5 text-green-600" />
            {t('email.testEmail') || '测试邮件'}
          </h3>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder={t('email.testEmailPlaceholder') || '输入测试邮箱地址'}
              className="input flex-1"
            />
            <button
              onClick={handleTest}
              disabled={isTesting || !testEmail}
              className="btn btn-primary px-4 flex items-center gap-2"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {t('email.sendTest') || '发送测试'}
            </button>
          </div>
        </div>
      )}

      {/* Result Message */}
      {testResult && (
        <div className={`flex items-center gap-2 p-3 rounded-lg ${
          testResult.success
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {testResult.success ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Help Text */}
      <div className="text-sm text-gray-500 space-y-2">
        <p className="font-medium">{t('email.helpTitle') || '提示：'}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t('email.helpGmail') || 'Gmail 需要开启"允许不够安全的应用"或使用应用专用密码'}</li>
          <li>{t('email.helpOutlook') || 'Outlook/Office365 需要在安全设置中启用 SMTP'}</li>
          <li>{t('email.helpPort') || '常用端口：587 (STARTTLS), 465 (SSL), 25 (无加密)'}</li>
        </ul>
      </div>
    </div>
  );
}
