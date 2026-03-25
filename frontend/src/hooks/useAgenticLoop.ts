import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage, ToolCall, UiSchema } from '@/types/llmUi';
import type { BuildRequestOptions, DomainAdapter } from '@/types/agentic';
import { markAllThinkingMessagesComplete } from '@/lib/llm/streamMessageUtils';
import { createAgenticEventHandler } from '@/hooks/agenticLoopEvents';
import { applyBackendToolExecution, rebuildToolHistoryFromMessages } from '@/hooks/agenticToolMessages';
import { useToolExecution } from '@/hooks/useToolExecution';
import { getMessagesUpToTurn, getTurnIndex } from '@/lib/llm/turnUtils';
import { useStreamingState } from '@/hooks/useStreamingState';
import { useMessageAccumulator } from '@/hooks/useMessageAccumulator';
import { persistStoredMessages } from '@/hooks/agenticLoopStorage';
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
  // --- Composed hooks ---
  const streaming = useStreamingState();
  const accumulator = useMessageAccumulator({
    storageKey,
    projectId,
    sessionVersion,
    onHydrate: (_messages, hydratedIds) => {
      setHydratedMessageIds(hydratedIds);
      streaming.cancelCurrentRequest();
      streaming.setIsStreaming(false);
      streaming.setError(null);
    }
  });

  const { toolHistoryRef, resetToolHistory } = useToolExecution();

  // --- UI state (not extracted to hooks) ---
  const [uiSchema, setUiSchema] = useState<UiSchema | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [hydratedMessageIds, setHydratedMessageIds] = useState<Set<string>>(new Set());

  // --- Setup: reset on session change ---
  useEffect(() => {
    accumulator.skipPersistOnceRef.current = true;
    streaming.cancelCurrentRequest();
    streaming.resetStreamRefs();
    resetToolHistory();
    streaming.setIsStreaming(false);
    streaming.setError(null);
    setUiSchema(null);
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    accumulator.messageStorageScope, sessionVersion, streaming, resetToolHistory
  ]);

  const handleStop = useCallback(() => {
    streaming.cancelCurrentRequest();
    streaming.setIsStreaming(false);
    domainAdapter.onStop?.('Stopped by user.');
    accumulator.setMessages(markAllThinkingMessagesComplete);
    streaming.completeThinking();
    streaming.closeTextStream();
    streaming.resetStreamRefs();
  }, [domainAdapter, streaming, accumulator]);

  const clearMessages = useCallback(() => {
    accumulator.setMessages([]);
    // Note: sessionUsages is not part of public API, but would be cleared here if needed
    resetToolHistory();
    setUiSchema(null);
    setHydratedMessageIds(new Set());
    streaming.resetStreamRefs();
    accumulator.resetAccumulator();
  }, [streaming, accumulator, resetToolHistory]);

  const appendUiSchema = useCallback((schema: UiSchema) => {
    setUiSchema(schema);
    const id = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    accumulator.setMessages((prev) => [...prev, { id, type: 'ui', schema }]);
  }, [accumulator]);

  const appendBackendToolExecution = useCallback((
    call: ToolCall,
    result: import('@/types/llmUi').ToolResult,
    nextState?: WorkflowState
  ) => {
    applyBackendToolExecution(call, result, domainAdapter, toolHistoryRef, accumulator.setMessages, nextState);
  }, [domainAdapter, accumulator, toolHistoryRef]);

  const runLoop = useCallback(async (
    prompt: string,
    requestOptions: BuildRequestOptions,
    toolResultsOverride?: import('@/types/llmUi').ToolResult[],
    toolCallsOverride?: ToolCall[],
    userMessageId?: string
  ) => {
    if (domainLockReason) {
      streaming.setError(domainLockReason);
      return;
    }

    const requestId = streaming.activeRequestIdRef.current + 1;
    streaming.activeRequestIdRef.current = requestId;
    const controller = streaming.startRequest();
    streaming.completeThinking();
    streaming.closeTextStream();

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
        accumulator.setMessages(prev => [...prev, userChatMessage]);
      }
    }

    streaming.setError(null);
    streaming.setIsStreaming(true);

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
          activeRequestIdRef: streaming.activeRequestIdRef,
          currentTextIdRef: streaming.currentTextIdRef,
          handleStreamEvent: streaming.handleStreamEvent,
          completeThinking: streaming.completeThinking,
          closeTextStream: streaming.closeTextStream,
          appendToken: streaming.appendToken,
          appendUiSchema,
          appendBackendToolExecution,
          setMessages: accumulator.setMessages,
          setError: streaming.setError,
          setIsStreaming: streaming.setIsStreaming
        }),
        controller.signal,
        {
          ...requestOptions,
          continuation: isRestream
        }
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (!streaming.isRequestCurrent(requestId)) return;
      const message = err instanceof Error ? err.message : 'Failed to execute loop.';
      streaming.setError(message);
      domainAdapter.onStreamError?.(message);
      streaming.setIsStreaming(false);
      streaming.completeThinking();
      streaming.closeTextStream();
    } finally {
      if (streaming.abortRef.current === controller) {
        streaming.abortRef.current = null;
      }
    }
  }, [
    appendBackendToolExecution,
    appendUiSchema,
    domainAdapter,
    domainLockReason,
    resetToolHistory,
    streaming,
    accumulator
  ]);

  const editMessage = useCallback((msgId: string, newContent: string) => {
    accumulator.setMessages((prev) => {
      const idx = prev.findIndex(m => m.id === msgId);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), { ...prev[idx], content: newContent } as ChatMessage];
    });
  }, [accumulator]);

  /**
   * Revert to a specific turn index.
   * Reconciles all 7 state layers: abort, messages, tool history,
   * workflow session, domain adapter, UI schema, and stream refs.
   */
  const revertToTurn = useCallback((turnIndex: number) => {
    // 1. Abort in-flight stream
    if (streaming.isStreaming) {
      handleStop();
    }

    // 2. Prune savepoints FIRST (before any persist call reads the ref)
    const prunedSavepoints: Record<number, string> = {};
    for (const [k, v] of Object.entries(accumulator.savepointsRef.current)) {
      if (Number(k) < turnIndex) prunedSavepoints[Number(k)] = v as string;
    }
    accumulator.savepointsRef.current = prunedSavepoints;

    // 3. Slice messages to before this turn (keeps turns 0..turnIndex-1)
    const slicedMessages = getMessagesUpToTurn(accumulator.messages, turnIndex);

    if (slicedMessages.length === 0) {
      // Reverting before first turn — clear everything
      accumulator.skipPersistOnceRef.current = true;
      accumulator.setMessages([]);
      if (accumulator.messageStorageScope) {
        persistStoredMessages(accumulator.messageStorageScope, [], prunedSavepoints);
      }
    } else {
      accumulator.setMessages(slicedMessages);
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
    streaming.resetStreamRefs();
    setHydratedMessageIds(new Set(slicedMessages.map(m => m.id)));
    setEditingMessageId(null);
    streaming.setError(null);
  }, [
    streaming, handleStop, accumulator, resetToolHistory, toolHistoryRef,
    domainAdapter
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
    const turnIdx = getTurnIndex(accumulator.messages, messageId);
    if (turnIdx === -1) return;

    revertToTurn(turnIdx);
    setEditingMessageId(null);

    // Start fresh run with edited content
    void runLoop(newContent, requestOptions);
  }, [accumulator, revertToTurn, runLoop]);

  /** Register a savepoint ID for a turn index (called externally by useSavepoints). */
  const registerSavepoint = useCallback((turnIndex: number, savepointId: string) => {
    accumulator.savepointsRef.current = { ...accumulator.savepointsRef.current, [turnIndex]: savepointId };
  }, [accumulator]);

  return {
    messages: accumulator.messages,
    setMessages: accumulator.setMessages,
    isGenerating: streaming.isStreaming,
    error: streaming.error,
    uiSchema,
    sessionUsages: streaming.sessionUsages,
    activeTextMessageId: streaming.activeTextMessageId,
    activeThinkingMessageId: streaming.activeThinkingMessageId,
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
