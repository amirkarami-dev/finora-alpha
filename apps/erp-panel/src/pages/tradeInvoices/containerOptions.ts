import type { CSSProperties } from 'react';
import type { ContainerOptionRow } from '@/services/api';
import { formatDate } from '@/utils/format';

export interface ContainerSelectOption {
  value: string;
  label: string;
}

/**
 * RTL fix (spec §5.3): a bare `dir="ltr"` span does NOT change which side an ancestor's own
 * `direction:rtl` + `overflow:hidden;text-overflow:ellipsis` box clips from — the ancestor still
 * right-anchors the (wider) content and clips the LEADING token (verified empirically: the
 * option/selection-item box positions overflowing nowrap content flush to its `direction:rtl`
 * start edge, i.e. the right, so the reference/number at the START of the string is what
 * overflows and gets clipped, not the trailing date/customer). Giving the LTR span its own
 * block box + overflow/ellipsis makes IT the truncating box instead, so it right-anchors within
 * itself in LTR terms and clips the TRAILING token — exactly what §5.3 asks for.
 */
export const ltrTruncateStyle: CSSProperties = {
  display: 'block',
  direction: 'ltr',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

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
