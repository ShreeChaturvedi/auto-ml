/**
 * useResolvedEditorTheme — shared theme resolution for all editor surfaces.
 *
 * Consolidates duplicated resolveEditorTheme logic from sqlRevealUtils,
 * QueryPanel, usePythonEditor, and NotebookMarkdownCell.
 */

import { useEffect, useState } from 'react';

function resolveEditorTheme(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useResolvedEditorTheme(theme: 'light' | 'dark' | 'system') {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveEditorTheme(theme));

  useEffect(() => {
    setResolvedTheme(resolveEditorTheme(theme));
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setResolvedTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return resolvedTheme;
}
