import type { SafeUser } from '../types/user';

export const TEST_USER: SafeUser = {
  user_id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  email_verified: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_login_at: null
};
