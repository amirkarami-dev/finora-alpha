import type { Role } from '@/types';
import type { RouteKey } from '@/config/roles';

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

/** A failed request, carrying the server's machine-readable code as its message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(code: string, status: number, extensions: Record<string, unknown> = {}) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    // Every extension the server sent is copied onto the error, because components read them
    // straight off it — `err.available`, `err.headerUSD`, `err.invoices`. Nesting them under a
    // property would break those messages without breaking anything a compiler can see.
    Object.assign(this, extensions);
  }
}

/**
 * The session cookie is HttpOnly, so there is no token to attach and nothing here reads one.
 * `credentials: 'same-origin'` is what actually carries the session; without it fetch would
 * send no cookie and every call would 401.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (response.ok) {
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  let code = `http-${response.status}`;
  let extensions: Record<string, unknown> = {};
  try {
    const problem = (await response.json()) as Record<string, unknown>;
    if (typeof problem.code === 'string') code = problem.code;
    // ProblemDetails' own members are not payload; everything else is.
    const { type, title, status, detail, instance, ...rest } = problem;
    void type;
    void title;
    void status;
    void detail;
    void instance;
    extensions = rest;
  } catch {
    // A non-JSON body (a proxy error page, say) leaves the http-<status> code above.
  }

  throw new ApiError(code, response.status, extensions);
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
