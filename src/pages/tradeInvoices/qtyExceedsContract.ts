import type { ContractQtyCheck } from '@/services/api';
import { formatMt } from '@/utils/format';

/** Shape thrown by `checkContractQty`'s call sites (spec §3.2): the full breakdown plus the
 *  offending product, attached to a `qty-exceeds-remaining` Error via `Object.assign`. */
type QtyExceedsError = Error & Partial<ContractQtyCheck> & { product?: string };

/**
 * Builds the i18n interpolation params for `tradeInvoices.qtyExceedsContract` from a caught
 * `qty-exceeds-remaining` error's attached breakdown (spec §3.4). Returns `undefined` when the
 * payload is absent (defensive — e.g. an older/unexpected error shape), so callers can fall back
 * to the terse `tradeInvoices.qtyExceedsRemaining` string.
 */
export function qtyExceedsContractParams(
  err: unknown,
): { product: string; contract: string; invoiced: string; remaining: string; requested: string } | undefined {
  if (!(err instanceof Error)) return undefined;
  const e = err as QtyExceedsError;
  if (
    e.product === undefined ||
    e.contractQuantityMt === undefined ||
    e.alreadyInvoicedMt === undefined ||
    e.remainingMt === undefined ||
    e.requestedMt === undefined
  ) {
    return undefined;
  }
  return {
    product: e.product,
    contract: formatMt(e.contractQuantityMt),
    invoiced: formatMt(e.alreadyInvoicedMt),
    remaining: formatMt(e.remainingMt),
    requested: formatMt(e.requestedMt),
  };
}
