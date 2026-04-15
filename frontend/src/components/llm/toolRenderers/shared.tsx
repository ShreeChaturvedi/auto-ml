/**
 * Shared helpers for tool result renderers (pure functions / constants only).
 *
 * Component helpers live in `sharedComponents.tsx` — keeping this file all
 * non-component exports lets Fast Refresh HMR work without `eslint-disable`
 * pragmas. `normalizeStatus` lives in `@/components/llm/shared/statusHelpers`
 * because it's not renderer-specific.
 */
import type { ReactNode } from 'react';
import { Hash, Calendar, ToggleLeft, Type } from 'lucide-react';
import { clamp01 } from '@/lib/utils';

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Score as a 0–1 float → percentage */
export function scorePercent(score: number): number {
  return Math.round(clamp01(score) * 100);
}

/** Map dtype strings to a short badge label + icon hint */
export function dtypeInfo(dtype: string): { label: string; icon: ReactNode } {
  const d = dtype.toLowerCase();
  if (d.includes('int') || d.includes('float') || d.includes('numeric') || d.includes('double'))
    return { label: 'numeric', icon: <Hash className="h-3 w-3" /> };
  if (d.includes('date') || d.includes('time'))
    return { label: 'datetime', icon: <Calendar className="h-3 w-3" /> };
  if (d.includes('bool'))
    return { label: 'boolean', icon: <ToggleLeft className="h-3 w-3" /> };
  return { label: 'text', icon: <Type className="h-3 w-3" /> };
}

// `normalizeStatus` was moved to `@/components/llm/shared/statusHelpers`
// so non-renderer consumers can import it without reaching into the
// renderer-only subdirectory. Re-exported here for backwards compatibility
// with existing renderer imports.
export { normalizeStatus } from '@/components/llm/shared/statusHelpers';
