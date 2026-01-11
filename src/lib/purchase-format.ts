/**
 * Formatting utilities for the Purchase page
 * Compact amount display: 万/亿 for large numbers
 */

/**
 * Format amount with compact notation (万/亿)
 * - >= 1億 (100,000,000): 1.0億
 * - >= 1万 (10,000): 1.2万
 * - < 1万: ¥1,234
 */
export function formatCompactAmount(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount >= 100_000_000) {
    // 億 (100 million)
    return `${sign}¥${(absAmount / 100_000_000).toFixed(1)}億`;
  } else if (absAmount >= 10_000) {
    // 万 (10 thousand)
    const man = absAmount / 10_000;
    // Show 1 decimal for < 100万, 0 decimals for >= 100万
    if (man >= 100) {
      return `${sign}¥${Math.round(man)}万`;
    }
    return `${sign}¥${man.toFixed(1)}万`;
  } else {
    return `${sign}¥${absAmount.toLocaleString('ja-JP')}`;
  }
}

/**
 * Format full amount (no abbreviation)
 */
export function formatFullAmount(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date in Japanese locale
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ja-JP');
}

/**
 * Get status badge styles
 */
export function getQueueBadgeStyle(queue: string): string {
  const styles: Record<string, string> = {
    to_confirm: 'bg-yellow-100 text-yellow-700',
    to_receive: 'bg-blue-100 text-blue-700',
    to_pay: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
  };
  return styles[queue] || 'bg-gray-100 text-gray-700';
}
