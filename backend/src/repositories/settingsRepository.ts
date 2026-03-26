import type { Pool } from 'pg';

export interface UserSetting {
  setting_key: string;
  value: string;
  updated_at: Date;
}

export class SettingsRepository {
  constructor(private pool: Pool) {}

  async getAll(userId: string): Promise<UserSetting[]> {
    const result = await this.pool.query(
      'SELECT setting_key, value, updated_at FROM user_settings WHERE user_id = $1',
      [userId]
    );
    return result.rows;
  }

  async upsert(userId: string, key: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_settings (user_id, setting_key, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, setting_key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [userId, key, value]
    );
  }
}
