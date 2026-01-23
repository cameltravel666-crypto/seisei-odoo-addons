'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FolderTree, Package, FlaskConical, ArrowRight } from 'lucide-react';

export default function ProductsPage() {
  const t = useTranslations();

  const menuItems = [
    {
      href: '/products/list',
      icon: Package,
      title: t('products.productList'),
      description: t('products.productListDesc'),
      color: 'bg-blue-50 text-blue-600',
    },
    {
      href: '/products/categories',
      icon: FolderTree,
      title: t('category.title'),
      description: t('category.description'),
      color: 'bg-purple-50 text-purple-600',
    },
    {
      href: '/products/bom',
      icon: FlaskConical,
      title: t('products.bom'),
      description: t('products.bomDesc'),
      color: 'bg-green-50 text-green-600',
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="page-title">{t('nav.products')}</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
