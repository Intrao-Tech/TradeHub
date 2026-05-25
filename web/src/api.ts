const API = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

let accessToken: string | null = localStorage.getItem('access_token');
let refreshToken: string | null = localStorage.getItem('refresh_token');

export function getToken() {
  return accessToken;
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

/**
 * Error thrown by `api()` for non-2xx responses. Preserves the structured
 * body so callers can inspect `code`, `reasons`, etc.
 *
 * `message` is set to the JSON-stringified body so existing `instanceof Error`
 * users can still read it as text via `err.message`. Pages that want the
 * structured body should call `parseApiError(err)`.
 */
export class ApiError extends Error {
  status: number;
  body: Record<string, unknown> | null;

  constructor(status: number, body: Record<string, unknown> | null) {
    const text = body ? JSON.stringify(body) : `HTTP ${status}`;
    super(text);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function parseApiError(err: unknown): {
  status: number;
  code?: string;
  message?: string;
  body?: Record<string, unknown> | null;
} | null {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      code: typeof err.body?.code === 'string' ? (err.body.code as string) : undefined,
      message: typeof err.body?.message === 'string' ? (err.body.message as string) : undefined,
      body: err.body,
    };
  }
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message);
      if (parsed && typeof parsed === 'object') {
        return {
          status: 0,
          code: typeof parsed.code === 'string' ? parsed.code : undefined,
          message: typeof parsed.message === 'string' ? parsed.message : err.message,
          body: parsed,
        };
      }
    } catch {
      /* fallthrough */
    }
    return { status: 0, message: err.message };
  }
  return null;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      credentials: 'include',
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      setTokens(data.access_token, data.refresh_token);
      headers['Authorization'] = `Bearer ${data.access_token}`;
      const retry = await fetch(`${API}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
      if (!retry.ok) {
        await throwFromResponse(retry);
      }
      if (retry.status === 204) return {} as T;
      return retry.json();
    } else {
      clearTokens();
      window.location.href = '/login?reason=expired';
      throw new ApiError(401, { code: 'REFRESH_INVALID', message: 'Session expired.' });
    }
  }

  if (!res.ok) {
    await throwFromResponse(res);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

async function throwFromResponse(res: Response): Promise<never> {
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
    // class-validator returns `message: string[]` — flatten for display
    if (Array.isArray(body.message)) {
      body.message = (body.message as string[]).join(', ');
    }
  } catch {
    body = { message: res.statusText };
  }
  throw new ApiError(res.status, body);
}
