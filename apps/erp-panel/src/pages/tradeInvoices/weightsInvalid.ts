import type { TFunction } from 'i18next';

/** The `rule` the server attaches to a `weights-invalid` refusal (spec §2). */
type WeightsRule = 'gross' | 'tare' | 'tare-exceeds-gross' | 'quantity';

const KEY_BY_RULE: Record<WeightsRule, string> = {
  gross: 'tradeInvoices.weightsInvalidGross',
  tare: 'tradeInvoices.weightsInvalidTare',
  'tare-exceeds-gross': 'tradeInvoices.weightsInvalidTareExceedsGross',
  quantity: 'tradeInvoices.weightsInvalidQuantity',
};

/** The message for a caught `weights-invalid` error; the generic key when the rule is unknown. */
export function weightsInvalidMessage(err: unknown, t: TFunction): string {
  const rule = (err as { rule?: string } | undefined)?.rule as WeightsRule | undefined;
  return t(rule && rule in KEY_BY_RULE ? KEY_BY_RULE[rule] : 'common.saveFailed');
}
