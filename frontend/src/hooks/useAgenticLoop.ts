import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatMessage, ToolCall, UiSchema } from '@/types/llmUi';
import type { BuildRequestOptions, DomainAdapter } from '@/types/agentic';
import { markAllThinkingMessagesComplete } from '@/lib/llm/streamMessageUtils';
import { useLlmStreamState } from '@/hooks/useLlmStreamState';
import { createAgenticEventHandler } from '@/hooks/agenticLoopEvents';
import { hydrateStoredMessages, persistStoredMessages } from '@/hooks/agenticLoopStorage';
import { applyBackendToolExecution, rebuildToolHistoryFromMessages } from '@/hooks/agenticToolMessages';
import { useToolExecution } from '@/hooks/useToolExecution';
import { getMessagesUpToTurn, getTurnIndex } from '@/lib/llm/turnUtils';
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const activeRequestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const skipPersistOnceRef = useRef(false);
  const savepointsRef = useRef<Record<number, string>>({});

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
    savepointsRef.current = hydrated.savepoints;
  }, [messageStorageScope, sessionVersion, resetStreamRefs, resetToolHistory, setIsStreaming, setError, setMessages]);

  useEffect(() => {
    if (!messageStorageScope) return;
    if (skipPersistOnceRef.current) {
      skipPersistOnceRef.current = false;
      return;
    }
    persistStoredMessages(messageStorageScope, messages, savepointsRef.current);
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
    toolCallsOverride?: ToolCall[],
    userMessageId?: string
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
          id: userMessageId ?? `user-${Date.now()}`,
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

  /**
   * Revert to a specific turn index.
   * Reconciles all 7 state layers: abort, messages, tool history,
   * workflow session, domain adapter, UI schema, and stream refs.
   */
  const revertToTurn = useCallback((turnIndex: number) => {
    // 1. Abort in-flight stream
    if (isStreaming) {
      handleStop();
    }

    // 2. Prune savepoints FIRST (before any persist call reads the ref)
    const prunedSavepoints: Record<number, string> = {};
    for (const [k, v] of Object.entries(savepointsRef.current)) {
      if (Number(k) < turnIndex) prunedSavepoints[Number(k)] = v;
    }
    savepointsRef.current = prunedSavepoints;

    // 3. Slice messages to before this turn (keeps turns 0..turnIndex-1)
    const slicedMessages = getMessagesUpToTurn(messages, turnIndex);

    if (slicedMessages.length === 0) {
      // Reverting before first turn — clear everything
      skipPersistOnceRef.current = true;
      setMessages([]);
      if (messageStorageScope) {
        persistStoredMessages(messageStorageScope, [], prunedSavepoints);
      }
    } else {
      setMessages(slicedMessages);
    }

    // 4. Rebuild tool history from remaining messages
    resetToolHistory();
    if (slicedMessages.length > 0) {
      rebuildToolHistoryFromMessages(slicedMessages, toolHistoryRef);
    }

    // 5. Domain-specific cleanup (adapters clear their own workflow sessions)
    domainAdapter.onRevert?.(turnIndex);

    // 6. Reset UI schema to last ui message in sliced set
    const lastUi = [...slicedMessages].reverse().find(m => m.type === 'ui');
    setUiSchema(lastUi?.type === 'ui' ? lastUi.schema : null);

    // 7. Reset stream refs + hydrated IDs
    resetStreamRefs();
    setHydratedMessageIds(new Set(slicedMessages.map(m => m.id)));
    setEditingMessageId(null);
    setError(null);
  }, [
    isStreaming, handleStop, messages, messageStorageScope,
    setMessages, resetToolHistory, toolHistoryRef,
    domainAdapter, resetStreamRefs, setError
  ]);

  /**
   * Edit a previous message and resend.
   * Truncates conversation from the edited message's turn, then starts a new run.
   */
  const editAndResend = useCallback((
    messageId: string,
    newContent: string,
    requestOptions: BuildRequestOptions
  ) => {
    const turnIdx = getTurnIndex(messages, messageId);
    if (turnIdx === -1) return;

    revertToTurn(turnIdx);
    setEditingMessageId(null);

    // Start fresh run with edited content
    void runLoop(newContent, requestOptions);
  }, [messages, revertToTurn, runLoop]);

  /** Register a savepoint ID for a turn index (called externally by useSavepoints). */
  const registerSavepoint = useCallback((turnIndex: number, savepointId: string) => {
    savepointsRef.current = { ...savepointsRef.current, [turnIndex]: savepointId };
  }, []);

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
    editMessage,
    revertToTurn,
    editAndResend,
    editingMessageId,
    setEditingMessageId,
    registerSavepoint
  };
}
