/**
 * useNlSuggestions - Fetches, filters, and manages NL query suggestions
 * for the NlQueryWorkflow autocomplete dropdown.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchNlSuggestions, type NlSuggestion } from '@/lib/api/query';

const MAX_VISIBLE_SUGGESTIONS = 6;

interface UseNlSuggestionsOptions {
  projectId?: string | null;
  englishQuery: string;
  isIdle: boolean;
  onQueryChange: (value: string) => void;
}

export function useNlSuggestions({
  projectId,
  englishQuery,
  isIdle,
  onQueryChange,
}: UseNlSuggestionsOptions) {
  const [nlSuggestions, setNlSuggestions] = useState<NlSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!projectId) {
      setNlSuggestions([]);
      return;
    }

    let cancelled = false;
    void fetchNlSuggestions(projectId, 8)
      .then((response) => {
        if (!cancelled) {
          setNlSuggestions(response.suggestions);
        }
      })
      .catch((error) => {
        console.error('Failed to load NL suggestions:', error);
        if (!cancelled) {
          setNlSuggestions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const filteredSuggestions = useMemo(() => {
    const input = englishQuery.trim().toLowerCase();
    const suggestions = input
      ? nlSuggestions.filter((suggestion) => (
          suggestion.prompt.toLowerCase().includes(input)
          || suggestion.label.toLowerCase().includes(input)
          || suggestion.category.toLowerCase().includes(input)
        ))
      : nlSuggestions;

    return suggestions.slice(0, MAX_VISIBLE_SUGGESTIONS);
  }, [englishQuery, nlSuggestions]);

  const placeholderPrompts = useMemo(
    () => nlSuggestions
      .map((suggestion) => suggestion.prompt.trim())
      .filter((prompt) => prompt.length > 0),
    [nlSuggestions]
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
