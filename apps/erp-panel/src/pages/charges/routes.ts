import { ROUTES } from '@/config/constants';
import type { ChargeDirection } from '@/types';

/**
 * List route per charge direction (design spec §9 Phase 5's parameterisation gate). Phase 4b
 * registered only `ROUTES.expenses`; Phase 5 adds `ROUTES.revenues` to `constants.ts` and points
 * it here — the only change this file needed, exactly as the gate predicted (no shared component
 * internals touched).
 */
const CHARGE_DIRECTION_ROUTE: Record<ChargeDirection, string> = {
  EXPENSE: ROUTES.expenses,
  REVENUE: ROUTES.revenues,
};

export function chargeListRoute(direction: ChargeDirection): string {
  return CHARGE_DIRECTION_ROUTE[direction];
}

export function chargeDetailRoute(direction: ChargeDirection, id: string): string {
  return `${CHARGE_DIRECTION_ROUTE[direction]}/${encodeURIComponent(id)}`;
}
