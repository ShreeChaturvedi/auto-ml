import type { SafeUser } from '../types/user.js';

export const TEST_USER: SafeUser = {
  user_id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  email_verified: true,
  auth_provider: 'password',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  last_login_at: null
};

export const TEST_USER_B: SafeUser = {
  user_id: 'test-user-456',
  email: 'other@example.com',
  name: 'Other User',
  role: 'user',
  email_verified: true,
  auth_provider: 'password',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  last_login_at: null
};

/** Returns an Authorization header object for use with supertest `.set()`. */
export function authHeader(token = 'valid-token') {
  return { Authorization: `Bearer ${token}` } as const;
}
