import { useState, useCallback, useMemo, type RefObject, type KeyboardEvent } from 'react';
import type { MentionInputHandle } from '@/components/llm/MentionInput';

export interface MentionCandidate {
  id: string;
  name: string;
  type: string;
  meta?: Record<string, unknown>;
}

export interface ResolvedMention {
  id: string;
  name: string;
  type: string;
  datasetId?: string;
  documentId?: string;
}

interface MentionAutocompleteOptions {
  candidates: MentionCandidate[];
  value: string;
  onValueChange: (value: string) => void;
  inputRef: RefObject<MentionInputHandle | null>;
  maxResults?: number;
}

interface MentionAutocompleteReturn {
  isOpen: boolean;
  query: string;
  filtered: MentionCandidate[];
  activeIndex: number;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => boolean;
  handleValueChange: (newValue: string, cursorPos?: number) => void;
  selectCandidate: (candidate: MentionCandidate) => void;
  dismiss: () => void;
  resolvedMentions: ResolvedMention[];
  removeMention: (name: string) => void;
}

/**
 * Detect an active @-mention query by scanning backwards from the cursor.
 * Returns the query substring (after @) or null if no trigger is active.
 *
 * Only triggers when typing contiguous filename-like chars (no spaces)
 * immediately after `@`.
 */
function detectMentionQuery(value: string, cursorPos: number): string | null {
  // Walk backwards from cursor to find the @ trigger
  let i = cursorPos - 1;
  while (i >= 0) {
    const ch = value[i];
    // Whitespace or newline breaks the mention query — stop searching
    if (ch === '\n' || ch === ' ' || ch === '\t') {
      // Check if the char right before the whitespace break is '@'
      // e.g. "@ " — the @ is at i-1... no, we already passed it.
      // If we hit whitespace, the query cannot span over it.
      return null;
    }
    if (ch === '@') {
      // @ must be at start of input or preceded by whitespace
      if (i === 0 || /\s/.test(value[i - 1])) {
        return value.slice(i + 1, cursorPos);
      }
      return null;
    }
    i--;
  }
  return null;
}

export function useMentionAutocomplete({
  candidates,
  value,
  onValueChange,
  inputRef,
  maxResults = 8
}: MentionAutocompleteOptions): MentionAutocompleteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!isOpen) return [];
    const q = query.toLowerCase();
    const matches = q
      ? candidates.filter((c) => c.name.toLowerCase().includes(q))
      : candidates;
    return matches.slice(0, maxResults);
  }, [isOpen, query, candidates, maxResults]);

  const dismiss = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const handleValueChange = useCallback(
    (newValue: string, cursorPos?: number) => {
      const pos = cursorPos ?? newValue.length;
      onValueChange(newValue);

      const q = detectMentionQuery(newValue, pos);
      if (q !== null) {
        // Don't re-open when cursor is right after an already-complete mention
        const isExactMatch = candidates.some(
          (c) => c.name.toLowerCase() === q.toLowerCase()
        );
        if (isExactMatch) {
          setIsOpen(false);
          setQuery('');
        } else {
          setIsOpen(true);
          setQuery(q);
          setActiveIndex(0);
        }
      } else {
        setIsOpen(false);
        setQuery('');
      }
    },
    [onValueChange, candidates]
  );

  const selectCandidate = useCallback(
    (candidate: MentionCandidate) => {
      const handle = inputRef.current;
      if (handle) {
        handle.insertMention(candidate.name);
      }
      dismiss();
    },
    [inputRef, dismiss]
  );

  /**
   * Handle keyboard events when the dropdown is open.
   * Returns true if the event was consumed (caller should not process further).
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): boolean => {
      if (!isOpen || filtered.length === 0) return false;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          event.stopPropagation();
          setActiveIndex((prev) => (prev + 1) % filtered.length);
          return true;

        case 'ArrowUp':
          event.preventDefault();
          event.stopPropagation();
          setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
          return true;

        case 'Enter':
        case 'Tab':
          event.preventDefault();
          event.stopPropagation();
          selectCandidate(filtered[activeIndex]);
          return true;

        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          dismiss();
          return true;

        default:
          return false;
      }
    },
    [isOpen, filtered, activeIndex, selectCandidate, dismiss]
  );

  /** Parse the current value for all @name tokens that match known candidates. */
  const resolvedMentions = useMemo<ResolvedMention[]>(() => {
    if (!value) return [];
    // Match @word sequences (filenames can contain dots, dashes, underscores)
    const mentionRegex = /@([\w.-]+(?:\s[\w.-]+)*)/g;
    const found: ResolvedMention[] = [];
    const seen = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(value)) !== null) {
      const name = match[1];
      const candidate = candidates.find(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      );
      if (candidate && !seen.has(candidate.id)) {
        seen.add(candidate.id);
        found.push({
          id: candidate.id,
          name: candidate.name,
          type: candidate.type,
          datasetId: candidate.meta?.datasetId as string | undefined,
          documentId: candidate.meta?.documentId as string | undefined
        });
      }
    }
    return found;
  }, [value, candidates]);

  const removeMention = useCallback(
    (name: string) => {
      // Remove @name from the value (with optional trailing space)
      const pattern = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?`, 'g');
      const newValue = value.replace(pattern, '');
      onValueChange(newValue);
      dismiss();
    },
    [value, onValueChange, dismiss]
  );

  return {
    isOpen,
    query,
    filtered,
    activeIndex,
    handleKeyDown,
    handleValueChange,
    selectCandidate,
    dismiss,
    resolvedMentions,
    removeMention
  };
}
