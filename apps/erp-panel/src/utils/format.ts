import dayjs from 'dayjs';
import type { Currency } from '@/types';

/** Locale used for Intl formatting; numbers stay in latin digits for finance clarity. */
const NUMBER_LOCALE = 'en-US';

export function formatCurrency(
  value: number,
  currency: Currency = 'USD',
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options,
  }).format(value);
}

/** Compact money for KPI tiles: $1.92M, $277.2K. */
export function formatCompactCurrency(value: number, currency: Currency = 'USD'): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const symbol = currency === 'USD' ? '$' : 'AED ';
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** A quantity in metric tonnes, no unit: as many decimals as it has, up to 6 (one gram). */
export function formatQty(value: number): string {
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value);
}

/** Metric tonnes with up to 6 decimals (half a kilo is 0.0005 MT), unit appended. */
export function formatMt(value: number): string {
  return `${formatQty(value)} MT`;
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${formatNumber(value, fractionDigits)}%`;
}

export function formatDate(value?: string | null, pattern = 'DD MMM YYYY'): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format(pattern) : '—';
}

/** Initials for avatars, e.g. "Alco Metal Trading" → "AM". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
