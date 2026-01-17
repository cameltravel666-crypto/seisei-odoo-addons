'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { CreditCard, Blocks, ChevronRight, User, Palette, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useIsNative } from '@/hooks/use-native';

const settingsItems = [
  {
    key: 'team',
    href: '/settings/team',
    icon: Users,
    titleKey: 'team.title',
    descKey: 'team.description',
    adminOnly: true,
  },
  {
    key: 'subscription',
    href: '/settings/subscription',
    icon: CreditCard,
    titleKey: 'subscription.title',
    descKey: 'subscription.description',
    hideInNative: true, // App Store 3.1.1/3.1.3 compliance - no purchase CTAs in native apps
  },
  {
    key: 'modules',
    href: '/settings/modules',
    icon: Blocks,
    titleKey: 'modules.title',
    descKey: 'modules.description',
    adminOnly: true,
  },
];

export default function SettingsPage() {
  const t = useTranslations();
  const { user } = useAuthStore();
  const isNative = useIsNative();

  const filteredItems = settingsItems.filter(
    (item) =>
      (!item.adminOnly || user?.isAdmin) &&
      // App Store compliance: hide subscription in native apps
      (!('hideInNative' in item) || !item.hideInNative || !isNative)
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="page-title">{t('nav.settings')}</h1>
      </div>

      {/* Settings List */}
      <div className="card divide-y">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 transition"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900">{t(item.titleKey)}</h3>
                <p className="text-sm text-gray-500 truncate">{t(item.descKey)}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </Link>
          );
        })}
      </div>

      {/* User Info Card */}
      {user && (
        <div className="card p-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="w-6 h-6 text-gray-500" />
            </div>
            <div>
              <h3 className="font-medium">{user.displayName}</h3>
              <p className="text-sm text-gray-500">{user.tenant.name}</p>
              {user.isAdmin && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                  Admin
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
