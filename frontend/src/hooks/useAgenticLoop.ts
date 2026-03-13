import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatMessage, ToolCall, UiSchema } from '@/types/llmUi';
import type { LlmStreamEvent } from '@/lib/api/llm';
import type { BuildRequestOptions, DomainAdapter } from '@/types/agentic';
import { markAllThinkingMessagesComplete } from '@/lib/llm/streamMessageUtils';
import { useLlmStreamState } from '@/hooks/useLlmStreamState';
import { useToolExecution, mergeToolCalls } from '@/hooks/useToolExecution';

export interface UseAgenticLoopOptions {
  projectId?: string;
  storageKey?: string;
  sessionVersion?: number;
  domainAdapter: DomainAdapter;
  domainLockReason?: string;
}

export function useAgenticLoop({
  projectId,
  storageKey,
  sessionVersion = 0,
  domainAdapter,
  domainLockReason
}: UseAgenticLoopOptions) {
  const stream = useLlmStreamState();
  const {
    messages, setMessages,
    isStreaming, setIsStreaming,
    error, setError,
    sessionUsages,
    activeTextMessageId, activeThinkingMessageId,
    handleStreamEvent, resetStreamRefs,
    completeThinking, closeTextStream,
    appendToken,
    currentTextIdRef,
  } = stream;

  const [hydratedMessageIds, setHydratedMessageIds] = useState<Set<string>>(new Set());
  const [uiSchema, setUiSchema] = useState<UiSchema | null>(null);

  const activeRequestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const skipPersistOnceRef = useRef(false);

  const { toolHistoryRef, resetToolHistory, executePending } = useToolExecution(projectId);

  const messageStorageScope = storageKey && projectId
    ? `${storageKey}-${projectId}`
    : null;

  // Reset session state and hydrate messages whenever tab/session scope changes.
  useEffect(() => {
    skipPersistOnceRef.current = true;
    activeRequestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    resetStreamRefs();
    resetToolHistory();
    setIsStreaming(false);
    setError(null);
    setUiSchema(null);
    setHydratedMessageIds(new Set());

    if (!messageStorageScope) {
      setMessages([]);
      return;
    }

    const stored = localStorage.getItem(messageStorageScope);
    if (!stored) {
      setMessages([]);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as ChatMessage[];
      setMessages(parsed);
      setHydratedMessageIds(new Set(parsed.map((message) => message.id)));
    } catch {
      setMessages([]);
      setHydratedMessageIds(new Set());
    }
  }, [messageStorageScope, sessionVersion, resetStreamRefs, resetToolHistory, setIsStreaming, setError, setMessages]);

  useEffect(() => {
    if (!messageStorageScope) return;
    if (skipPersistOnceRef.current) {
      skipPersistOnceRef.current = false;
      return;
    }
    if (messages.length === 0) {
      localStorage.removeItem(messageStorageScope);
      return;
    }
    localStorage.setItem(messageStorageScope, JSON.stringify(messages));
  }, [messageStorageScope, messages]);

  const handleStop = useCallback(() => {
    activeRequestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    domainAdapter.onStop?.('Stopped by user.');
    setMessages(markAllThinkingMessagesComplete);
    completeThinking();
    closeTextStream();
    resetStreamRefs();
  }, [domainAdapter, setIsStreaming, completeThinking, closeTextStream, resetStreamRefs, setMessages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    stream.setSessionUsages([]);
    resetToolHistory();
    setUiSchema(null);
    setHydratedMessageIds(new Set());
    resetStreamRefs();
    if (messageStorageScope) {
      localStorage.removeItem(messageStorageScope);
    }
  }, [messageStorageScope, setMessages, stream, resetToolHistory, resetStreamRefs]);

  const runLoop = useCallback(async (
    prompt: string,
    requestOptions: BuildRequestOptions,
    toolResultsOverride?: import('@/types/llmUi').ToolResult[],
    toolCallsOverride?: ToolCall[]
  ) => {
    if (domainLockReason) {
      setError(domainLockReason);
      return;
    }

    abortRef.current?.abort();
    const requestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    completeThinking();
    closeTextStream();

    const isRestream = Boolean(toolResultsOverride?.length);

    if (!isRestream) {
      if (!domainAdapter.preserveToolHistoryBetweenPrompts) {
        resetToolHistory();
      }
      setUiSchema(null);

      if (prompt.trim()) {
        const userChatMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          type: 'user',
          content: prompt,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, userChatMessage]);
      }
    }

    setError(null);
    setIsStreaming(true);

    try {
      await domainAdapter.buildRequest(
        prompt,
        toolCallsOverride?.length ? toolCallsOverride : undefined,
        toolResultsOverride?.length ? toolResultsOverride : undefined,
        (rawEvent: unknown) => {
          const event = rawEvent as LlmStreamEvent;
          if (requestId !== activeRequestIdRef.current) return;

          // Let the shared hook handle token, thinking, usage, error, done
          const handled = handleStreamEvent(event);
          if (handled) {
            // For error events, also fire the domain adapter callback
            if (event.type === 'error') {
              domainAdapter.onStreamError?.(event.message);
            }
            return;
          }

          // Domain-specific: envelope handling
          if (event.type === 'envelope') {
            completeThinking();
            if (event.envelope.controller) {
              domainAdapter.onControllerUpdate?.(event.envelope.controller);
            }

            if (event.envelope.tool_calls?.length) {
              closeTextStream();
              const preparedToolCalls = domainAdapter.prepareToolCalls
                ? domainAdapter.prepareToolCalls(event.envelope.tool_calls)
                : event.envelope.tool_calls;

              toolHistoryRef.current.calls = mergeToolCalls(
                toolHistoryRef.current.calls,
                preparedToolCalls
              );

              for (const call of preparedToolCalls) {
                setMessages((prev) => [...prev, { id: `tool-${call.id}`, type: 'tool_call', call }]);
                domainAdapter.toolRegistry[call.tool]?.onCall?.(call);
              }

              const toolCalls = preparedToolCalls;
              executePending(
                toolCalls,
                requestId,
                activeRequestIdRef,
                setMessages,
                domainAdapter
              ).then((result) => {
                if (!result) return;
                if (result.shouldPause) {
                  setIsStreaming(false);
                  return;
                }
                setTimeout(() => {
                  if (requestId !== activeRequestIdRef.current) return;
                  void runLoop(prompt, requestOptions, result.results, toolHistoryRef.current.calls);
                }, 100);
              }).catch(() => {
                // Error already handled inside executePending
              });
            }
            if (event.envelope.ui) {
              setUiSchema(event.envelope.ui);
              const id = `ui-${Date.now()}`;
              setMessages((prev) => [...prev, { id, type: 'ui', schema: event.envelope.ui! }]);
            }
            if (event.envelope.message) {
              if (!currentTextIdRef.current && event.envelope.message.trim()) {
                appendToken(event.envelope.message);
              }
            }
          }
        },
        controller.signal,
        {
          ...requestOptions,
          continuation: isRestream
        }
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (requestId !== activeRequestIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to execute loop.';
      setError(message);
      domainAdapter.onStreamError?.(message);
      setIsStreaming(false);
      completeThinking();
      closeTextStream();
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [domainAdapter, domainLockReason, setError, setIsStreaming, setMessages, handleStreamEvent, completeThinking, closeTextStream, appendToken, currentTextIdRef, toolHistoryRef, executePending, resetToolHistory]);

  const editMessage = useCallback((msgId: string, newContent: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex(m => m.id === msgId);
      if (idx === -1) return prev;
      const newMessages = prev.slice(0, idx);
      newMessages.push({ ...prev[idx], content: newContent } as ChatMessage);
      return newMessages;
    });
  }, [setMessages]);

  return {
    messages,
    setMessages,
    isGenerating: isStreaming,
    error,
    uiSchema,
    sessionUsages,
    activeTextMessageId,
    activeThinkingMessageId,
    hydratedMessageIds,
    runLoop,
    handleStop,
    clearMessages,
    editMessage
  };
}
