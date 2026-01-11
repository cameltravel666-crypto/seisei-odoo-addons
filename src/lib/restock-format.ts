/**
 * Formatting utilities for the Replenishment/Restock page
 * Rules:
 * - Default 0 decimals, 1 decimal if <10 and needs precision
 * - >1000 shows as 1.2k format
 * - Days: <=0.5 = critical, <=2 = warning, >2 = normal
 */

export type DaysStatus = 'critical' | 'warning' | 'normal';

/**
 * Format quantity with unit
 * - 0 decimals by default
 * - 1 decimal if <10 and has fractional part
 * - >1000 shows as "1.2k"
 */
export function formatQty(value: number, unit: string): string {
  const absValue = Math.abs(value);

  if (absValue >= 1000) {
    const k = absValue / 1000;
    return `${k.toFixed(1)}k ${unit}`;
  }

  // For small values with meaningful decimals
  if (absValue < 10 && absValue % 1 !== 0) {
    return `${absValue.toFixed(1)} ${unit}`;
  }

  return `${Math.round(absValue)} ${unit}`;
}

/**
 * Format days remaining and return status
 * - <=0.5: "0天" + critical (red)
 * - <=2: "1-2天" + warning (orange)
 * - >2: ">2天" + normal (green/gray)
 */
export function formatDays(days: number): { text: string; status: DaysStatus } {
  if (days <= 0.5) {
    return { text: '0天', status: 'critical' };
  }
  if (days <= 2) {
    const roundedDays = Math.ceil(days);
    return { text: `${roundedDays}天`, status: 'warning' };
  }
  return { text: `${Math.round(days)}天`, status: 'normal' };
}

/**
 * Format daily usage rate
 * - Round to integer
 * - >1000 shows as "1.2k"
 */
export function formatRate(rate: number, unit: string): string {
  const rounded = Math.round(rate);

  if (rounded >= 1000) {
    const k = rounded / 1000;
    return `${k.toFixed(1)}k ${unit}/日`;
  }

  return `${rounded} ${unit}/日`;
}

/**
 * Get CSS classes for days status
 */
export function getDaysStatusColor(status: DaysStatus): string {
  switch (status) {
    case 'critical':
      return 'text-red-600';
    case 'warning':
      return 'text-orange-500';
    case 'normal':
      return 'text-gray-600';
  }
}

/**
 * Get background CSS classes for status badge
 */
export function getDaysStatusBadgeStyle(status: DaysStatus): string {
  switch (status) {
    case 'critical':
      return 'bg-red-100 text-red-700';
    case 'warning':
      return 'bg-orange-100 text-orange-700';
    case 'normal':
      return 'bg-green-100 text-green-700';
  }
}
