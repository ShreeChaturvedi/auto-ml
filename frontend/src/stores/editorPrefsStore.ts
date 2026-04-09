/**
 * Persisted store for Monaco editor preferences, shared across all editor
 * instances in the application (notebook cells, NL editor, SQL editor, etc.).
 *
 * Preferences survive page refreshes and tab navigation. Individual setters
 * validate inputs — clamping numbers, rejecting unknown enum values — so the
 * persisted store always holds canonical data regardless of how callers write.
 *
 * Use `useEditorMonacoOptions()` to consume a spread-ready options object for
 * any Monaco `IStandaloneCodeEditor` instance.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

const VALID_FONT_FAMILIES = ['Monaspace Neon', 'JetBrains Mono'] as const;
const VALID_TAB_SIZES = [2, 4, 8] as const;

type FontFamily = (typeof VALID_FONT_FAMILIES)[number];
type TabSize = (typeof VALID_TAB_SIZES)[number];

export interface EditorPrefsState {
  fontSize: number;
  fontFamily: FontFamily;
  lineNumbers: boolean;
  minimap: boolean;
  wordWrap: boolean;
  autosaveDelay: number;
  tabSize: TabSize;
  smoothCursor: boolean;
}

type EditorMonacoPrefState = Pick<
  EditorPrefsState,
  'fontSize' | 'fontFamily' | 'lineNumbers' | 'minimap' | 'wordWrap' | 'tabSize' | 'smoothCursor'
>;

interface EditorPrefsStore extends EditorPrefsState {
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setLineNumbers: (enabled: boolean) => void;
  setMinimap: (enabled: boolean) => void;
  setWordWrap: (enabled: boolean) => void;
  setAutosaveDelay: (ms: number) => void;
  setTabSize: (size: number) => void;
  setSmoothCursor: (enabled: boolean) => void;
}

const DEFAULTS: EditorPrefsState = {
  fontSize: 13,
  fontFamily: 'Monaspace Neon',
  lineNumbers: true,
  minimap: false,
  wordWrap: true,
  autosaveDelay: 1000,
  tabSize: 4,
  smoothCursor: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const useEditorPrefsStore = create<EditorPrefsStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setFontSize: (size) => set((state) => {
        const next = clamp(Math.round(size), 10, 24);
        if (state.fontSize === next) return state;
        return { ...state, fontSize: next };
      }),

      setFontFamily: (family) => set((state) => {
        const next = (VALID_FONT_FAMILIES as readonly string[]).includes(family)
          ? (family as FontFamily)
          : DEFAULTS.fontFamily;
        if (state.fontFamily === next) return state;
        return { ...state, fontFamily: next };
      }),

      setLineNumbers: (enabled) => set((state) => {
        if (state.lineNumbers === enabled) return state;
        return { ...state, lineNumbers: enabled };
      }),

      setMinimap: (enabled) => set((state) => {
        if (state.minimap === enabled) return state;
        return { ...state, minimap: enabled };
      }),

      setWordWrap: (enabled) => set((state) => {
        if (state.wordWrap === enabled) return state;
        return { ...state, wordWrap: enabled };
      }),

      setAutosaveDelay: (ms) => set((state) => {
        const next = clamp(Math.round(ms), 200, 5000);
        if (state.autosaveDelay === next) return state;
        return { ...state, autosaveDelay: next };
      }),

      setTabSize: (size) => set((state) => {
        const next = (VALID_TAB_SIZES as readonly number[]).includes(size)
          ? (size as TabSize)
          : DEFAULTS.tabSize;
        if (state.tabSize === next) return state;
        return { ...state, tabSize: next };
      }),

      setSmoothCursor: (enabled) => set((state) => {
        if (state.smoothCursor === enabled) return state;
        return { ...state, smoothCursor: enabled };
      }),
    }),
    {
      name: 'automl-editor-prefs-v1',
      version: 1,
      partialize: (state): EditorPrefsState => ({
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        lineNumbers: state.lineNumbers,
        minimap: state.minimap,
        wordWrap: state.wordWrap,
        autosaveDelay: state.autosaveDelay,
        tabSize: state.tabSize,
        smoothCursor: state.smoothCursor,
      }),
      // Normalize at hydration time so stale persisted values never corrupt
      // the running store (e.g. an old fontFamily string that's no longer in
      // the allowed list, or a tabSize that slipped out of the enum).
      onRehydrateStorage: () => (rehydrated) => {
        if (!rehydrated) return;
        if (!(VALID_FONT_FAMILIES as readonly string[]).includes(rehydrated.fontFamily)) {
          rehydrated.fontFamily = DEFAULTS.fontFamily;
        }
        if (!(VALID_TAB_SIZES as readonly number[]).includes(rehydrated.tabSize)) {
          rehydrated.tabSize = DEFAULTS.tabSize;
        }
        rehydrated.fontSize = clamp(rehydrated.fontSize, 10, 24);
        rehydrated.autosaveDelay = clamp(rehydrated.autosaveDelay, 200, 5000);
      },
    }
  )
);

function getEditorMonacoPrefState(state: EditorPrefsState): EditorMonacoPrefState {
  return {
    fontSize: state.fontSize,
    fontFamily: state.fontFamily,
    lineNumbers: state.lineNumbers,
    minimap: state.minimap,
    wordWrap: state.wordWrap,
    tabSize: state.tabSize,
    smoothCursor: state.smoothCursor,
  };
}

/**
 * Returns a Monaco-compatible options object derived from the given editor
 * preferences state. Spread directly into a Monaco editor's `options` prop or
 * `updateOptions()` call.
 *
 * @example
 * const opts = useEditorMonacoOptions();
 * <MonacoEditor options={opts} />
 */
export function getEditorMonacoOptions(state: EditorPrefsState) {
  return {
    fontSize: state.fontSize,
    fontFamily: `'${state.fontFamily}', monospace`,
    lineNumbers: state.lineNumbers ? 'on' as const : 'off' as const,
    minimap: { enabled: state.minimap },
    wordWrap: state.wordWrap ? 'on' as const : 'off' as const,
    tabSize: state.tabSize,
    cursorBlinking: state.smoothCursor ? 'smooth' as const : 'blink' as const,
    cursorSmoothCaretAnimation: state.smoothCursor ? 'on' as const : 'off' as const,
  };
}

export function useEditorMonacoOptions() {
  const editorPrefs = useEditorPrefsStore(useShallow(getEditorMonacoPrefState));

  return useMemo(() => getEditorMonacoOptions(editorPrefs), [editorPrefs]);
}
