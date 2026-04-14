import type { SyntaxPalette } from './syntaxPalette';

export interface EditorChromeColors {
  background: string;
  foreground: string;
  lineNumber: string;
  activeLineNumber: string;
  gutterBackground: string;
}

export function getEditorChromeColors(isDark: boolean): EditorChromeColors {
  return {
    background: isDark ? '#0a0a0a' : '#ffffff',
    foreground: isDark ? '#fafafa' : '#1f2328',
    lineNumber: isDark ? '#a3a3a3' : '#d4d4d4',
    activeLineNumber: isDark ? '#d4d4d4' : '#a3a3a3',
    gutterBackground: isDark ? '#0a0a0a' : '#ffffff',
  };
}

export function buildEditorColors(palette: SyntaxPalette, isDark: boolean): Record<string, string> {
  const chrome = getEditorChromeColors(isDark);

  return {
    'editor.background': chrome.background,
    'editor.foreground': chrome.foreground,
    'editor.lineHighlightBackground': palette.lineHighlight,
    'editorLineNumber.foreground': chrome.lineNumber,
    'editorLineNumber.activeForeground': chrome.activeLineNumber,
    'editorCursor.foreground': palette.cursor,
    'editor.selectionBackground': palette.selectionBg,
    'editorGutter.background': chrome.gutterBackground,
  };
}
