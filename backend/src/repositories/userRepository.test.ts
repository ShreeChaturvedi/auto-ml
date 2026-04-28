import { describe, expect, it } from 'vitest';

import { TEST_USER } from '../tests/fixtures.js';

import { UserRepository } from './userRepository.js';

describe('UserRepository.toSafeUser', () => {
  it('strips password_hash from API-facing users', () => {
    const repository = new UserRepository({} as never);
    const safeUser = repository.toSafeUser({
      ...TEST_USER,
      password_hash: '$2b$12$secret-hash',
    } as typeof TEST_USER & { password_hash: string });

    expect(safeUser).toMatchObject({
      user_id: TEST_USER.user_id,
      email: TEST_USER.email,
      email_verified: TEST_USER.email_verified,
    });
    expect(safeUser).not.toHaveProperty('password_hash');
  });
});
