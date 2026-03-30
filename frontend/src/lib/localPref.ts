/** Factory for localStorage-backed boolean preferences with cross-tab sync. */
export function createLocalBoolPref(key: string, defaultValue: boolean) {
  return {
    get(): boolean {
      if (typeof localStorage === 'undefined') return defaultValue;
      return defaultValue
        ? localStorage.getItem(key) !== 'false'
        : localStorage.getItem(key) === 'true';
    },
    set(v: boolean): void {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, String(v));
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: String(v) }));
    },
    subscribe(cb: () => void): () => void {
      if (typeof window === 'undefined') return () => {};
      const handler = (e: StorageEvent) => { if (e.key === key) cb(); };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}
