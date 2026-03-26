import { useCallback, useEffect, useRef, useState } from 'react';

interface UseMarkdownEditModeOptions {
  isLocked: boolean;
  handleFlushSave: () => void;
  setLocalContent: React.Dispatch<React.SetStateAction<string>>;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
  localContentRef: React.MutableRefObject<string>;
}

interface UseMarkdownEditModeReturn {
  isPreviewMode: boolean;
  chipInjectedRef: React.MutableRefObject<boolean>;
  isExitingRef: React.MutableRefObject<boolean>;
  exitEditModeRef: React.MutableRefObject<() => void>;
  handleFlushSaveRef: React.MutableRefObject<() => void>;
  enterEditMode: () => void;
  enterEditModeWithContent: (scaffold: string) => void;
  exitEditMode: () => void;
}

export function useMarkdownEditMode({
  isLocked,
  handleFlushSave,
  setLocalContent,
  setHasUnsavedChanges,
  localContentRef
}: UseMarkdownEditModeOptions): UseMarkdownEditModeReturn {
  const [isPreviewMode, setIsPreviewMode] = useState(true);
  const isExitingRef = useRef(false);
  const chipInjectedRef = useRef(false);
  const preChipContentRef = useRef('');

  // --- Edit mode transitions ---
  const enterEditMode = useCallback(() => {
    if (isLocked) return;
    chipInjectedRef.current = false;
    setIsPreviewMode(false);
  }, [isLocked]);

  const enterEditModeWithContent = useCallback(
    (scaffold: string) => {
      if (isLocked) return;
      preChipContentRef.current = localContentRef.current;
      chipInjectedRef.current = true;
      setLocalContent(scaffold);
      setHasUnsavedChanges(true);
      setIsPreviewMode(false);
    },
    [isLocked, setLocalContent, setHasUnsavedChanges, localContentRef]
  );

  const exitEditMode = useCallback(() => {
    isExitingRef.current = true;
    if (chipInjectedRef.current) {
      setLocalContent(preChipContentRef.current);
      setHasUnsavedChanges(false);
    } else {
      handleFlushSave();
    }
    chipInjectedRef.current = false;
    setIsPreviewMode(true);
  }, [handleFlushSave, setLocalContent, setHasUnsavedChanges]);

  // --- Refs for callbacks accessed in event handlers ---
  const exitEditModeRef = useRef(exitEditMode);
  useEffect(() => {
    exitEditModeRef.current = exitEditMode;
  }, [exitEditMode]);

  const handleFlushSaveRef = useRef(handleFlushSave);
  useEffect(() => {
    handleFlushSaveRef.current = handleFlushSave;
  }, [handleFlushSave]);

  return {
    isPreviewMode,
    chipInjectedRef,
    isExitingRef,
    exitEditModeRef,
    handleFlushSaveRef,
    enterEditMode,
    enterEditModeWithContent,
    exitEditMode
  };
}
