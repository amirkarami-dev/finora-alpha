import { ROLE_ACCESS, normalizeRole, type RouteKey } from '@/config/roles';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * The app's first in-page RBAC gate, originally added for the (now removed, see
 * docs/superpowers/specs/2026-07-24-empty-seed-and-expenses-design.md §6.3) flat expense module:
 * a route guard (`routes/index.tsx`'s `RoleRoute`) controls whether a whole PAGE is reachable,
 * but Staff can reach invoice detail (guarded with `['purchase','sale']`, both of which Staff
 * holds) while needing to stay barred from a finer-grained fragment on it. `useHasAccess(key)`
 * lets a page conditionally render such a fragment without a full route guard — the charges
 * rework's `InvoiceChargesCard` (spec docs/superpowers/specs/2026-07-27-expense-revenue-claim-
 * rework-design.md §6/§7, Phase 7) is this hook's next caller.
 *
 * Lives outside `config/roles.ts` on purpose: `roles.ts` is imported BY `useAuthStore` (for
 * `USERS`/`normalizeRole`), so a hook here that also imports `useAuthStore` would form a
 * circular import. It survived there only because `normalizeRole` was a hoisted `function`
 * declaration — referencing `USERS`/`ROLE_ACCESS` at the store's module top level would turn app
 * boot into a TDZ ReferenceError.
 */
export function useHasAccess(key: RouteKey): boolean {
  return ROLE_ACCESS[normalizeRole(useAuthStore((s) => s.user?.role))].includes(key);
}
