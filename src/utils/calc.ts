import type { Container, Contract, Item, InvoiceItem } from '@/types';

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

/** Shipped MT for an item, computed from its containers. */
export function shippedMt(itemId: string, containers: Container[]): number {
  return containers
    .filter((c) => c.itemId === itemId)
    .reduce((sum, c) => sum + c.quantityMt, 0);
}

/** Container invoice value: lmePrice already net of % in the workbook + premium. */
export function containerInvoice(
  container: Pick<Container, 'quantityMt' | 'lmePrice' | 'premium'>,
): number {
  return (container.lmePrice + container.premium) * container.quantityMt;
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
