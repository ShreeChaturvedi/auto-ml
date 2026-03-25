import { useAuthStore } from '@/stores/authStore';

const BASE_URL = (import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api').replace(/\/$/, '');

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

interface RequestOptions extends Omit<RequestInit, 'method' | 'body'> {
  method?: HttpMethod;
  parseJson?: boolean;
  body?: BodyInit | object | null;
}

const REFRESH_EXCLUDED_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/refresh'
]);

let refreshPromise: Promise<string | null> | null = null;

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

export async function refreshAccessToken(refreshToken: string | null): Promise<string | null> {
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as { accessToken?: string; refreshToken?: string };
        if (!data.accessToken) {
          return null;
        }

        const state = useAuthStore.getState();
        state.setTokens(data.accessToken, data.refreshToken ?? state.refreshToken ?? refreshToken);
        return data.accessToken;
      } catch (error) {
        console.error('[API] Failed to refresh access token', error);
        return null;
      }
    })();
  }

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function parseResponse<T>(
  response: Response,
  options: RequestOptions,
  method: HttpMethod,
  url: string
): Promise<T> {
  if (!response.ok) {
    const cloned = response.clone();
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = await cloned.text();
    }
    console.error(`[API Error] ${method} ${url} - Status ${response.status}`, payload);
    const payloadMessage = extractApiErrorMessage(payload);
    const suffix = payloadMessage ? `: ${payloadMessage}` : '';
    throw new ApiError(
      `Request to ${url} failed with status ${response.status}${suffix}`,
      response.status,
      payload
    );
  }

  if (options.parseJson === false || response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return undefined as T;
}

function extractApiErrorMessage(payload: unknown): string | null {
  const MAX_CHARS = 320;

  const truncate = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.length > MAX_CHARS ? `${trimmed.slice(0, MAX_CHARS)}…` : trimmed;
  };

  if (typeof payload === 'string') {
    const msg = truncate(payload);
    return msg || null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;

  // Common backend shape: { error: string }
  if (typeof record.error === 'string') {
    const msg = truncate(record.error);
    return msg || null;
  }

  if (typeof record.details === 'string') {
    const msg = truncate(record.details);
    return msg || null;
  }

  // Zod flatten: { errors: { formErrors?: string[], fieldErrors?: Record<string, string[]> } }
  if (record.errors && typeof record.errors === 'object') {
    const errors = record.errors as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[]>;
    };

    const form = Array.isArray(errors.formErrors) ? errors.formErrors.filter(Boolean) : [];
    const field = errors.fieldErrors && typeof errors.fieldErrors === 'object'
      ? Object.entries(errors.fieldErrors)
          .flatMap(([key, values]) => (values ?? []).map((value) => `${key}: ${value}`))
          .filter(Boolean)
      : [];

    const combined = [...form, ...field].filter(Boolean).join(' | ');
    const msg = truncate(combined);
    return msg || null;
  }

  if (typeof record.message === 'string') {
    const msg = truncate(record.message);
    return msg || null;
  }

  // Provider error payload: { error: { message: string } }
  if (record.error && typeof record.error === 'object') {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === 'string') {
      const msg = truncate(nested.message);
      return msg || null;
    }
  }

  return null;
}

async function applyAuthSideEffects(response: Response): Promise<void> {
  // Unverified email: clear session so the user is redirected to login
  if (response.status === 403) {
    const cloned = response.clone();
    try {
      const body = await cloned.json() as { error?: string };
      if (body?.error === 'Email not verified') {
        const store = useAuthStore.getState();
        store.clearAuth();
        store.setError('Please verify your email address before continuing.');
      }
    } catch {
      // not JSON — ignore and let caller handle the response normally
    }
  }
}

export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const method = options.method ?? 'GET';
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  const normalizedPath = normalizePath(path).split('?')[0];

  // Auto-serialize object bodies to JSON
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && typeof body !== 'string') {
    body = JSON.stringify(body);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  } else if (!headers.has('Content-Type') && typeof body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const authState = useAuthStore.getState();
  if (authState.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authState.accessToken}`);
  }

  const requestInit: RequestInit = {
    ...(Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'body')) as Omit<RequestInit, 'body'>),
    body: body as BodyInit,
    method,
    headers
  };

  console.info(`[frontend api] ${method} ${url}`);

  const hadAuthHeader = headers.has('Authorization');
  let response = await fetch(url, requestInit);

  if (
    response.status === 401 &&
    authState.refreshToken &&
    !REFRESH_EXCLUDED_PATHS.has(normalizedPath)
  ) {
    const newAccessToken = await refreshAccessToken(authState.refreshToken);
    if (newAccessToken) {
      headers.set('Authorization', `Bearer ${newAccessToken}`);
      response = await fetch(url, { ...requestInit, headers });
    } else {
      useAuthStore.getState().clearAuth();
    }
  }

  if (response.status === 401 && hadAuthHeader && !REFRESH_EXCLUDED_PATHS.has(normalizedPath)) {
    headers.delete('Authorization');
    response = await fetch(url, { ...requestInit, headers });
  }

  await applyAuthSideEffects(response);

  return response;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await apiFetch(path, options);

  return parseResponse<T>(response, options, method, url);
}

export function getApiBaseUrl() {
  return BASE_URL;
}
