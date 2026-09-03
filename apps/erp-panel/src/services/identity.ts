import type { Role } from '@/types';
import { request } from '@/services/http';

/**
 * The session, as the server describes it.
 *
 * Permissions used to be route keys only — the same strings the sidebar and the route guards
 * already test. They still are, but the server can now also grant fine-grained codes that are
 * not routes (e.g. `'conversions.confirm'`), so the type widened to `string[]`; route-key checks
 * (`permissions.includes(routeKey)`) still type-check because a `RouteKey` is a `string`.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarColor: string;
  /** Route keys plus fine-grained codes such as 'conversions.confirm' — whatever the server granted. */
  permissions: string[];
  /** Where this role lands after signing in. */
  home: string;
}

export const identityApi = {
  login: (email: string, password: string) =>
    request<SessionUser>('/api/identity/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<void>('/api/identity/logout', { method: 'POST' }),

  /**
   * Resolves to null when there is no session. The endpoint answers 200 for a visitor rather
   * than 401: "nobody is signed in" is the answer to the question, and a 401 would put a
   * console error on every signed-out page load. The user is wrapped because ASP.NET writes an
   * empty body for a bare null, which `response.json()` cannot parse.
   */
  me: async () => (await request<{ user: SessionUser | null }>('/api/identity/me')).user,
};
