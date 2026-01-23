'use client';

import { Package, FileText, BarChart3, ClipboardCheck, Folder, Users } from 'lucide-react';

interface EmptyStateProps {
  icon?: 'package' | 'file' | 'chart' | 'clipboard' | 'folder' | 'user';
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const icons = {
  package: Package,
  file: FileText,
  chart: BarChart3,
  clipboard: ClipboardCheck,
  folder: Folder,
  user: Users,
};

export function EmptyState({ icon = 'package', title, description, action }: EmptyStateProps) {
  const Icon = icons[icon];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
