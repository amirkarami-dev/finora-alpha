import type { TFunction } from 'i18next';
import { formatMt } from '@/utils/format';

/** The message for a refused quantity change; the generic key when the code is not one of ours. */
export function changeQuantityMessage(err: unknown, t: TFunction): string {
  const code = err instanceof Error ? err.message : '';
  if (code === 'change-delta-zero') return t('contracts.changeDeltaZero');
  if (code === 'change-note-required') return t('contracts.changeNoteRequired');
  if (code === 'change-below-zero') {
    const quantity = (err as { quantityMt?: number }).quantityMt;
    return t('contracts.changeBelowZero', { mt: formatMt(quantity ?? 0) });
  }
  return t('common.saveFailed');
}
