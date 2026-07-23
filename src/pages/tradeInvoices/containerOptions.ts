import type { ContainerOptionRow } from '@/services/api';
import { formatDate } from '@/utils/format';

export interface ContainerSelectOption {
  value: string;
  label: string;
}

const optionLabel = (c: ContainerOptionRow): string => `${c.reference} · ${formatDate(c.loadDate)}`;

/**
 * Shared AntD `options` builder for the three invoice container pickers (spec §5.2). Pass
 * `contractItemId` to filter to containers that actually carry that good; omit it (or pass
 * `undefined`) for the unfiltered list — used by ConvertContainerModal (a strict superset
 * filter would be empty for any multi-product invoice, i.e. dead UI) and by the "Show all
 * containers" toggle in AddItemsModal / EditLineModal.
 *
 * Label is a PLAIN STRING, never a ReactNode: all three Selects use `optionFilterProp="label"`,
 * and a ReactNode label both breaks search and reproduces the §5.3 goods-Select bleed.
 */
export function buildContainerOptions(
  containers: ContainerOptionRow[],
  contractItemId?: string,
): ContainerSelectOption[] {
  const scoped = contractItemId
    ? containers.filter((c) => c.contractItemIds.includes(contractItemId))
    : containers;
  return scoped.map((c) => ({ value: c.id, label: optionLabel(c) }));
}

/**
 * EditLineModal safety net (spec §5.2): unions the line's currently-assigned container into
 * `options` when it isn't already there (i.e. it doesn't carry the good and the list is
 * filtered) — flagged with `notCarryingSuffix` so a pre-existing non-carrying value never
 * renders as a raw container id.
 */
export function withSelectedContainer(
  options: ContainerSelectOption[],
  containers: ContainerOptionRow[],
  selectedId: string | undefined,
  notCarryingSuffix: string,
): ContainerSelectOption[] {
  if (!selectedId || options.some((o) => o.value === selectedId)) return options;
  const container = containers.find((c) => c.id === selectedId);
  if (!container) return options;
  return [...options, { value: container.id, label: `${optionLabel(container)} ${notCarryingSuffix}` }];
}
