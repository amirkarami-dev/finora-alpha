/**
 * One fetch wrapper for every call to the API.
 *
 * <p>Shared rather than repeated because the two things it does are the two things that must not
 * vary: the session cookie is HttpOnly, so `credentials: 'same-origin'` is what actually carries
 * it — without that flag fetch sends nothing and every call 401s — and a failed response has to
 * arrive as an `ApiError` whose message is the bare code, because that is what the components
 * branch on.</p>
 */

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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
