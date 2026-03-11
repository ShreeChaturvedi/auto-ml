/**
 * useLlmStreamState - Shared streaming state management for LLM chat interfaces.
 *
 * Extracts the duplicated token-appending, thinking-state, stream-event
 * dispatching, and message-ID ref management that was copy-pasted across
 * ChatPanel (notebook), useAgenticLoop, and usePlanningChat.
 *
 * Consumers call `handleStreamEvent(event)` inside their NDJSON stream
 * callback. The hook owns the `messages` array and exposes lower-level
 * primitives (`appendToken`, `appendThinking`, etc.) for callers that
 * need finer control.
 */

import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, LlmUsage } from '@/types/llmUi';
import type { LlmStreamEvent } from '@/lib/api/llm';
import {
  addAssistantTextMessage,
  addThinkingMessage,
  appendAssistantTextDelta,
  appendThinkingDelta,
  markAllThinkingMessagesComplete,
  markThinkingMessageComplete
} from '@/lib/llm/streamMessageUtils';

// ── Public types ────────────────────────────────────────────────────────

export interface LlmStreamState {
  /** Full chat message list (user, assistant_text, thinking, tool_call, error, ...). */
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;

  /** Whether a stream is currently in-flight. */
  isStreaming: boolean;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;

  /** Latest error string, if any. */
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  /** Accumulated usage payloads for the session. */
  sessionUsages: LlmUsage[];
  setSessionUsages: React.Dispatch<React.SetStateAction<LlmUsage[]>>;

  /** ID of the assistant_text message currently being streamed. */
  activeTextMessageId: string | null;
  /** ID of the thinking message currently being streamed. */
  activeThinkingMessageId: string | null;

  // ── Stream primitives ──────────────────────────────────────────────

  /** Append a text token delta. Completes any active thinking block first. */
  appendToken: (token: string) => void;
  /** Append a thinking delta. Closes any active text stream first. */
  appendThinking: (text: string) => void;
  /** Mark the current thinking block as complete and clear its ref. */
  completeThinking: () => void;
  /** Close the current text stream (reset ref and active ID). */
  closeTextStream: () => void;

  /**
   * Process a single `LlmStreamEvent`.
   *
   * Handles: token, thinking, usage, error, done.
   * Returns `false` for event types it does NOT handle (envelope, ask_user,
   * plan_exit) so the caller can layer domain-specific logic on top.
   */
  handleStreamEvent: (event: LlmStreamEvent) => boolean;

  /** Reset all streaming refs (call after abort / stop). */
  resetStreamRefs: () => void;

  // ── Refs (for callers that need direct access) ─────────────────────

  currentThinkingIdRef: React.RefObject<string | null>;
  currentTextIdRef: React.RefObject<string | null>;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useLlmStreamState(): LlmStreamState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionUsages, setSessionUsages] = useState<LlmUsage[]>([]);
  const [activeTextMessageId, setActiveTextMessageId] = useState<string | null>(null);
  const [activeThinkingMessageId, setActiveThinkingMessageId] = useState<string | null>(null);

  const currentThinkingIdRef = useRef<string | null>(null);
  const currentTextIdRef = useRef<string | null>(null);

  // ── Primitives ─────────────────────────────────────────────────────

  const completeThinking = useCallback(() => {
    const thinkingId = currentThinkingIdRef.current;
    if (!thinkingId) return;
    setMessages((prev) => markThinkingMessageComplete(prev, thinkingId));
    currentThinkingIdRef.current = null;
    setActiveThinkingMessageId(null);
  }, []);

  const closeTextStream = useCallback(() => {
    currentTextIdRef.current = null;
    setActiveTextMessageId(null);
  }, []);

  const appendToken = useCallback(
    (token: string) => {
      completeThinking();
      if (!currentTextIdRef.current) {
        const id = `text-${Date.now()}`;
        currentTextIdRef.current = id;
        setActiveTextMessageId(id);
        setMessages((prev) => addAssistantTextMessage(prev, id, token));
      } else {
        const targetId = currentTextIdRef.current;
        setMessages((prev) => appendAssistantTextDelta(prev, targetId, token));
      }
    },
    [completeThinking]
  );

  const appendThinking = useCallback(
    (text: string) => {
      closeTextStream();
      if (!currentThinkingIdRef.current) {
        const id = `thinking-${Date.now()}`;
        currentThinkingIdRef.current = id;
        setActiveThinkingMessageId(id);
        setMessages((prev) => addThinkingMessage(prev, id, text, Date.now()));
      } else {
        const targetId = currentThinkingIdRef.current;
        setMessages((prev) => appendThinkingDelta(prev, targetId, text));
      }
    },
    [closeTextStream]
  );

  const resetStreamRefs = useCallback(() => {
    currentThinkingIdRef.current = null;
    currentTextIdRef.current = null;
    setActiveThinkingMessageId(null);
    setActiveTextMessageId(null);
  }, []);

  // ── Event dispatcher ───────────────────────────────────────────────

  const handleStreamEvent = useCallback(
    (event: LlmStreamEvent): boolean => {
      if (event.type === 'token') {
        appendToken(event.text);
        return true;
      }

      if (event.type === 'thinking') {
        appendThinking(event.text);
        return true;
      }

      if (event.type === 'usage') {
        setSessionUsages((prev) => [...prev, event.usage as LlmUsage]);
        return true;
      }

      if (event.type === 'error') {
        setError(event.message);
        setMessages((prev) => [
          ...prev,
          { id: `error-${Date.now()}`, type: 'error', message: event.message }
        ]);
        completeThinking();
        closeTextStream();
        setIsStreaming(false);
        return true;
      }

      if (event.type === 'done') {
        setMessages(markAllThinkingMessagesComplete);
        completeThinking();
        closeTextStream();
        setIsStreaming(false);
        return true;
      }

      // envelope, ask_user, plan_exit — caller handles these
      return false;
    },
    [appendToken, appendThinking, completeThinking, closeTextStream]
  );

  return {
    messages,
    setMessages,
    isStreaming,
    setIsStreaming,
    error,
    setError,
    sessionUsages,
    setSessionUsages,
    activeTextMessageId,
    activeThinkingMessageId,
    appendToken,
    appendThinking,
    completeThinking,
    closeTextStream,
    handleStreamEvent,
    resetStreamRefs,
    currentThinkingIdRef,
    currentTextIdRef
  };
}
