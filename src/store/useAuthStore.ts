import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '@/types';
import { USERS, normalizeRole } from '@/config/roles';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarColor: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

/**
 * Mock auth. Seeded accounts (see config/roles.ts) validate their password and carry a
 * real role; any other email logs in as a demo Manager (any password).
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: async (email: string, password: string) => {
        await new Promise((r) => setTimeout(r, 600));
        const target = email.trim().toLowerCase();
        const seeded = USERS.find((u) => u.email.toLowerCase() === target);
        if (seeded) {
          if (seeded.password !== password) throw new Error('invalid-credentials');
          const user: AuthUser = {
            id: `u-${seeded.role.toLowerCase()}`,
            name: seeded.name,
            email: seeded.email,
            role: seeded.role,
            avatarColor: seeded.avatarColor,
          };
          set({ user, token: 'demo-token', isAuthenticated: true });
          return user;
        }
        const name =
          email
            .split('@')[0]
            ?.replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Trading Desk';
        const user: AuthUser = { id: 'u-001', name, email, role: 'Manager', avatarColor: '#b87333' };
        set({ user, token: 'demo-token', isAuthenticated: true });
        return user;
      },
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'finora-auth',
      version: 1,
      // Without this, a version mismatch with no `migrate` logs a console.error and DROPS the
      // persisted state entirely (zustand's default behaviour) — which fails `npm run smoke`
      // (screenshots redirect to /login, and the console.error trips the failure check).
      // Migrating to a logged-out state is the safe default for an auth store.
      migrate: () => ({ user: null, token: null, isAuthenticated: false }),
      // Coerce any legacy/persisted role (e.g. 'Finance Manager') to a valid Role.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<AuthState>) } as AuthState;
        if (merged.user) merged.user = { ...merged.user, role: normalizeRole(merged.user.role) };
        return merged;
      },
    },
  ),
);
