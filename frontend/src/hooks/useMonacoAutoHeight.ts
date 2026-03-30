import { useState, useCallback } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';

export const MIN_EDITOR_HEIGHT = 60;

export function useMonacoAutoHeight(minHeight = MIN_EDITOR_HEIGHT) {
  const [height, setHeight] = useState(minHeight);

  const attachAutoHeight = useCallback(
    (editor: MonacoEditor.IStandaloneCodeEditor) => {
      editor.onDidContentSizeChange((e) => {
        if (!e.contentHeightChanged) return;
        setHeight(Math.max(minHeight, editor.getContentHeight()));
      });
      setHeight(Math.max(minHeight, editor.getContentHeight()));
    },
    [minHeight]
  );

  return { editorHeight: height, attachAutoHeight } as const;
}
