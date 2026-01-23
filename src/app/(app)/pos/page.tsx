'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Receipt, ArrowRight, Utensils, ClipboardList, Boxes, Armchair } from 'lucide-react';

export default function PosPage() {
  const t = useTranslations();

  const menuItems = [
    {
      href: '/pos/product-management',
      icon: Boxes,
      title: t('pos.productManagement'),
      description: t('pos.productManagementDesc'),
      color: 'bg-indigo-50 text-indigo-600',
    },
    {
      href: '/pos/tables',
      icon: Armchair,
      title: t('pos.tables'),
      description: t('pos.tablesDesc'),
      color: 'bg-amber-50 text-amber-600',
    },
    {
      href: '/pos/orders',
      icon: Receipt,
      title: t('pos.orders'),
      description: t('pos.ordersDesc'),
      color: 'bg-green-50 text-green-600',
    },
    {
      href: '/pos/consumption',
      icon: Utensils,
      title: t('pos.consumption'),
      description: t('pos.consumptionDesc'),
      color: 'bg-orange-50 text-orange-600',
    },
    {
      href: '/pos/replenishment',
      icon: ClipboardList,
      title: t('pos.replenishment'),
      description: t('pos.replenishmentDesc'),
      color: 'bg-red-50 text-red-600',
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="page-title">{t('nav.pos')}</h1>

      <div className="grid sm:grid-cols-2 gap-4">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${item.color}`}>
                <item.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-medium text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                  {item.title}
                </h2>
                <p className="text-sm text-gray-500">{item.description}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
