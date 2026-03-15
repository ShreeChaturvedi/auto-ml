import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatMessage, ToolCall, UiSchema } from '@/types/llmUi';
import type { BuildRequestOptions, DomainAdapter } from '@/types/agentic';
import { markAllThinkingMessagesComplete } from '@/lib/llm/streamMessageUtils';
import { useLlmStreamState } from '@/hooks/useLlmStreamState';
import { createAgenticEventHandler } from '@/hooks/agenticLoopEvents';
import { hydrateStoredMessages, persistStoredMessages } from '@/hooks/agenticLoopStorage';
import { applyBackendToolExecution } from '@/hooks/agenticToolMessages';
import { useToolExecution } from '@/hooks/useToolExecution';
import type { WorkflowState } from '@/types/workflow';
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

  const { toolHistoryRef, resetToolHistory } = useToolExecution();

  const messageStorageScope = storageKey && projectId
    ? `${storageKey}-${projectId}`
    : null;

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

    const hydrated = hydrateStoredMessages(messageStorageScope);
    setMessages(hydrated.messages);
    setHydratedMessageIds(hydrated.hydratedMessageIds);
  }, [messageStorageScope, sessionVersion, resetStreamRefs, resetToolHistory, setIsStreaming, setError, setMessages]);

  useEffect(() => {
    if (!messageStorageScope) return;
    if (skipPersistOnceRef.current) {
      skipPersistOnceRef.current = false;
      return;
    }
    persistStoredMessages(messageStorageScope, messages);
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

  const appendUiSchema = useCallback((schema: UiSchema) => {
    setUiSchema(schema);
    const id = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [...prev, { id, type: 'ui', schema }]);
  }, [setMessages]);

  const appendBackendToolExecution = useCallback((
    call: ToolCall,
    result: import('@/types/llmUi').ToolResult,
    nextState?: WorkflowState
  ) => {
    applyBackendToolExecution(call, result, domainAdapter, toolHistoryRef, setMessages, nextState);
  }, [domainAdapter, setMessages, toolHistoryRef]);

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
        createAgenticEventHandler({
          requestId,
          prompt,
          requestOptions: {
            ...requestOptions,
            continuation: isRestream
          },
          domainAdapter,
          activeRequestIdRef,
          currentTextIdRef,
          handleStreamEvent,
          completeThinking,
          closeTextStream,
          appendToken,
          appendUiSchema,
          appendBackendToolExecution,
          setMessages,
          setError,
          setIsStreaming
        }),
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
  }, [
    appendBackendToolExecution,
    appendToken,
    appendUiSchema,
    closeTextStream,
    completeThinking,
    currentTextIdRef,
    domainAdapter,
    domainLockReason,
    handleStreamEvent,
    resetToolHistory,
    setError,
    setIsStreaming,
    setMessages
  ]);

  const editMessage = useCallback((msgId: string, newContent: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex(m => m.id === msgId);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), { ...prev[idx], content: newContent } as ChatMessage];
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
