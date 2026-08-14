import { create } from 'zustand';
import type { Role } from '@/types';
import type { RouteKey } from '@/config/roles';
import { normalizeRole } from '@/config/roles';
import { identityApi, type SessionUser } from '@/services/identity';
import { clearHydratedData, hydrateFromServer, setServerBacked } from '@/services/snapshot';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarColor: string;
}

interface AuthState {
  user: AuthUser | null;
  /** Route keys this user may reach, as granted by the server. */
  permissions: RouteKey[];
  /** Where this role lands after signing in. */
  home: string;
  isAuthenticated: boolean;
  /** False until the first `restore()` finishes, so guards do not redirect mid-check. */
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

function toUser(session: SessionUser): AuthUser {
  return {
    id: session.id,
    name: session.name,
    email: session.email,
    role: normalizeRole(session.role),
    avatarColor: session.avatarColor,
  };
}

/**
 * The session lives in an HttpOnly cookie, so there is nothing to persist here and nothing for
 * a script — ours or an attacker's — to read. This store is a cache of what the server said,
 * rebuilt on load by `restore()`; it is deliberately NOT persisted, because a persisted copy
 * would outlive the cookie and let the app render a signed-in shell around a dead session.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  permissions: [],
  home: '/app',
  isAuthenticated: false,
  ready: false,

  login: async (email, password) => {
    const session = await identityApi.login(email, password);
    const user = toUser(session);
    set({
      user,
      permissions: session.permissions,
      home: session.home,
      isAuthenticated: true,
      ready: true,
    });

    // Load the data for THIS session, now that there is one.
    //
    // The app also hydrates on mount, but on a device where nobody is signed in yet that request
    // is answered 401 and the store stays empty — so without this line, signing in showed an
    // empty app until the page was reloaded by hand. Worse, `serverBacked` stayed false, so
    // anything entered on that device went to the browser alone and never reached the server:
    // two devices quietly disagreeing, each convinced it was right.
    //
    // It also replaces whatever the previous session left behind, which matters because the
    // server tailors the snapshot to the role asking for it.
    setServerBacked(await hydrateFromServer());
    return user;
  },

  logout: async () => {
    try {
      await identityApi.logout();
    } finally {
      // Clear locally even if the call failed: the user asked to be signed out, and leaving
      // them looking signed in because the network blipped is the wrong way to be wrong.
      set({ user: null, permissions: [], home: '/app', isAuthenticated: false, ready: true });
      // The business data goes too. Ending the session but leaving the dataset would let the
      // next person to sign in on this browser read what the last one could.
      clearHydratedData();
    }
  },

  restore: async () => {
    try {
      const session = await identityApi.me();
      set(
        session
          ? {
              user: toUser(session),
              permissions: session.permissions,
              home: session.home,
              isAuthenticated: true,
              ready: true,
            }
          : { user: null, permissions: [], home: '/app', isAuthenticated: false, ready: true },
      );
    } catch {
      // The API is unreachable. Treat it as signed out rather than blocking the app forever;
      // the login attempt that follows will surface the real problem.
      set({ user: null, permissions: [], home: '/app', isAuthenticated: false, ready: true });
    }
  },
}));
