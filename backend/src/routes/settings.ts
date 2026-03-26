import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config.js';
import { getDbPool } from '../db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { SettingsRepository } from '../repositories/settingsRepository.js';
import type { AuthenticatedRequest } from '../types/auth.js';

// Defines each configurable setting: its env-var default and validation range
const SETTING_DEFS = {
  queryCacheTtlMs:      { default: () => env.queryCacheTtlMs,      schema: z.coerce.number().int().min(0).max(3_600_000) },
  sqlMaxRows:           { default: () => env.sqlMaxRows,            schema: z.coerce.number().int().min(10).max(10_000) },
  sqlDefaultLimit:      { default: () => env.sqlDefaultLimit,       schema: z.coerce.number().int().min(10).max(1_000) },
  executionTimeoutMs:   { default: () => env.executionTimeoutMs,    schema: z.coerce.number().int().min(5_000).max(120_000) },
  executionMaxMemoryMb: { default: () => env.executionMaxMemoryMb,  schema: z.coerce.number().int().min(256).max(4_096) },
} as const;

type SettingKey = keyof typeof SETTING_DEFS;
const VALID_KEYS = new Set<string>(Object.keys(SETTING_DEFS));

const patchSchema = z.object({
  settings: z.record(z.string(), z.union([z.string(), z.number()]))
}).refine(
  (data) => Object.keys(data.settings).every((k) => VALID_KEYS.has(k)),
  { message: `Valid keys: ${Object.keys(SETTING_DEFS).join(', ')}` }
);

export function createSettingsRouter() {
  const router = Router();

  // GET /settings — return all settings with current effective values
  router.get(
    '/settings',
    asyncHandler(async (req, res) => {
      const user = (req as AuthenticatedRequest).user;
      const repo = new SettingsRepository(getDbPool());
      const rows = await repo.getAll(user.user_id);

      const overrides: Record<string, string> = {};
      for (const row of rows) overrides[row.setting_key] = row.value;

      const settings: Record<string, number> = {};
      for (const [key, def] of Object.entries(SETTING_DEFS)) {
        const override = overrides[key];
        settings[key] = override !== undefined ? Number(override) : def.default();
      }

      return res.json({ settings });
    })
  );

  // PATCH /settings — update one or more settings
  router.patch(
    '/settings',
    asyncHandler(async (req, res) => {
      const user = (req as AuthenticatedRequest).user;
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
      }

      const repo = new SettingsRepository(getDbPool());
      const errors: Record<string, string> = {};

      for (const [key, rawValue] of Object.entries(parsed.data.settings)) {
        const def = SETTING_DEFS[key as SettingKey];
        const result = def.schema.safeParse(rawValue);
        if (!result.success) {
          errors[key] = result.error.issues[0].message;
          continue;
        }
        await repo.upsert(user.user_id, key, String(result.data));
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
      }

      // Return updated settings
      const rows = await repo.getAll(user.user_id);
      const overrides: Record<string, string> = {};
      for (const row of rows) overrides[row.setting_key] = row.value;

      const settings: Record<string, number> = {};
      for (const [key, def] of Object.entries(SETTING_DEFS)) {
        const override = overrides[key];
        settings[key] = override !== undefined ? Number(override) : def.default();
      }

      return res.json({ settings });
    })
  );

  return router;
}
