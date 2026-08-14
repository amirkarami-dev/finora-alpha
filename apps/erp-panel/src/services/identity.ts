import type { Role } from '@/types';
import type { RouteKey } from '@/config/roles';
import { request } from '@/services/http';

/**
 * The session, as the server describes it.
 *
 * Permissions are route keys — the same strings the sidebar and the route guards already test —
 * so moving the decision to the server changed where the answer comes from, not the answer.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarColor: string;
  permissions: RouteKey[];
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
