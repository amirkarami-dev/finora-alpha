import type { ContractRemainingRow } from '@/services/api';
import { roundMt } from '@/utils/calc';
import type { Invoice } from '@/types';

/**
 * Per goods line, how far THIS document's lines go past what the contract has left for it.
 * `remaining` must come from `useContractRemaining(contractId, side, invoice.id)` — with this
 * document excluded — so its own lines are counted once, here. Lines that fit are absent.
 */
export function overContractByItem(invoice: Invoice, remaining: ContractRemainingRow[] | undefined): Map<string, number> {
  const onDoc = new Map<string, number>();
  for (const line of invoice.items) {
    onDoc.set(line.contractItemId, (onDoc.get(line.contractItemId) ?? 0) + line.quantityMt);
  }
  const over = new Map<string, number>();
  for (const [itemId, mt] of onDoc) {
    const left = remaining?.find((r) => r.itemId === itemId)?.uninvoicedMt ?? 0;
    const excess = roundMt(mt - left);
    if (excess > 1e-9) over.set(itemId, excess);
  }
  return over;
}
