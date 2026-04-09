import { useEffect } from 'react';

/**
 * Calls `callback` when Escape is pressed, unless focus is inside an
 * input / textarea / contentEditable or a dialog is open.
 */
export function useEscapeKey(enabled: boolean, callback: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active as HTMLElement)?.isContentEditable
      ) return;
      if (document.querySelector('[data-state="open"][role="dialog"]')) return;
      callback();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, callback]);
}
