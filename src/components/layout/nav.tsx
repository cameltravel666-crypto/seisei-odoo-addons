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
  LineChart,
  Contact,
  QrCode,
  ChevronDown,
  ChevronRight,
  Lock,
  FileSpreadsheet,
  Wallet,
  FileStack,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useIsIOSAppStoreBuild } from '@/lib/appChannel';

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
  LineChart,
  Contact,
  QrCode,
  Wallet,
};

// POS sub-menu items
// QR_ORDERING is now gated by entitlements (trial/subscription), not hidden
const posSubItems = [
  { path: '/pos/tables', icon: QrCode, labelKey: 'tables', moduleCode: 'QR_ORDERING' },
];

export function Navigation() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { user, visibleModules } = useAuthStore();
  const isIOSAppStore = useIsIOSAppStoreBuild();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState('ja');
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  // Check if user has a specific module
  const hasModule = (moduleCode: string) => visibleModules.some(m => m.code === moduleCode);

  // Auto-expand POS menu when on a POS sub-page
  useEffect(() => {
    if (pathname.startsWith('/pos/')) {
      setExpandedMenus(prev => new Set([...prev, 'POS']));
    }
  }, [pathname]);

  // Toggle menu expansion
  const toggleMenu = (menuCode: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev);
      if (next.has(menuCode)) {
        next.delete(menuCode);
      } else {
        next.add(menuCode);
      }
      return next;
    });
  };

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

  // Filter out QR_ORDERING as it's a POS sub-menu item, not a top-level menu
  const navItems = [
    { path: '/home', icon: Home, label: t('home') },
    ...visibleModules
      .filter((module) => module.code !== 'QR_ORDERING')
      .map((module) => ({
        path: module.path,
        icon: iconMap[module.icon] || Package,
        label: t(module.code.toLowerCase()),
      })),
    // Product Management - unified product/category/BOM management
    { path: '/products', icon: Boxes, label: t('products') },
    // Billing Center - 票据中心 (Odoo Accounting/Invoicing wrapper)
    { path: '/billing', icon: FileStack, label: t('billing') },
    // Document OCR - scan invoices/receipts and create documents
    { path: '/ocr', icon: FileText, label: t('ocr') },
    // Sheet Forge - standalone module for template-based OCR extraction
    { path: '/sheetforge', icon: FileSpreadsheet, label: t('sheetforge') },
  ];

  return (
    <>
      {/* 
        Desktop Sidebar - Fixed positioning
        - position: fixed ensures it doesn't move during scroll
        - No transform on ancestors to prevent fixed positioning issues
      */}
      <aside data-app-header="desktop" className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-gray-900" style={{ zIndex: 40 }}>
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
              const isActive = pathname === item.path || (item.path !== '/home' && pathname.startsWith(item.path + '/'));
              const isPOS = item.path === '/pos';
              const isExpanded = expandedMenus.has('POS');

              // POS item with sub-menu
              if (isPOS) {
                return (
                  <div key={item.path}>
                    <div
                      className={`flex items-center rounded-lg overflow-hidden transition-colors ${
                        isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <Link
                        href={item.path}
                        className="flex-1 flex items-center px-3 py-2 text-sm font-medium"
                      >
                        <Icon className="w-5 h-5 mr-3" />
                        {item.label}
                      </Link>
                      <button
                        onClick={() => toggleMenu('POS')}
                        className="px-2 py-2"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* POS Sub-menu */}
                    {isExpanded && (
                      <div className="ml-4 mt-1 space-y-1">
                        {posSubItems.map((subItem) => {
                          const SubIcon = subItem.icon;
                          const isSubActive = pathname === subItem.path || pathname.startsWith(subItem.path + '/');
                          const hasAccess = hasModule(subItem.moduleCode);

                          return (
                            <Link
                              key={subItem.path}
                              href={hasAccess ? subItem.path : (isIOSAppStore ? '#' : '/settings/subscription')}
                              className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition ${
                                isSubActive
                                  ? 'bg-blue-500 text-white'
                                  : hasAccess
                                    ? 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    : 'text-gray-500 hover:bg-gray-800'
                              }`}
                            >
                              <SubIcon className="w-4 h-4 mr-3" />
                              <span className="flex-1">{t(subItem.labelKey)}</span>
                              {!hasAccess && <Lock className="w-3 h-3 text-gray-500" />}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // Regular nav item
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg overflow-hidden transition-colors ${
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
            {/* Settings - hidden in native apps for App Store compliance */}
            {!isIOSAppStore && (
              <Link
                href="/settings"
                className="flex items-center px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition"
              >
                <Settings className="w-5 h-5 mr-3" />
                {t('settings')}
              </Link>
            )}
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

      {/*
        Mobile Header - 紧凑型顶栏
        使用 CSS 变量 --app-header-h (44px) 和 --safe-top 确保高度统一
        CSS 在 globals.css 中通过 [data-app-header="mobile"] 选择器控制
      */}
      <div
        data-app-header="mobile"
        className="md:hidden bg-gray-900 text-white"
      >
        <div className="flex items-center justify-between px-3" style={{ height: 'var(--app-header-h)' }}>
          <Link href="/home" className="text-sm font-semibold truncate">
            Seisei BizNexus
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex items-center justify-center w-9 h-9 rounded-md active:bg-gray-800"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu - 从header下方开始，使用统一的 CSS 变量 */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-[999] bg-gray-900"
          style={{
            top: 'var(--app-header-total-h)',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;
              const isPOS = item.path === '/pos';
              const isExpanded = expandedMenus.has('POS');

              // POS with sub-menu (mobile)
              if (isPOS) {
                return (
                  <div key={item.path}>
                    <div
                      className={`flex items-center rounded-lg overflow-hidden transition-colors ${
                        isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <Link
                        href={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex-1 flex items-center px-3 py-3 text-sm font-medium"
                      >
                        <Icon className="w-5 h-5 mr-3" />
                        {item.label}
                      </Link>
                      <button
                        onClick={() => toggleMenu('POS')}
                        className="px-3 py-3"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="ml-4 mt-1 space-y-1">
                        {posSubItems.map((subItem) => {
                          const SubIcon = subItem.icon;
                          const isSubActive = pathname === subItem.path || pathname.startsWith(subItem.path + '/');
                          const hasAccess = hasModule(subItem.moduleCode);

                          return (
                            <Link
                              key={subItem.path}
                              href={hasAccess ? subItem.path : (isIOSAppStore ? '#' : '/settings/subscription')}
                              onClick={() => setIsMobileMenuOpen(false)}
                              className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg ${
                                isSubActive
                                  ? 'bg-blue-500 text-white'
                                  : hasAccess
                                    ? 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    : 'text-gray-500 hover:bg-gray-800'
                              }`}
                            >
                              <SubIcon className="w-4 h-4 mr-3" />
                              <span className="flex-1">{t(subItem.labelKey)}</span>
                              {!hasAccess && <Lock className="w-3 h-3 text-gray-500" />}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center px-3 py-3 text-sm font-medium rounded-lg overflow-hidden transition-colors ${
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

            {/* Settings - hidden in native apps for App Store compliance */}
            {!isIOSAppStore && (
              <Link
                href="/settings"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center px-3 py-3 text-sm text-gray-300 hover:bg-gray-800 rounded-lg"
              >
                <Settings className="w-5 h-5 mr-3" />
                {t('settings')}
              </Link>
            )}
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
