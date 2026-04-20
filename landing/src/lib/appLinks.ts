const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';
const DEFAULT_LOGIN_PATH = '/login';
const DEFAULT_VERIFY_EMAIL_PATH = '/verify-email';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

export function getFrontendOrigin(): string {
  return trimTrailingSlash(import.meta.env.PUBLIC_FRONTEND_ORIGIN || DEFAULT_FRONTEND_ORIGIN);
}

export function getAppLoginUrl(): string {
  return import.meta.env.PUBLIC_APP_LOGIN_URL || `${getFrontendOrigin()}${DEFAULT_LOGIN_PATH}`;
}

export function getVerifyEmailUrl(token: string): string {
  const verifyPath = import.meta.env.PUBLIC_VERIFY_EMAIL_PATH || DEFAULT_VERIFY_EMAIL_PATH;
  const url = new URL(verifyPath, `${getFrontendOrigin()}/`);
  url.searchParams.set('token', token);
  return url.toString();
}
