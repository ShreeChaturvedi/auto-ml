/**
 * useStreamingState
 *
 * Manages SSE connection lifecycle, request ID tracking, and AbortController
 * for agentic loop streaming operations. Handles request cancellation,
 * reconnection logic, and streaming state synchronization.
 */

import { useRef, useCallback } from 'react';
import type { ChatMessage, LlmUsage } from '@/types/llmUi';
import type { LlmStreamEvent } from '@/lib/api/llm';
import { useLlmStreamState } from '@/hooks/useLlmStreamState';

export interface UseStreamingStateReturn {
  // From useLlmStreamState delegation
  isStreaming: boolean;
  error: string | null;
  setIsStreaming: (value: boolean) => void;
  setError: (value: string | null) => void;
  sessionUsages: LlmUsage[];
  activeTextMessageId: string | null;
  activeThinkingMessageId: string | null;
  handleStreamEvent: (event: LlmStreamEvent) => boolean;
  resetStreamRefs: () => void;
  completeThinking: () => void;
  closeTextStream: () => void;
  appendToken: (token: string) => void;
  currentTextIdRef: React.RefObject<string | null>;

  // Request lifecycle
  activeRequestIdRef: React.MutableRefObject<number>;
  abortRef: React.MutableRefObject<AbortController | null>;

  // Lifecycle management
  startRequest: () => AbortController;
  cancelCurrentRequest: () => void;
  isRequestCurrent: (requestId: number) => boolean;
}

export function useStreamingState(
  setMessages?: React.Dispatch<React.SetStateAction<ChatMessage[]>>
): UseStreamingStateReturn {
  const stream = useLlmStreamState(setMessages);

  const activeRequestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const startRequest = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  }, []);

  const cancelCurrentRequest = useCallback(() => {
    activeRequestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const isRequestCurrent = useCallback((requestId: number) => {
    return requestId === activeRequestIdRef.current;
  }, []);

  return {
    // Delegate stream state
    isStreaming: stream.isStreaming,
    error: stream.error,
    setIsStreaming: stream.setIsStreaming,
    setError: stream.setError,
    sessionUsages: stream.sessionUsages,
    activeTextMessageId: stream.activeTextMessageId,
    activeThinkingMessageId: stream.activeThinkingMessageId,
    handleStreamEvent: stream.handleStreamEvent,
    resetStreamRefs: stream.resetStreamRefs,
    completeThinking: stream.completeThinking,
    closeTextStream: stream.closeTextStream,
    appendToken: stream.appendToken,
    currentTextIdRef: stream.currentTextIdRef,

    // Request lifecycle refs and helpers
    activeRequestIdRef,
    abortRef,
    startRequest,
    cancelCurrentRequest,
    isRequestCurrent
  };
}
