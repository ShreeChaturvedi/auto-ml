import type { SafeUser } from '../types/user.js';

export const TEST_USER: SafeUser = {
  user_id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  email_verified: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  last_login_at: null
};
