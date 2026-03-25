/**
 * Shared helpers for tool result renderers.
 */
import type { ReactNode } from 'react';
import { Hash, Calendar, ToggleLeft, Type } from 'lucide-react';

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Score as a 0–1 float → percentage */
export function scorePercent(score: number): number {
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

/** Colour stop based on relevance score */
export function scoreColor(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.4) return 'bg-amber-500';
  return 'bg-rose-400';
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
