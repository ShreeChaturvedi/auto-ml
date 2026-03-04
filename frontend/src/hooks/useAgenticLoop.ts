import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatMessage, ToolCall, ToolResult, UiSchema } from '@/types/llmUi';
import { executeToolCalls, type LlmStreamEvent } from '@/lib/api/llm';
import type { BuildRequestOptions, DomainAdapter } from '@/types/agentic';
import { useNotebookStore } from '@/stores/notebookStore';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function hasAwaitingApprovalStatus(result: ToolResult): boolean {
  const output = asRecord(result.output);
  if (!output) {
    return false;
  }

  const status = typeof output.status === 'string' ? output.status : undefined;
  if (status === 'awaiting_approval') {
    return true;
  }

  const step = asRecord(output.step);
  return step?.status === 'awaiting_approval';
}

function shouldPauseAfterCommit(result: ToolResult): boolean {
  if (result.tool !== 'commit_transformation_step') {
    return false;
  }
  const output = asRecord(result.output);
  if (!output) {
    return false;
  }

  const reasonCode = typeof output.reasonCode === 'string' ? output.reasonCode : '';
  if (reasonCode === 'STEP_APPROVAL_REQUIRED' || reasonCode === 'STEP_APPROVAL_USER_REQUIRED') {
    return true;
  }

  const outputStatus = typeof output.status === 'string' ? output.status : undefined;
  const step = asRecord(output.step);
  const stepStatus = typeof step?.status === 'string' ? step.status : undefined;
  const status = outputStatus ?? stepStatus;

  return status === 'applied';
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For UI representation, keeping track of active elements
  const [uiSchema, setUiSchema] = useState<UiSchema | null>(null);

  const activeRequestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const currentThinkingIdRef = useRef<string | null>(null);
  const currentTextIdRef = useRef<string | null>(null);
  const skipPersistOnceRef = useRef(false);
  
  const toolHistoryRef = useRef<{ calls: ToolCall[]; results: ToolResult[] }>({ calls: [], results: [] });

  const messageStorageScope = storageKey && projectId
    ? `${storageKey}-${projectId}`
    : null;

  // Reset session state and hydrate messages whenever tab/session scope changes.
  useEffect(() => {
    skipPersistOnceRef.current = true;
    activeRequestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    currentThinkingIdRef.current = null;
    currentTextIdRef.current = null;
    toolHistoryRef.current = { calls: [], results: [] };
    setIsGenerating(false);
    setError(null);
    setUiSchema(null);

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
    } catch {
      setMessages([]);
    }
  }, [messageStorageScope, sessionVersion]);

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

  const mergeToolCalls = (previous: ToolCall[], next: ToolCall[]) => {
    const merged = new Map(previous.map((call) => [call.id, call]));
    next.forEach((call) => merged.set(call.id, call));
    return Array.from(merged.values());
  };

  const handleStop = useCallback(() => {
    activeRequestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    domainAdapter.onStop?.('Stopped by user.');
    setMessages((prev) => prev.map((msg) =>
      msg.type === 'thinking' && !msg.isComplete
        ? { ...msg, isComplete: true }
        : msg
    ));
    currentThinkingIdRef.current = null;
    currentTextIdRef.current = null;
  }, [domainAdapter]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    toolHistoryRef.current = { calls: [], results: [] };
    setUiSchema(null);
    if (messageStorageScope) {
      localStorage.removeItem(messageStorageScope);
    }
  }, [messageStorageScope]);

  const runLoop = useCallback(async (
    prompt: string,
    requestOptions: BuildRequestOptions,
    toolResultsOverride?: ToolResult[],
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

    const isRestream = Boolean(toolResultsOverride?.length);

    if (!isRestream) {
      if (!domainAdapter.preserveToolHistoryBetweenPrompts) {
        toolHistoryRef.current = { calls: [], results: [] };
      }
      setUiSchema(null);
      
      // We only append the user message if it's the start of a fresh run
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
    setIsGenerating(true);

    try {
      await domainAdapter.buildRequest(
        prompt,
        toolCallsOverride?.length ? toolCallsOverride : undefined,
        toolResultsOverride?.length ? toolResultsOverride : undefined,
        (rawEvent: unknown) => {
          const event = rawEvent as LlmStreamEvent;
          if (requestId !== activeRequestIdRef.current) return;

          if (event.type === 'token') {
            if (currentThinkingIdRef.current) {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                  ? { ...msg, isComplete: true }
                  : msg
              ));
              currentThinkingIdRef.current = null;
            }
            if (!currentTextIdRef.current) {
              const id = `text-${Date.now()}`;
              currentTextIdRef.current = id;
              setMessages((prev) => [...prev, { id, type: 'assistant_text', content: event.text }]);
            } else {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentTextIdRef.current && msg.type === 'assistant_text'
                  ? { ...msg, content: msg.content + event.text }
                  : msg
              ));
            }
          }
          if (event.type === 'envelope') {
            if (currentThinkingIdRef.current) {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                  ? { ...msg, isComplete: true }
                  : msg
              ));
              currentThinkingIdRef.current = null;
            }
            if (event.envelope.tool_calls?.length) {
              currentTextIdRef.current = null;
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
              if (projectId) {
                const activeNotebookId = useNotebookStore.getState().activeNotebookId ?? undefined;
                executeToolCalls(projectId, toolCalls, activeNotebookId)
                  .then(({ results }) => {
                    if (requestId !== activeRequestIdRef.current) return;

                    setMessages((prev) =>
                      prev.map((msg) => {
                        if (msg.type === 'tool_call') {
                          const result = results.find((r) => r.id === msg.call.id);
                          if (result) {
                            domainAdapter.toolRegistry[msg.call.tool]?.onResult?.(msg.call, result);
                            return { ...msg, result };
                          }
                        }
                        return msg;
                      })
                    );
                    
                    const mergedResults = [...toolHistoryRef.current.results, ...results];
                    toolHistoryRef.current.results = mergedResults;

                    if (results.some(hasAwaitingApprovalStatus)) {
                      setIsGenerating(false);
                      return;
                    }
                    if (results.some(shouldPauseAfterCommit)) {
                      setIsGenerating(false);
                      return;
                    }

                    setTimeout(() => {
                      if (requestId !== activeRequestIdRef.current) return;
                      void runLoop(prompt, requestOptions, mergedResults, toolHistoryRef.current.calls);
                    }, 100);
                  })
                  .catch((toolError) => {
                    if (requestId !== activeRequestIdRef.current) return;
                    console.error('[AgenticLoop] Tool execution failed:', toolError);
                    setMessages((prev) =>
                      prev.map((msg) => {
                        if (msg.type === 'tool_call' && toolCalls.some((tc: ToolCall) => tc.id === msg.call.id)) {
                          const result = {
                            id: msg.call.id,
                            tool: msg.call.tool,
                            error: toolError instanceof Error ? toolError.message : 'Tool execution failed'
                          };
                          domainAdapter.toolRegistry[msg.call.tool]?.onResult?.(msg.call, result);
                          return {
                            ...msg,
                            result
                          };
                        }
                        return msg;
                      })
                    );
                  });
              }
            }
            if (event.envelope.ui) {
              setUiSchema(event.envelope.ui);
              const id = `ui-${Date.now()}`;
              setMessages((prev) => [...prev, { id, type: 'ui', schema: event.envelope.ui! }]);
            }
            if (event.envelope.message) {
              if (!currentTextIdRef.current && event.envelope.message.trim()) {
                 const id = `text-${Date.now()}`;
                 setMessages((prev) => [...prev, { id, type: 'assistant_text', content: event.envelope.message as string }]);
              }
            }
          }
          if (event.type === 'error') {
            setError(event.message);
            domainAdapter.onStreamError?.(event.message);
            const id = `error-${Date.now()}`;
            setMessages((prev) => [...prev, { id, type: 'error', message: event.message }]);
            if (currentThinkingIdRef.current) {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                  ? { ...msg, isComplete: true }
                  : msg
              ));
              currentThinkingIdRef.current = null;
            }
            setIsGenerating(false);
          }
          if (event.type === 'thinking') {
            currentTextIdRef.current = null;
            if (!currentThinkingIdRef.current) {
              const id = `thinking-${Date.now()}`;
              currentThinkingIdRef.current = id;
              setMessages((prev) => [...prev, { id, type: 'thinking', content: event.text, isComplete: false, startTime: Date.now() }]);
            } else {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                  ? { ...msg, content: msg.content + event.text }
                  : msg
              ));
            }
          }
          if (event.type === 'done') {
            setIsGenerating(false);
            setMessages((prev) => prev.map((msg) =>
              msg.type === 'thinking' && !msg.isComplete
                ? { ...msg, isComplete: true }
                : msg
            ));
            currentThinkingIdRef.current = null;
            currentTextIdRef.current = null;
          }
        },
        controller.signal,
        requestOptions
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (requestId !== activeRequestIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to execute loop.';
      setError(message);
      domainAdapter.onStreamError?.(message);
      setIsGenerating(false);
      if (currentThinkingIdRef.current) {
        setMessages((prev) => prev.map((msg) =>
          msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
            ? { ...msg, isComplete: true }
            : msg
        ));
        currentThinkingIdRef.current = null;
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [domainAdapter, domainLockReason, projectId]);

  const editMessage = useCallback((msgId: string, newContent: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex(m => m.id === msgId);
      if (idx === -1) return prev;
      const newMessages = prev.slice(0, idx);
      newMessages.push({ ...prev[idx], content: newContent } as ChatMessage);
      return newMessages;
    });
  }, []);

  return {
    messages,
    setMessages, // expose just in case
    isGenerating,
    error,
    uiSchema,
    runLoop,
    handleStop,
    clearMessages,
    editMessage
  };
}
