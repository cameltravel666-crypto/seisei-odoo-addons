/**
 * Exporter Factory & Registry
 * 导出器工厂和注册中心
 */

import type { ExportTarget, ExporterConfig } from '@/types/export';
import { BaseExporter } from './base';
import { FreeeExporter } from './freee';
import { MoneyForwardExporter } from './moneyforward';
import { YayoiExporter } from './yayoi';

// 导出器注册表
const exporterRegistry: Record<ExportTarget, new () => BaseExporter> = {
  freee: FreeeExporter,
  moneyforward: MoneyForwardExporter,
  yayoi: YayoiExporter,
};

// 缓存实例
const exporterCache = new Map<ExportTarget, BaseExporter>();

/**
 * 获取导出器实例
 */
export function getExporter(target: ExportTarget): BaseExporter {
  // 从缓存获取
  let exporter = exporterCache.get(target);

  if (!exporter) {
    const ExporterClass = exporterRegistry[target];
    if (!ExporterClass) {
      throw new Error(`Unknown export target: ${target}`);
    }
    exporter = new ExporterClass();
    exporterCache.set(target, exporter);
  }

  return exporter;
}

/**
 * 获取所有可用的导出目标
 */
export function getAvailableTargets(): ExportTarget[] {
  return Object.keys(exporterRegistry) as ExportTarget[];
}

/**
 * 获取所有导出器配置
 */
export function getExporterConfigs(): ExporterConfig[] {
  return getAvailableTargets().map(target => getExporter(target).getConfig());
}

/**
 * 检查导出目标是否有效
 */
export function isValidTarget(target: string): target is ExportTarget {
  return target in exporterRegistry;
}

// 导出基类和具体实现
export { BaseExporter } from './base';
export { FreeeExporter } from './freee';
export { MoneyForwardExporter } from './moneyforward';
export { YayoiExporter } from './yayoi';

// 导出目标信息（用于UI显示）
export const EXPORT_TARGETS: Record<ExportTarget, {
  name: string;
  nameJa: string;
  description: string;
  descriptionJa: string;
  icon?: string;
  helpUrl?: string;
}> = {
  freee: {
    name: 'freee',
    nameJa: 'freee会計',
    description: 'Export to freee accounting journal import format',
    descriptionJa: 'freee会計の仕訳インポート形式でエクスポート',
    helpUrl: 'https://support.freee.co.jp/hc/ja/articles/202847470',
  },
  moneyforward: {
    name: 'MoneyForward',
    nameJa: 'マネーフォワード クラウド会計',
    description: 'Export to MoneyForward cloud accounting journal format',
    descriptionJa: 'マネーフォワード クラウド会計の仕訳帳形式でエクスポート',
    helpUrl: 'https://biz.moneyforward.com/support/account/guide/journal/',
  },
  yayoi: {
    name: 'Yayoi',
    nameJa: '弥生会計',
    description: 'Export to Yayoi accounting journal import format',
    descriptionJa: '弥生会計の仕訳日記帳インポート形式でエクスポート',
    helpUrl: 'https://www.yayoi-kk.co.jp/products/account/',
  },
};

// Phase 2 预留目标（尚未实现）
export const FUTURE_TARGETS = [
  { id: 'obic', name: '奉行シリーズ', status: 'planned' },
  { id: 'pca', name: 'PCA会計', status: 'planned' },
  { id: 'tkc', name: 'TKC', status: 'planned' },
  { id: 'mjs', name: 'MJSリンク', status: 'planned' },
] as const;
