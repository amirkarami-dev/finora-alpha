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
  /**
   * Accounting presentation for a TWO-SIDED figure: a negative renders in brackets, `(390)`,
   * matching how the desk writes it.
   *
   * Deliberately ignores `colored`. That mode paints a positive red and anything else green,
   * which is right for a receivable — but on a two-sided balance a negative means "we owe this
   * person", and showing that in green reads as good news. The brackets carry the direction, and
   * callers say which way it goes in words.
   */
  signed?: boolean;
}

export function Money({
  value,
  currency = 'USD',
  compact = false,
  colored = false,
  strong = false,
  muteZero = false,
  fractionDigits,
  signed = false,
}: MoneyProps) {
  const { token } = theme.useToken();
  const shown = signed ? Math.abs(value) : value;
  const body = compact
    ? formatCompactCurrency(shown, currency)
    : formatCurrency(
        shown,
        currency,
        fractionDigits !== undefined
          ? { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }
          : {},
      );
  const text = signed && value < 0 ? `(${body})` : body;

  let color: string | undefined;
  if (muteZero && value === 0) color = token.colorTextQuaternary;
  else if (signed) color = undefined;
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
