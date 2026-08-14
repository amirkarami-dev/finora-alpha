import type { Role, User } from '@/types';
import { request } from '@/services/http';

/**
 * User administration.
 *
 * <p>Separate from `masterData.ts` because these are not master data: they live under the
 * Identity module at `/api/identity/*`, not `/api/erp/*`, and they have no offline path. Every
 * other write in this app falls back to the browser's own copy when the API is unreachable —
 * these cannot, because an account that exists only in one browser is not an account.</p>
 */

export interface UserInput {
  email: string;
  name: string;
  role: Role;
  avatarColor?: string;
}

export const usersApi = {
  list: () => request<User[]>('/api/identity/users'),

  /** The roles that can be assigned. Asked of the server rather than hardcoded, so the list
   *  cannot drift from what the backend will actually accept. */
  roles: () => request<Role[]>('/api/identity/users/roles'),

  create: (input: UserInput & { password: string }) =>
    request<User>('/api/identity/users', { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: UserInput) =>
    request<User>(`/api/identity/users/${id}`, {
      method: 'PUT',
      // The email is not sent: it identifies the account, and the server ignores it on edit.
      body: JSON.stringify({ name: input.name, role: input.role, avatarColor: input.avatarColor }),
    }),

  setActive: (id: string, active: boolean) =>
    request<User>(`/api/identity/users/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),

  /** An administrator setting someone else's password. */
  setPassword: (id: string, password: string) =>
    request<void>(`/api/identity/users/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }),

  /** Changing your own. Needs a session and nothing more — no administrative permission. */
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    request<void>('/api/identity/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};
