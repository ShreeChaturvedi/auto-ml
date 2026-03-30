/**
 * Monaco Editor Pre-loader
 *
 * Pre-loads Monaco editor to eliminate loading flash when creating new code cells.
 * Call initMonaco() early in the app lifecycle (e.g., in App.tsx or main.tsx).
 */

import type { Monaco } from '@monaco-editor/react';
import type { SyntaxPalette } from '@/lib/color/syntaxPalette';
import { STATIC_SYNTAX_PALETTE } from '@/lib/color/syntaxPalette';

let monacoInstance: Monaco | null = null;
let initPromise: Promise<Monaco> | null = null;
let themesRegistered = false;

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

function buildEditorColors(palette: SyntaxPalette, isDark: boolean): Record<string, string> {
  return {
    'editor.background': isDark ? '#0a0a0a' : '#ffffff',
    'editor.foreground': isDark ? '#fafafa' : '#1f2328',
    'editor.lineHighlightBackground': palette.lineHighlight,
    'editorLineNumber.foreground': isDark ? '#a3a3a3' : '#d4d4d4',
    'editorLineNumber.activeForeground': isDark ? '#d4d4d4' : '#a3a3a3',
    'editorCursor.foreground': palette.cursor,
    'editor.selectionBackground': palette.selectionBg,
    'editorGutter.background': isDark ? '#0a0a0a' : '#ffffff',
  };
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
