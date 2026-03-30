/**
 * Sidebar preference persistence — localStorage + StorageEvent pattern.
 * Follows the same shape as syntaxPalette.ts adaptive preference.
 */

const ACCORDION_KEY = 'automl-sidebar-accordion';

/** Whether sidebar uses accordion mode (only one phase expanded at a time). Default: false. */
export function getSidebarAccordionPref(): boolean {
  return localStorage.getItem(ACCORDION_KEY) === 'true';
}

export function setSidebarAccordionPref(v: boolean): void {
  localStorage.setItem(ACCORDION_KEY, String(v));
  window.dispatchEvent(new StorageEvent('storage', { key: ACCORDION_KEY, newValue: String(v) }));
}

export function subscribeSidebarAccordionPref(cb: () => void): () => void {
  const handler = (e: StorageEvent) => { if (e.key === ACCORDION_KEY) cb(); };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
