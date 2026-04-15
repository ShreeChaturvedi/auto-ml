/**
 * Non-component helpers for working with `StatusKind`. Kept in a separate
 * file from `StatusPill.tsx` so Fast Refresh HMR sees a single export
 * shape per file.
 */

import type { StatusKind } from './StatusPill';

/**
 * Map of known raw status strings → `StatusKind`. Lower-cased keys.
 * Unknown strings fall through to `'info'`; empty / nullish fall through
 * to `'neutral'`.
 */
const STATUS_MAP: Record<string, StatusKind> = {
  success: 'success',
  ok: 'success',
  passed: 'success',
  completed: 'success',
  done: 'success',
  registered: 'success',
  configured: 'success',
  checkpointed: 'success',
  committed: 'success',

  error: 'failed',
  failed: 'failed',
  failure: 'failed',
  rejected: 'failed',

  running: 'running',
  training: 'running',
  executing: 'running',
  in_progress: 'running',

  awaiting_approval: 'awaiting',
  awaiting: 'awaiting',

  pending: 'pending',
  queued: 'pending',

  warning: 'warning',
  skipped: 'skipped',
};

/**
 * Normalize a raw status string from a tool output into a `StatusKind`
 * the shared `StatusPill` primitive understands.
 */
export function normalizeStatus(raw: string | undefined | null): StatusKind {
  if (!raw) return 'neutral';
  return STATUS_MAP[raw.toLowerCase().trim()] ?? 'info';
}
