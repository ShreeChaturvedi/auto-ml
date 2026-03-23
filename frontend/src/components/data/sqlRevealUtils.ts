import { useEffect, useState } from 'react';
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

export const GENERATION_STATUS_STEPS = [
  'Interpreting intent and target metrics',
  'Mapping schema entities and relationships',
  'Synthesizing read-only SQL draft',
  'Running safety and syntax validation',
] as const;

export const GENERATION_SKELETON_WIDTHS = [92, 74, 86, 62, 79, 68] as const;

export function tokenClassName(type: SqlTokenType): string {
  return TOKEN_CLASS_BY_TYPE[type] ?? '';
}

/** Inline color map for dimmed placeholder tokens (alpha-channel dimming). */
export const TOKEN_INLINE_COLORS: Record<SqlTokenType, string> = {
  keyword:     'hsl(var(--primary) / 0.6)',
  function:    'hsl(var(--chart-2) / 0.6)',
  string:      'hsl(var(--chart-3) / 0.6)',
  number:      'hsl(var(--chart-4) / 0.6)',
  operator:    'hsl(var(--muted-foreground) / 0.45)',
  punctuation: 'hsl(var(--muted-foreground) / 0.45)',
  identifier:  'hsl(var(--foreground) / 0.45)',
  whitespace:  'transparent',
};

function resolveEditorTheme(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (theme !== 'system') {
    return theme;
  }

  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useResolvedEditorTheme(theme: 'light' | 'dark' | 'system') {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveEditorTheme(theme));

  useEffect(() => {
    setResolvedTheme(resolveEditorTheme(theme));

    if (theme !== 'system') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  return resolvedTheme;
}
