'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth';
import {
  BarChart3,
  ShoppingCart,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
  Receipt,
  Calculator,
  CheckCircle,
  UserCog,
  Wrench,
  FileText,
  Home,
  Settings,
  LogOut,
  Menu,
  X,
  Globe,
  Check,
  Boxes,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const languages = [
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3,
  ShoppingCart,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
  Receipt,
  Calculator,
  CheckCircle,
  UserCog,
  Wrench,
  FileText,
  Boxes,
};

export function Navigation() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { user, visibleModules } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState('ja');
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  useEffect(() => {
    // Read current locale from cookie
    const cookie = document.cookie.split('; ').find(c => c.startsWith('locale='));
    if (cookie) {
      setCurrentLocale(cookie.split('=')[1]);
    }
  }, []);

  const handleLanguageChange = async (locale: string) => {
    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      setCurrentLocale(locale);
      setShowLanguageMenu(false);
      // Hard reload to apply new locale from server
      window.location.href = window.location.pathname;
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const navItems = [
    { path: '/home', icon: Home, label: t('home') },
    ...visibleModules.map((module) => ({
      path: module.path,
      icon: iconMap[module.icon] || Package,
      label: t(module.code.toLowerCase()),
    })),
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-gray-900">
        <div className="flex flex-col flex-grow pt-5 overflow-y-auto">
          {/* Logo */}
          <Link href="/home" className="block px-4 mb-6">
            <h1 className="text-xl font-bold text-white">Seisei BizNexus</h1>
            {user && (
              <p className="text-xs text-gray-400 mt-1">{user.tenant.name}</p>
            )}
          </Link>

          {/* Navigation Links */}
          <nav className="flex-1 px-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path || pathname.startsWith(item.path + '/');

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Bottom Section */}
          <div className="p-4 border-t border-gray-800">
            {/* Language Switcher */}
            <div className="mb-2 relative">
              <button
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition"
              >
                <div className="flex items-center">
                  <Globe className="w-5 h-5 mr-3" />
                  {languages.find(l => l.code === currentLocale)?.label}
                </div>
                <span>{languages.find(l => l.code === currentLocale)?.flag}</span>
              </button>
              {showLanguageMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm ${
                        currentLocale === lang.code
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{lang.flag}</span>
                        <span>{lang.label}</span>
                      </span>
                      {currentLocale === lang.code && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/settings"
              className="flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition"
            >
              <Settings className="w-5 h-5 mr-3" />
              {t('settings')}
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition"
            >
              <LogOut className="w-5 h-5 mr-3" />
              {t('logout')}
            </button>
            {user && (
              <div className="mt-3 px-3 py-2 text-xs text-gray-500">
                {user.displayName}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Header - Fixed Height with safe area */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white px-4 flex items-center justify-between"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          height: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))',
          minHeight: 'calc(var(--height-header) + env(safe-area-inset-top, 0px))'
        }}
      >
        <Link href="/home" className="text-heading font-bold truncate">Seisei BizNexus</Link>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 flex-shrink-0"
          style={{ width: 'var(--height-icon-btn)', height: 'var(--height-icon-btn)' }}
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-gray-900"
          style={{ paddingTop: 'var(--height-header)' }}
        >
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center px-3 py-3 text-sm font-medium rounded-lg ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </Link>
              );
            })}
            <hr className="border-gray-800 my-4" />

            {/* Language Switcher */}
            <div className="px-3 mb-2">
              <button
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                className="w-full flex items-center justify-between py-3 text-sm text-gray-300 hover:bg-gray-800 rounded-lg px-3"
              >
                <div className="flex items-center">
                  <Globe className="w-5 h-5 mr-3" />
                  {languages.find(l => l.code === currentLocale)?.label || t('language')}
                </div>
                <span className="text-lg">{languages.find(l => l.code === currentLocale)?.flag}</span>
              </button>
              {showLanguageMenu && (
                <div className="mt-1 ml-8 space-y-1">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg ${
                        currentLocale === lang.code
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{lang.flag}</span>
                        <span>{lang.label}</span>
                      </span>
                      {currentLocale === lang.code && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/settings"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center px-3 py-3 text-sm text-gray-300 hover:bg-gray-800 rounded-lg"
            >
              <Settings className="w-5 h-5 mr-3" />
              {t('settings')}
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-3 py-3 text-sm text-gray-300 hover:bg-gray-800 rounded-lg"
            >
              <LogOut className="w-5 h-5 mr-3" />
              {t('logout')}
            </button>
          </nav>
        </div>
      )}

    </>
  );
}
