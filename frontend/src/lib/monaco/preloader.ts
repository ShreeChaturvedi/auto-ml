/**
 * Monaco Editor Pre-loader
 *
 * Pre-loads Monaco editor to eliminate loading flash when creating new code cells.
 * Call initMonaco() early in the app lifecycle (e.g., in App.tsx or main.tsx).
 */

import type { Monaco } from '@monaco-editor/react';

let monacoInstance: Monaco | null = null;
let initPromise: Promise<Monaco> | null = null;
let themesRegistered = false;

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
      // Python dark theme matching site aesthetics
      monaco.editor.defineTheme('python-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: '60a5fa', fontStyle: 'bold' },
          { token: 'string', foreground: '34d399' },
          { token: 'number', foreground: 'f472b6' },
          { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
          { token: 'function', foreground: '38bdf8' },
          { token: 'type', foreground: 'fbbf24' },
          { token: 'operator', foreground: 'a78bfa' },
        ],
        colors: {
          'editor.background': '#0a0a0a',
          'editor.foreground': '#fafafa',
          'editor.lineHighlightBackground': '#121212',
          'editorLineNumber.foreground': '#a3a3a3',
          'editorLineNumber.activeForeground': '#d4d4d4',
          'editorCursor.foreground': '#60a5fa',
          'editor.selectionBackground': '#2563eb44',
          'editorGutter.background': '#121212',
        }
      });

      // Python light theme
      monaco.editor.defineTheme('python-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: '2563eb', fontStyle: 'bold' },
          { token: 'string', foreground: '059669' },
          { token: 'number', foreground: 'db2777' },
          { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' },
          { token: 'operator', foreground: '7c3aed' },
        ],
        colors: {
          'editor.background': '#ffffff',
          'editor.lineHighlightBackground': '#fafafa',
          'editorLineNumber.foreground': '#d4d4d4',
          'editorLineNumber.activeForeground': '#a3a3a3',
        }
      });

      // SQL dark theme
      monaco.editor.defineTheme('sql-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: '60a5fa', fontStyle: 'bold' },
          { token: 'string', foreground: '34d399' },
          { token: 'number', foreground: 'f472b6' },
          { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
          { token: 'operator', foreground: 'a78bfa' },
          { token: 'identifier', foreground: 'fafafa' },
          { token: 'type', foreground: 'fbbf24' },
        ],
        colors: {
          'editor.background': '#0a0a0a',
          'editor.foreground': '#fafafa',
          'editor.lineHighlightBackground': '#121212',
          'editor.selectionBackground': '#2563eb44',
          'editorLineNumber.foreground': '#a3a3a3',
          'editorLineNumber.activeForeground': '#d4d4d4',
          'editorGutter.background': '#121212',
        }
      });

      // SQL light theme
      monaco.editor.defineTheme('sql-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: '2563eb', fontStyle: 'bold' },
          { token: 'string', foreground: '059669' },
          { token: 'number', foreground: 'db2777' },
          { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' },
          { token: 'operator', foreground: '7c3aed' },
        ],
        colors: {
          'editor.background': '#ffffff',
          'editorLineNumber.foreground': '#d4d4d4',
          'editorLineNumber.activeForeground': '#a3a3a3',
        }
      });

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
