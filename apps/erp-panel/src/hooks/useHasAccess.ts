import type { RouteKey } from '@/config/roles';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * The app's in-page RBAC gate.
 *
 * A route guard (`routes/index.tsx`'s `RoleRoute`) controls whether a whole PAGE is reachable,
 * but Staff can reach invoice detail — guarded with `['purchase','sale']`, both of which Staff
 * holds — while needing to stay barred from a finer-grained fragment on it. `useHasAccess(key)`
 * lets a page hide such a fragment without a full route guard. `InvoiceChargesCard` is the
 * caller that matters: an empty card would still tell Staff that costs exist, so the card is
 * omitted rather than emptied.
 *
 * Permissions come from the server (`/api/identity/me`) rather than from a table compiled into
 * the bundle. Anyone can edit the bundle; only the server decides what the API will answer.
 */
export function useHasAccess(key: RouteKey): boolean {
  return useAuthStore((s) => s.permissions.includes(key));
}
