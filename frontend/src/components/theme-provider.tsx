/**
 * Theme Provider - Dark/Light mode management
 *
 * Provides a context for theme switching and persists the preference to localStorage.
 * All components should consume this context for theme-aware rendering.
 */

/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => null
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const getSystemTheme = (): 'dark' | 'light' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'automl-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useLayoutEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    // Keep <meta name="theme-color"> in sync with the resolved theme so
    // iOS Safari's browser chrome matches the page background. No-op when
    // the meta tag isn't present (main-app currently ships without it).
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute(
        'content',
        resolvedTheme === 'light' ? '#FFFFFF' : '#0A0A0B',
      );
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemTheme(getSystemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Cross-surface sync: when another tab / island writes to the same storage
  // key (e.g. the landing page toggle, or a second tab of the app), re-apply
  // the new value locally so the document class, Monaco themes, embedded
  // previews, etc. all flip live. Matches the current theme's storage contract.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        setTheme(e.newValue as Theme);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  const value = {
    theme,
    resolvedTheme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      // Synthetic cross-provider ping: the native `storage` event only fires
      // in OTHER tabs, so within this tab we dispatch one ourselves so any
      // sibling ThemeProvider (e.g. landing + embedded demo) picks up the
      // change live. The provider that initiated is idempotent w.r.t. this
      // re-entry — setTheme with the same value is a no-op.
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: storageKey,
          newValue: theme,
          storageArea: localStorage
        })
      );
      setTheme(theme);
    }
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};