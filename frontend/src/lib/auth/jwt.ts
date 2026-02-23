type JwtPayload = {
  exp?: number;
  [key: string]: unknown;
};

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

export function decodeJwtPayload<T extends JwtPayload = JwtPayload>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = decodeBase64Url(parts[1]);
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, bufferSeconds: number = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + bufferSeconds;
}
