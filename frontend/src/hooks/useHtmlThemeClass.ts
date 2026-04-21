import { useSyncExternalStore } from 'react';

type ResolvedTheme = 'dark' | 'light';

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function ensureObserver(): void {
  if (observer !== null) return;
  observer = new MutationObserver(() => {
    for (const listener of listeners) listener();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

function subscribe(listener: () => void): () => void {
  ensureObserver();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
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
