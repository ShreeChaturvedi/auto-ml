import fs from 'node:fs';
import pg from 'pg';

import { UserRepository } from '../src/repositories/userRepository.js';
import { authService } from '../src/services/authService.js';

const email = fs.readFileSync('/tmp/e2e-test-email.txt', 'utf8').trim();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const repo = new UserRepository(pool);

const user = await repo.findByEmail(email);
if (!user) {
  console.error('no user');
  process.exit(1);
}

const token = authService.generateSecureToken();
const hash = authService.hashRefreshToken(token);
const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
await repo.storeEmailVerificationToken(user.user_id, hash, expires);
console.log('TOKEN:', token);
console.log('URL: http://localhost:5173/verify-email?token=' + token);
await pool.end();
