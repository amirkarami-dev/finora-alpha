import type { Contract, Item, InvoiceItem } from '@/types';

/**
 * Effective unit price per MT.
 *   unitPrice = fixedLmePrice * (lmePercent / 100) + premium
 * Verified against workbook: 11,685 × 94.76% + 0 ≈ 11,072 USD/MT.
 */
export function unitPrice(item: Pick<Item, 'fixedLmePrice' | 'lmePercent' | 'premium'>): number {
  return item.fixedLmePrice * (item.lmePercent / 100) + item.premium;
}

/** Full contracted value of an item (before partial shipment). */
export function itemValue(item: Item): number {
  return unitPrice(item) * item.quantityMt;
}

/** Sum of contracted MT across a contract's items. */
export function contractQuantityMt(contract: Contract): number {
  return contract.items.reduce((sum, it) => sum + it.quantityMt, 0);
}

/** Sum of contracted value across a contract's items. */
export function contractValue(contract: Contract): number {
  return contract.items.reduce((sum, it) => sum + itemValue(it), 0);
}

export function contractRemainingMt(contract: Contract): number {
  return contract.items.reduce((sum, it) => sum + it.remainingMt, 0);
}

export function aedToUsd(aed: number, fxRate: number): number {
  return fxRate > 0 ? aed / fxRate : 0;
}

export function usdToAed(usd: number, fxRate: number): number {
  return usd * fxRate;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** USD/MT unit price of a trade-invoice line; null while a floating line lacks lmePrice. */
export function invoiceItemUnitPrice(item: Pick<InvoiceItem,
  'lmeFixed' | 'fixedPrice' | 'lmePrice' | 'lmePercent' | 'premium'>): number | null {
  const base = item.lmeFixed ? item.fixedPrice : item.lmePrice;
  if (base === undefined || base === null) return null;
  return base * (item.lmePercent / 100) + item.premium;
}

/** USD line value after discount; 0 while the price is incomplete (spec §3). */
export function invoiceItemAmount(item: Pick<InvoiceItem,
  'lmeFixed' | 'fixedPrice' | 'lmePrice' | 'lmePercent' | 'premium' | 'quantityMt' | 'discountPercent'>): number {
  const unit = invoiceItemUnitPrice(item);
  if (unit === null) return 0;
  const gross = unit * item.quantityMt;
  return gross * (1 - (item.discountPercent ?? 0) / 100);
}

/**
 * Splits `amount` into `n` equal parts in integer cents. Equal split gives every part the same
 * fractional remainder, so the tie-break is positional — leftover cents go to the FIRST parts.
 * Σ result === round(amount) exactly. Callers guarantee amount > 0 (`invalid-amount`).
 *
 * Integer cents, not float division: `$100 / 3` → exactly `[33.34, 33.33, 33.33]`, never a
 * repeating-decimal remainder split across the parts.
 *
 * Imported by BOTH `api.ts` (authoritative, server-side) and the Phase 4b line modal (live
 * preview) so the two can never disagree — see
 * docs/superpowers/specs/2026-07-27-expense-revenue-claim-rework-design.md §3.
 *
 * `Math.floor`, NOT `Math.trunc`: trunc rounds a negative quotient TOWARD ZERO, which makes
 * `remainder` negative, so `i < remainder` never fires and the leftover cents are silently
 * dropped — `splitEqually(-100, 3)` returned [-33.33, -33.33, -33.33] (Σ = -99.99), breaking this
 * function's own stated postcondition. `floor` keeps `remainder` in [0, n) for BOTH signs and is
 * bit-identical to `trunc` for amount >= 0 (verified by an exhaustive sweep), so the callers'
 * `amount > 0` contract above is unaffected.
 */
export function splitEqually(amount: number, n: number): number[] {
  if (n <= 0) return [];
  const totalCents = Math.round(amount * 100);
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}
