import { ROUTES } from '@/config/constants';
import type { ChargeDirection } from '@/types';

/**
 * List route per charge direction (design spec §9 Phase 5's parameterisation gate). Only
 * `ROUTES.expenses` is registered in Phase 4b — `/app/revenues` is a literal here on purpose:
 * Phase 5 is "a thin wrapper + registration + i18n only", so once it registers `ROUTES.revenues`
 * and the route, this file needs no change at all. That is exactly what the gate is checking —
 * if Phase 5 ever needed to touch this mapping, the direction-parameterisation done here would
 * have been wrong.
 */
const CHARGE_DIRECTION_ROUTE: Record<ChargeDirection, string> = {
  EXPENSE: ROUTES.expenses,
  REVENUE: '/app/revenues',
};

export function chargeListRoute(direction: ChargeDirection): string {
  return CHARGE_DIRECTION_ROUTE[direction];
}

export function chargeDetailRoute(direction: ChargeDirection, id: string): string {
  return `${CHARGE_DIRECTION_ROUTE[direction]}/${encodeURIComponent(id)}`;
}
