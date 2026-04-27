import { randomUUID } from 'node:crypto';

import { closeDbPool, getDbPool } from '../db.js';
import { authService } from '../services/authService.js';

const DEMO_PASSWORD = 'Test@12345';
const DEMO_USERS = [
  { email: 'aesh800110@gmail.com', name: 'Aesh Demo' },
  { email: 'yadava5@miamioh.edu', name: 'Ayush Demo' },
  { email: 'aesh_1055@icloud.com', name: 'Aesh iCloud Demo' }
];

async function main() {
  const pool = getDbPool();
  const passwordHash = await authService.hashPassword(DEMO_PASSWORD);

  for (const user of DEMO_USERS) {
    const result = await pool.query(
      `INSERT INTO users (
        user_id,
        email,
        password_hash,
        name,
        role,
        email_verified,
        auth_provider,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'user', true, 'password', NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            name = EXCLUDED.name,
            role = 'user',
            email_verified = true,
            auth_provider = 'password',
            updated_at = NOW()
      RETURNING user_id, email, name, email_verified, auth_provider`,
      [randomUUID(), user.email.toLowerCase(), passwordHash, user.name]
    );

    const row = result.rows[0];

    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [row.user_id]);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [row.user_id]);
    await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [row.user_id]);

    console.log(
      `[demo-users] ready ${row.email} (${row.name}) verified=${String(row.email_verified)} provider=${row.auth_provider}`
    );
  }
}

main()
  .catch((error) => {
    console.error(`[demo-users] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbPool();
  });
