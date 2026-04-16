import { useSyncExternalStore } from 'react';

/**
 * Subscribe to the `light` / `dark` class on `<html>`.
 *
 * This is the platform-level signal — set by:
 *   - `ThemeProvider`'s useLayoutEffect (main app + DemoWorkspace + landing nav)
 *   - the pre-hydration inline script in `landing/src/layouts/Root.astro`
 *
 * Using this hook lets non-provider-wrapped islands (landing deep-dives,
 * standalone previews) react to theme changes without needing a ThemeProvider
 * ancestor. Useful for code paths that must recompute theme-dependent
 * derived state (syntax palettes, editor chrome colors) when the user toggles.
 *
 * Returns `'dark'` on the server (SSR) so the default matches our
 * HTML default (`<html class="dark">`).
 */

type ResolvedTheme = 'dark' | 'light';

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function ensureObserver(): void {
  if (observer !== null) return;
  observer = new MutationObserver(() => {
    for (const fn of listeners) fn();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });
}

function subscribe(cb: () => void): () => void {
  ensureObserver();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

function getSnapshot(): ResolvedTheme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

function getServerSnapshot(): ResolvedTheme {
  return 'dark';
}

export function useHtmlThemeClass(): ResolvedTheme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
