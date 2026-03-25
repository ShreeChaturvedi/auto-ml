import { useCallback, useEffect, useRef, useState } from 'react';

interface UseDebouncedSaveOptions {
  externalContent: string;
  onContentChange: (content: string) => void;
  delay?: number;
}

interface UseDebouncedSaveReturn {
  localContent: string;
  setLocalContent: React.Dispatch<React.SetStateAction<string>>;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: React.Dispatch<React.SetStateAction<boolean>>;
  localContentRef: React.MutableRefObject<string>;
  hasUnsavedChangesRef: React.MutableRefObject<boolean>;
  handleContentChange: (value: string | undefined) => void;
  handleFlushSave: () => void;
}

export function useDebouncedSave({
  externalContent,
  onContentChange,
  delay = 1000
}: UseDebouncedSaveOptions): UseDebouncedSaveReturn {
  const [localContent, setLocalContent] = useState(externalContent);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const localContentRef = useRef(localContent);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Ref synchronization ---
  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // --- External content synchronization ---
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setLocalContent(externalContent);
    }
  }, [externalContent, hasUnsavedChanges]);

  // --- Debounced content change handler ---
  const handleContentChange = useCallback(
    (value: string | undefined) => {
      const content = value ?? '';
      setLocalContent(content);
      setHasUnsavedChanges(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        onContentChange(content);
        setHasUnsavedChanges(false);
      }, delay);
    },
    [onContentChange, delay]
  );

  // --- Flush pending save ---
  const handleFlushSave = useCallback(() => {
    if (!hasUnsavedChangesRef.current) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    const content = localContentRef.current.trim() === '' ? '' : localContentRef.current;
    onContentChange(content);
    setHasUnsavedChanges(false);
  }, [onContentChange]);

  // --- Cleanup ---
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    localContent,
    setLocalContent,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    localContentRef,
    hasUnsavedChangesRef,
    handleContentChange,
    handleFlushSave
  };
}
