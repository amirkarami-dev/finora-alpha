import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string) => Promise<AuthUser>;
  logout: () => void;
}

/** Mock auth — accepts any credentials and returns a demo user. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: async (email: string) => {
        await new Promise((r) => setTimeout(r, 600));
        const name =
          email
            .split('@')[0]
            ?.replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Trading Desk';
        const user: AuthUser = {
          id: 'u-001',
          name,
          email,
          role: 'Finance Manager',
          avatarColor: '#10a37f',
        };
        set({ user, token: 'demo-token', isAuthenticated: true });
        return user;
      },
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    { name: 'finora-auth' },
  ),
);
