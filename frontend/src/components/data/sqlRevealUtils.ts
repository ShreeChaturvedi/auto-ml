import { CHAR_ANIM_DURATION_MS } from '@/components/ui/useAnimatedPlaceholder';

import type { SqlTokenType } from './sqlTokenize';

export const TOKEN_CLASS_BY_TYPE: Record<SqlTokenType, string> = {
  keyword: 'sql-tk-kw',
  function: 'sql-tk-fn',
  string: 'sql-tk-str',
  number: 'sql-tk-num',
  operator: 'sql-tk-op',
  punctuation: 'sql-tk-punc',
  identifier: 'sql-tk-id',
  whitespace: ''
};

export function tokenClassName(type: SqlTokenType): string {
  return TOKEN_CLASS_BY_TYPE[type] ?? '';
}

/** Inline color map for dimmed placeholder tokens (alpha-channel dimming). */
export const TOKEN_INLINE_COLORS: Record<SqlTokenType, string> = {
  keyword:     'hsl(var(--syn-keyword) / 0.6)',
  function:    'hsl(var(--syn-function) / 0.6)',
  string:      'hsl(var(--syn-string) / 0.6)',
  number:      'hsl(var(--syn-number) / 0.6)',
  operator:    'hsl(var(--syn-operator) / 0.45)',
  punctuation: 'hsl(var(--syn-punctuation) / 0.45)',
  identifier:  'hsl(var(--syn-identifier) / 0.45)',
  whitespace:  'transparent',
};

/* ── Reveal timing ──────────────────────────────────────────────────── */

const REVEAL_TARGET_MS = 2000;
const MIN_STAGGER_MS = 8;
const MAX_STAGGER_MS = 32;

export function computeRevealStagger(totalVisibleChars: number): number {
  return Math.max(
    MIN_STAGGER_MS,
    Math.min(MAX_STAGGER_MS, REVEAL_TARGET_MS / Math.max(1, totalVisibleChars))
  );
}

export function computeRevealDuration(totalVisibleChars: number): number {
  const stagger = computeRevealStagger(totalVisibleChars);
  return Math.max(400, (totalVisibleChars - 1) * stagger + CHAR_ANIM_DURATION_MS + 150);
}
