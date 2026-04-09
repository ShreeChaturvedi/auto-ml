/** Shared subscribe factory — avoids repeating the same listener logic in every pref type. */
function makeSubscribe(key: string) {
  return (cb: () => void): (() => void) => {
    if (typeof window === 'undefined') return () => {};
    const handler = (e: StorageEvent) => { if (e.key === key) cb(); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  };
}

/** Shared setter helper — writes to localStorage and fires a synthetic StorageEvent for cross-tab sync. */
function makeSet(key: string) {
  return (v: string): void => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, v);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: v }));
  };
}

/** Factory for localStorage-backed boolean preferences with cross-tab sync. */
export function createLocalBoolPref(key: string, defaultValue: boolean) {
  const write = makeSet(key);
  return {
    get(): boolean {
      if (typeof localStorage === 'undefined') return defaultValue;
      return defaultValue
        ? localStorage.getItem(key) !== 'false'
        : localStorage.getItem(key) === 'true';
    },
    set(v: boolean): void { write(String(v)); },
    subscribe: makeSubscribe(key),
  };
}

/** Factory for localStorage-backed number preferences with cross-tab sync. */
export function createLocalNumberPref(key: string, defaultValue: number) {
  const write = makeSet(key);
  return {
    get(): number {
      if (typeof localStorage === 'undefined') return defaultValue;
      const parsed = Number(localStorage.getItem(key));
      return isNaN(parsed) ? defaultValue : parsed;
    },
    set(v: number): void { write(String(v)); },
    subscribe: makeSubscribe(key),
  };
}

/** Factory for localStorage-backed string preferences with cross-tab sync. */
export function createLocalStringPref<T extends string>(
  key: string,
  defaultValue: T,
  allowedValues?: T[],
) {
  const write = makeSet(key);
  return {
    get(): T {
      if (typeof localStorage === 'undefined') return defaultValue;
      const stored = localStorage.getItem(key) as T | null;
      if (stored === null) return defaultValue;
      if (allowedValues && !allowedValues.includes(stored)) return defaultValue;
      return stored;
    },
    set(v: T): void { write(v); },
    subscribe: makeSubscribe(key),
  };
}
