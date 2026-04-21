/**
 * Monaco Editor Pre-loader
 *
 * Pre-loads Monaco editor to eliminate loading flash when creating new code cells.
 * Call initMonaco() early in the app lifecycle (e.g., in App.tsx or main.tsx).
 */

import type { Monaco } from '@monaco-editor/react';
import type { SyntaxPalette } from '@/lib/color/syntaxPalette';
import { buildEditorColors } from '@/lib/color/editorColors';
import { STATIC_SYNTAX_PALETTE } from '@/lib/color/syntaxPalette';
import { ensureMonacoBootstrap } from '@/lib/monaco/bootstrap'

let monacoInstance: Monaco | null = null;
let initPromise: Promise<Monaco> | null = null;
let themesRegistered = false;
const readyListeners = new Set<() => void>();

/**
 * Subscribe to Monaco ready-state transitions. The callback fires once Monaco
 * has finished loading — useful for components that mounted before Monaco
 * was ready and need to re-apply theme / provider setup once it is.
 * Returns an unsubscribe function.
 */
export function subscribeMonacoReady(cb: () => void): () => void {
  // If Monaco is already loaded, schedule the callback asynchronously so
  // subscribers always receive a "first tick" notification in a consistent
  // ordering, matching useSyncExternalStore semantics.
  if (monacoInstance) {
    queueMicrotask(cb);
  }
  readyListeners.add(cb);
  return () => { readyListeners.delete(cb); };
}

// ── Theme builders ────────────────────────────────────────────────────────

function strip(hex: string) { return hex.replace('#', ''); }

function buildThemeRules(palette: SyntaxPalette) {
  return [
    { token: 'keyword', foreground: strip(palette.keyword), fontStyle: 'bold' },
    { token: 'string', foreground: strip(palette.string) },
    { token: 'number', foreground: strip(palette.number) },
    { token: 'comment', foreground: strip(palette.comment), fontStyle: 'italic' },
    { token: 'function', foreground: strip(palette.function) },
    { token: 'type', foreground: strip(palette.type) },
    { token: 'operator', foreground: strip(palette.operator) },
    { token: 'identifier', foreground: strip(palette.identifier) },
    { token: 'delimiter', foreground: strip(palette.punctuation) },
  ];
}

export function registerAdaptiveTheme(monaco: Monaco, palette: SyntaxPalette, isDark: boolean): void {
  const name = isDark ? 'adaptive-dark' : 'adaptive-light';
  monaco.editor.defineTheme(name, {
    base: isDark ? 'vs-dark' : 'vs', inherit: true,
    rules: buildThemeRules(palette),
    colors: buildEditorColors(palette, isDark),
  });
}

export function registerStaticThemes(monaco: Monaco): void {
  monaco.editor.defineTheme('static-dark', {
    base: 'vs-dark', inherit: true,
    rules: buildThemeRules(STATIC_SYNTAX_PALETTE.dark),
    colors: buildEditorColors(STATIC_SYNTAX_PALETTE.dark, true),
  });
  monaco.editor.defineTheme('static-light', {
    base: 'vs', inherit: true,
    rules: buildThemeRules(STATIC_SYNTAX_PALETTE.light),
    colors: buildEditorColors(STATIC_SYNTAX_PALETTE.light, false),
  });
  // Pre-register adaptive themes with the static palette so the IDs always
  // resolve even before `useProjectThemeColor` re-registers them with a
  // project-specific hue. Without this, a `setTheme('adaptive-light')` call
  // (from `<Editor theme>` or a component's `onMount`) issued before the
  // hook's layoutEffect has run silently falls back to Monaco's base theme
  // and the editor stays stuck on whatever it loaded with.
  registerAdaptiveTheme(monaco, STATIC_SYNTAX_PALETTE.dark, true);
  registerAdaptiveTheme(monaco, STATIC_SYNTAX_PALETTE.light, false);
}

/**
 * Pre-initialize Monaco editor and register custom themes
 */
export async function initMonaco(): Promise<Monaco> {
  if (monacoInstance) {
    return monacoInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    await ensureMonacoBootstrap()
    const { loader } = await import('@monaco-editor/react');

    // Load Monaco
    const monaco = await loader.init();

    // Register custom themes once
    if (!themesRegistered) {
      registerStaticThemes(monaco);
      themesRegistered = true;
    }

    monacoInstance = monaco;
    console.log('[monaco] Pre-loaded and themes registered');
    for (const cb of readyListeners) cb();
    return monaco;
  })();

  return initPromise;
}

/**
 * Check if Monaco is ready
 */
export function isMonacoReady(): boolean {
  return monacoInstance !== null;
}

/**
 * Get the Monaco instance (throws if not initialized)
 */
export function getMonaco(): Monaco {
  if (!monacoInstance) {
    throw new Error('Monaco not initialized. Call initMonaco() first.');
  }
  return monacoInstance;
}

/**
 * Get Monaco instance or null if not ready
 */
export function getMonacoIfReady(): Monaco | null {
  return monacoInstance;
}
