import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorMonacoOptions, useEditorPrefsStore } from '../editorPrefsStore';

describe('useEditorMonacoOptions', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorPrefsStore.setState({
      fontSize: 13,
      fontFamily: 'Monaspace Neon',
      lineNumbers: true,
      minimap: false,
      wordWrap: true,
      autosaveDelay: 1000,
      tabSize: 4,
      smoothCursor: false,
    });
  });

  it('keeps the same snapshot when only unrelated editor prefs change', () => {
    const { result } = renderHook(() => useEditorMonacoOptions());
    const initialOptions = result.current;

    act(() => {
      useEditorPrefsStore.getState().setAutosaveDelay(1500);
    });

    expect(result.current).toBe(initialOptions);
  });

  it('returns a new snapshot after a Monaco option changes', () => {
    const { result } = renderHook(() => useEditorMonacoOptions());
    const initialOptions = result.current;

    act(() => {
      useEditorPrefsStore.getState().setFontSize(16);
    });

    expect(result.current).not.toBe(initialOptions);
    expect(result.current.fontSize).toBe(16);
  });
});
