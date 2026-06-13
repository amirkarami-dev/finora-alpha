import { theme } from 'antd';
import type { Currency } from '@/types';
import { formatCompactCurrency, formatCurrency } from '@/utils/format';

interface MoneyProps {
  value: number;
  currency?: Currency;
  compact?: boolean;
  colored?: boolean;
  strong?: boolean;
  muteZero?: boolean;
  fractionDigits?: number;
}

export function Money({
  value,
  currency = 'USD',
  compact = false,
  colored = false,
  strong = false,
  muteZero = false,
  fractionDigits,
}: MoneyProps) {
  const { token } = theme.useToken();
  const text = compact
    ? formatCompactCurrency(value, currency)
    : formatCurrency(
        value,
        currency,
        fractionDigits !== undefined
          ? { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }
          : {},
      );

  let color: string | undefined;
  if (muteZero && value === 0) color = token.colorTextQuaternary;
  else if (colored) color = value > 0 ? token.colorError : token.colorSuccess;

  return (
    <span
      style={{
        color,
        fontWeight: strong ? 600 : undefined,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}
