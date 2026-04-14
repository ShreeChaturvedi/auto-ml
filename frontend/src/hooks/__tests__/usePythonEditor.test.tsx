import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePythonEditor } from '../usePythonEditor';

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark' })
}));

vi.mock('@/hooks/useResolvedEditorTheme', () => ({
  useResolvedEditorTheme: () => 'dark'
}));

vi.mock('@/hooks/useProjectThemeColor', () => ({
  useProjectThemeColor: () => ({ syntaxThemeId: 'adaptive-dark' })
}));

vi.mock('@/lib/monaco/preloader', () => ({
  initMonaco: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@/lib/monaco/completionProvider', () => ({
  registerPythonCompletionProvider: vi.fn(),
  setCurrentProjectId: vi.fn()
}));

vi.mock('@/lib/monaco/notebookContext', () => ({
  registerModelCellId: vi.fn(),
  unregisterModelCellId: vi.fn()
}));

vi.mock('@/lib/monaco/pythonProviders', () => ({
  attachDiagnostics: vi.fn(() => ({ dispose: vi.fn() }))
}));

describe('usePythonEditor', () => {
  it('does not flush an empty string when blur fires after Monaco disposes the model', () => {
    vi.useFakeTimers();

    const onContentChange = vi.fn();
    let blurHandler: (() => void) | null = null;
    let modelAvailable = true;

    const model = {
      uri: { toString: () => 'file:///cell-1.py' },
      getValue: vi.fn(() => 'print("model")')
    };

    const editor = {
      onDidBlurEditorWidget: vi.fn((handler: () => void) => {
        blurHandler = handler;
        return { dispose: vi.fn() };
      }),
      getModel: vi.fn(() => (modelAvailable ? model : null)),
      addCommand: vi.fn()
    };

    const monaco = {
      editor: { setTheme: vi.fn() },
      KeyMod: { Shift: 1024 },
      KeyCode: { Enter: 3 }
    };

    const { result } = renderHook(() => usePythonEditor({
      content: 'print("original")',
      onContentChange,
      onRun: vi.fn(),
      completionOptions: { projectId: 'project-1', cellId: 'cell-1' }
    }));

    act(() => {
      result.current.handleEditorMount(editor as never, monaco as never);
      result.current.handleContentChange('print("edited")');
      modelAvailable = false;
    });

    act(() => {
      blurHandler?.();
    });

    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange).toHaveBeenCalledWith('print("edited")');

    vi.useRealTimers();
  });
});
