'use client';

import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loading } from '@/components/ui/loading';
import {
  Lock,
  Check,
  AlertCircle,
  BarChart3,
  ShoppingCart,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
  Contact,
  Receipt,
  FileText,
  UserCog,
  LucideIcon,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';

// Client-side module info (no database dependencies)
const CLIENT_MODULES: Array<{
  code: string;
  name: string;
  nameZh: string;
  Icon: LucideIcon;
}> = [
  { code: 'DASHBOARD', name: 'Dashboard', nameZh: '数据看板', Icon: BarChart3 },
  { code: 'POS', name: 'POS', nameZh: 'POS', Icon: ShoppingCart },
  { code: 'INVENTORY', name: 'Inventory', nameZh: '库存', Icon: Package },
  { code: 'PURCHASE', name: 'Purchase', nameZh: '采购', Icon: ShoppingBag },
  { code: 'SALES', name: 'Sales', nameZh: '销售', Icon: TrendingUp },
  { code: 'CRM', name: 'CRM', nameZh: 'CRM', Icon: Users },
  { code: 'CONTACTS', name: 'Contacts', nameZh: '联系人', Icon: Contact },
  { code: 'ACCOUNTING', name: 'Expenses', nameZh: '费用', Icon: Receipt },
  { code: 'FINANCE', name: 'Finance', nameZh: '财务', Icon: FileText },
  { code: 'HR', name: 'Payroll', nameZh: '工资', Icon: UserCog },
];

interface ModuleFeature {
  moduleCode: string;
  isAllowed: boolean;
  isVisible: boolean;
}

// Simple Toggle component
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        checked ? 'bg-blue-600' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function ModulesSettingsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [updatingModules, setUpdatingModules] = useState<Set<string>>(new Set());

  // Fetch module features
  const { data: features, isLoading } = useQuery({
    queryKey: ['admin-modules'],
    queryFn: async () => {
      const res = await fetch('/api/admin/modules');
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data as ModuleFeature[];
    },
  });

  // Update visibility mutation
  const updateMutation = useMutation({
    mutationFn: async ({ moduleCode, isVisible }: { moduleCode: string; isVisible: boolean }) => {
      const res = await fetch('/api/admin/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleCode, isVisible }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to update');
      return data.data;
    },
    onMutate: async ({ moduleCode }) => {
      setUpdatingModules((prev) => new Set(prev).add(moduleCode));
    },
    onSettled: (_data, _error, { moduleCode }) => {
      setUpdatingModules((prev) => {
        const next = new Set(prev);
        next.delete(moduleCode);
        return next;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-modules'] });
    },
  });

  const getFeatureStatus = (code: string) => {
    return features?.find((f) => f.moduleCode === code);
  };

  const handleToggle = (moduleCode: string, currentVisible: boolean) => {
    updateMutation.mutate({ moduleCode, isVisible: !currentVisible });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading text={t('common.loading')} />
      </div>
    );
  }

  // Group modules by status
  const allowedModules = CLIENT_MODULES.filter((m) => getFeatureStatus(m.code)?.isAllowed);
  const lockedModules = CLIENT_MODULES.filter((m) => !getFeatureStatus(m.code)?.isAllowed);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="page-title">{t('modules.title')}</h1>
        <p className="text-gray-500 mt-1">{t('modules.description')}</p>
      </div>

      {/* Allowed Modules */}
      <div className="card">
        <div className="p-4 border-b">
          <h2 className="font-medium flex items-center gap-2">
            <Check className="w-5 h-5 text-green-500" />
            {t('modules.allowedModules')}
          </h2>
          <p className="text-sm text-gray-500 mt-1">{t('modules.allowedDescription')}</p>
        </div>
        <div className="divide-y">
          {allowedModules.map((module) => {
            const feature = getFeatureStatus(module.code);
            const isUpdating = updatingModules.has(module.code);
            const ModuleIcon = module.Icon;
            return (
              <div key={module.code} className="flex items-center justify-between p-4 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <ModuleIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-medium">{module.nameZh}</span>
                    <p className="text-sm text-gray-500">{module.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                  <Toggle
                    checked={feature?.isVisible ?? false}
                    onChange={() => handleToggle(module.code, feature?.isVisible ?? false)}
                    disabled={isUpdating}
                  />
                </div>
              </div>
            );
          })}
          {allowedModules.length === 0 && (
            <div className="p-8 text-center text-gray-500">{t('modules.noAllowedModules')}</div>
          )}
        </div>
      </div>

      {/* Locked Modules */}
      {lockedModules.length > 0 && (
        <div className="card">
          <div className="p-4 border-b">
            <h2 className="font-medium flex items-center gap-2">
              <Lock className="w-5 h-5 text-gray-400" />
              {t('modules.lockedModules')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{t('modules.lockedDescription')}</p>
          </div>
          <div className="divide-y">
            {lockedModules.map((module) => {
              const ModuleIcon = module.Icon;
              return (
              <div key={module.code} className="flex items-center justify-between p-4 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                    <ModuleIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">{module.nameZh}</span>
                    <p className="text-sm text-gray-400">{module.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Lock className="w-4 h-4" />
                  {t('modules.upgradeRequired')}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="card p-4 bg-blue-50 border-blue-100">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">{t('modules.infoTitle')}</h3>
            <p className="text-sm text-blue-700 mt-1">{t('modules.infoDescription')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
