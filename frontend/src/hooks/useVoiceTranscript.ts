import { useCallback, useRef } from 'react';

import type { VoiceTranscriptEvent } from '@/hooks/useVoiceInput';

interface UseVoiceTranscriptOptions {
  getValue: () => string;
  getCursorOffset: () => number;
  applyValue: (value: string, cursorOffset: number, animateRange?: { start: number; end: number }) => void;
}

interface TranscriptItem {
  text: string;
  isComplete: boolean;
}

const WORD_PATTERN = /\b[\w']+\b/g;
const MAX_OVERLAP_WORDS = 4;

function normalizeSegment(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function trimLeadingOverlap(previous: string, next: string): string {
  const previousMatches = Array.from(previous.matchAll(WORD_PATTERN));
  const nextMatches = Array.from(next.matchAll(WORD_PATTERN));

  if (previousMatches.length === 0 || nextMatches.length === 0) {
    return next;
  }

  const maxOverlap = Math.min(MAX_OVERLAP_WORDS, previousMatches.length, nextMatches.length);

  for (let size = maxOverlap; size >= 1; size -= 1) {
    const previousSlice = previousMatches
      .slice(previousMatches.length - size)
      .map((match) => match[0].toLowerCase());
    const nextSlice = nextMatches
      .slice(0, size)
      .map((match) => match[0].toLowerCase());

    if (previousSlice.join(' ') !== nextSlice.join(' ')) {
      continue;
    }

    const overlapEnd = (nextMatches[size - 1].index ?? 0) + nextMatches[size - 1][0].length;
    return next.slice(overlapEnd).replace(/^\s+/, '');
  }

  return next;
}

function joinSegments(previous: string, next: string): string {
  if (!previous) {
    return next;
  }

  if (!next) {
    return previous;
  }

  const deDuplicatedNext = trimLeadingOverlap(previous, next);

  if (!deDuplicatedNext) {
    return previous;
  }

  if (/^[,.;:!?)}\]]/.test(deDuplicatedNext) || /['']/.test(deDuplicatedNext[0] ?? '')) {
    return `${previous}${deDuplicatedNext}`;
  }

  if (/\s$/.test(previous) || /^\s/.test(deDuplicatedNext)) {
    return `${previous}${deDuplicatedNext}`;
  }

  return `${previous} ${deDuplicatedNext}`;
}

export function useVoiceTranscript({
  getValue,
  getCursorOffset,
  applyValue,
}: UseVoiceTranscriptOptions) {
  const anchorRef = useRef(0);
  const renderedLengthRef = useRef(0);
  const itemsRef = useRef(new Map<string, TranscriptItem>());
  const itemOrderRef = useRef<string[]>([]);

  const resetSession = useCallback(() => {
    itemsRef.current.clear();
    itemOrderRef.current = [];
    renderedLengthRef.current = 0;
  }, []);

  const buildTranscript = useCallback(() => {
    let transcript = '';

    for (const itemId of itemOrderRef.current) {
      const item = itemsRef.current.get(itemId);
      if (!item || !item.isComplete) {
        continue;
      }

      const segment = normalizeSegment(item?.text ?? '');
      if (!segment) {
        continue;
      }

      transcript = joinSegments(transcript, segment);
    }

    return transcript;
  }, []);

  const renderTranscript = useCallback(() => {
    const currentValue = getValue();
    const transcript = buildTranscript();
    const before = currentValue.slice(0, anchorRef.current);
    const after = currentValue.slice(anchorRef.current + renderedLengthRef.current);
    const nextValue = `${before}${transcript}${after}`;

    const oldRenderedLength = renderedLengthRef.current;
    renderedLengthRef.current = transcript.length;

    const animStart = anchorRef.current + oldRenderedLength;
    const animEnd = anchorRef.current + transcript.length;
    const animateRange = animEnd > animStart ? { start: animStart, end: animEnd } : undefined;

    applyValue(nextValue, anchorRef.current + transcript.length, animateRange);
  }, [applyValue, buildTranscript, getValue]);

  const ensureItem = useCallback((itemId: string, previousItemId?: string | null) => {
    if (!itemsRef.current.has(itemId)) {
      itemsRef.current.set(itemId, { text: '', isComplete: false });
    }

    if (itemOrderRef.current.includes(itemId)) {
      return;
    }

    if (previousItemId) {
      const previousIndex = itemOrderRef.current.indexOf(previousItemId);
      if (previousIndex !== -1) {
        itemOrderRef.current.splice(previousIndex + 1, 0, itemId);
        return;
      }
    }

    itemOrderRef.current.push(itemId);
  }, []);

  const startSession = useCallback(() => {
    resetSession();
    anchorRef.current = Math.min(getCursorOffset(), getValue().length);
  }, [getCursorOffset, getValue, resetSession]);

  const stopSession = useCallback(() => {
    resetSession();
  }, [resetSession]);

  const handleTranscriptEvent = useCallback((event: VoiceTranscriptEvent) => {
    switch (event.type) {
      case 'committed':
        ensureItem(event.itemId, event.previousItemId);
        return;
      case 'delta': {
        ensureItem(event.itemId);
        const item = itemsRef.current.get(event.itemId);
        if (!item || item.isComplete) {
          return;
        }

        item.text += event.delta;
        return;
      }
      case 'completed': {
        ensureItem(event.itemId);
        const item = itemsRef.current.get(event.itemId);
        if (!item) {
          return;
        }

        item.text = event.transcript;
        item.isComplete = true;
        renderTranscript();
        return;
      }
    }
  }, [ensureItem, renderTranscript]);

  return {
    handleTranscriptEvent,
    startSession,
    stopSession,
  };
}
