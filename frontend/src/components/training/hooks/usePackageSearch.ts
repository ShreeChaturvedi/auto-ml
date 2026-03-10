/**
 * usePackageSearch - Keyboard-navigable combobox state machine for PyPI package search
 */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { searchPackages, type PackageInfo } from '@/lib/api/execution';

export interface UsePackageSearchOptions {
  /** Whether the parent context (e.g. outer dialog) is open */
  enabled: boolean;
  onSelect: (pkg: PackageInfo) => void;
}

export interface UsePackageSearchReturn {
  packageInput: string;
  setPackageInput: (value: string) => void;
  packageSuggestions: PackageInfo[];
  suggestionsOpen: boolean;
  setSuggestionsOpen: (open: boolean) => void;
  suggestionsLoading: boolean;
  activeSuggestionIndex: number;
  setActiveSuggestionIndex: (index: number) => void;
  suggestionsListId: string;
  handlePackageFocus: () => void;
  handlePackageBlur: () => void;
  handlePackageKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  reset: () => void;
}

export function usePackageSearch({
  enabled,
  onSelect
}: UsePackageSearchOptions): UsePackageSearchReturn {
  const [packageInput, setPackageInput] = useState('');
  const [packageSuggestions, setPackageSuggestions] = useState<PackageInfo[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const suggestionsListId = useId();
  const blurTimeoutRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  // Clean up blur timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  // Reset state when disabled (outer dialog closes)
  useEffect(() => {
    if (!enabled) {
      setSuggestionsOpen(false);
      setPackageSuggestions([]);
      setActiveSuggestionIndex(-1);
      setPackageInput('');
    }
  }, [enabled]);

  // Debounced package search
  useEffect(() => {
    if (!enabled || !suggestionsOpen) return;

    const currentRequestId = ++requestIdRef.current;
    const query = packageInput.trim();

    const timeout = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const suggestions = await searchPackages(query, 8);
        if (currentRequestId !== requestIdRef.current) return;
        setPackageSuggestions(suggestions);
        setActiveSuggestionIndex(-1);
      } catch {
        if (currentRequestId !== requestIdRef.current) return;
        setPackageSuggestions([]);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setSuggestionsLoading(false);
        }
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [enabled, packageInput, suggestionsOpen]);

  const handlePackageFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setSuggestionsOpen(true);
  }, []);

  const handlePackageBlur = useCallback(() => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
    }, 150);
  }, []);

  const handlePackageKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!suggestionsOpen || packageSuggestions.length === 0) {
        if (event.key === 'ArrowDown') setSuggestionsOpen(true);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveSuggestionIndex((prev) => Math.min(prev + 1, packageSuggestions.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
        event.preventDefault();
        const selection = packageSuggestions[activeSuggestionIndex];
        if (selection) onSelect(selection);
      }

      if (event.key === 'Escape') {
        setSuggestionsOpen(false);
        setActiveSuggestionIndex(-1);
      }
    },
    [activeSuggestionIndex, onSelect, packageSuggestions, suggestionsOpen]
  );

  const reset = useCallback(() => {
    setPackageInput('');
    setPackageSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
  }, []);

  return {
    packageInput,
    setPackageInput,
    packageSuggestions,
    suggestionsOpen,
    setSuggestionsOpen,
    suggestionsLoading,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    suggestionsListId,
    handlePackageFocus,
    handlePackageBlur,
    handlePackageKeyDown,
    reset
  };
}
