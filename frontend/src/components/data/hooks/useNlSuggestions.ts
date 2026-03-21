/**
 * useNlSuggestions - Filters and manages NL query suggestions
 * for the NlQueryWorkflow autocomplete dropdown.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { NlSuggestion } from '@/lib/api/query';

const MAX_VISIBLE_SUGGESTIONS = 6;

interface UseNlSuggestionsOptions {
  suggestions: NlSuggestion[];
  englishQuery: string;
  isIdle: boolean;
  onQueryChange: (value: string) => void;
}

export function useNlSuggestions({
  suggestions,
  englishQuery,
  isIdle,
  onQueryChange,
}: UseNlSuggestionsOptions) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const filteredSuggestions = useMemo(() => {
    const input = englishQuery.trim().toLowerCase();
    const matchingSuggestions = input
      ? suggestions.filter((suggestion) => (
          suggestion.prompt.toLowerCase().includes(input)
          || suggestion.label.toLowerCase().includes(input)
          || suggestion.category.toLowerCase().includes(input)
        ))
      : suggestions;

    return matchingSuggestions.slice(0, MAX_VISIBLE_SUGGESTIONS);
  }, [englishQuery, suggestions]);

  const placeholderPrompts = useMemo(
    () => suggestions
      .map((suggestion) => suggestion.prompt.trim())
      .filter((prompt) => prompt.length > 0),
    [suggestions]
  );

  useEffect(() => {
    if (activeSuggestionIndex >= filteredSuggestions.length) {
      setActiveSuggestionIndex(0);
    }
  }, [activeSuggestionIndex, filteredSuggestions.length]);

  const applySuggestion = useCallback((suggestion: NlSuggestion) => {
    onQueryChange(suggestion.prompt);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [onQueryChange]);

  const openSuggestions = useCallback(() => {
    if (isIdle && filteredSuggestions.length > 0) {
      setSuggestionsOpen(true);
    }
  }, [isIdle, filteredSuggestions.length]);

  const closeSuggestionsDelayed = useCallback(() => {
    window.setTimeout(() => setSuggestionsOpen(false), 120);
  }, []);

  const handleInputChange = useCallback(() => {
    setSuggestionsOpen(true);
    setActiveSuggestionIndex(0);
  }, []);

  return {
    textareaRef,
    filteredSuggestions,
    placeholderPrompts,
    suggestionsOpen,
    setSuggestionsOpen,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    applySuggestion,
    openSuggestions,
    closeSuggestionsDelayed,
    handleInputChange,
  };
}
