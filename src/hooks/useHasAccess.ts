import { ROLE_ACCESS, normalizeRole, type RouteKey } from '@/config/roles';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * The app's first in-page RBAC gate (spec §6.3, CRITICAL): a route guard
 * (`routes/index.tsx`'s `RoleRoute`) controls whether a whole PAGE is reachable, but Staff can
 * reach invoice detail (guarded with `['purchase','sale']`, both of which Staff holds) while
 * still being barred from the Expenses module itself. `useHasAccess('expenses')` lets a page
 * conditionally render a fragment (the invoice's Expenses card) without a full route guard.
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
