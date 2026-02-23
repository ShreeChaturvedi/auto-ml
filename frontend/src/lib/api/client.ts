import { useAuthStore } from '@/stores/authStore';

const BASE_URL = (import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api').replace(/\/$/, '');

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

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

interface RequestOptions extends Omit<RequestInit, 'method'> {
  method?: HttpMethod;
  parseJson?: boolean;
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

async function refreshAccessToken(refreshToken: string | null): Promise<string | null> {
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

        const data = (await response.json()) as { accessToken?: string };
        if (!data.accessToken) {
          return null;
        }

        const state = useAuthStore.getState();
        state.setTokens(data.accessToken, state.refreshToken ?? refreshToken);
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
    throw new ApiError(`Request to ${url} failed with status ${response.status}`, response.status, payload);
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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  const normalizedPath = normalizePath(path).split('?')[0];

  const isJsonString = typeof options.body === 'string';
  if (!headers.has('Content-Type') && isJsonString) {
    headers.set('Content-Type', 'application/json');
  }

  const authState = useAuthStore.getState();
  if (authState.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authState.accessToken}`);
  }

  const requestInit: RequestInit = {
    ...options,
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

  return parseResponse<T>(response, options, method, url);
}

export function getApiBaseUrl() {
  return BASE_URL;
}
