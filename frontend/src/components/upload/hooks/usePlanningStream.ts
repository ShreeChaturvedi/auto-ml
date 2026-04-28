/**
 * usePlanningStream - Stream execution loop for the planning chat.
 *
 * Now routes through the unified workflow engine. Tool execution happens
 * backend-side — the frontend just processes streaming events.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ReasoningEffort } from '@/components/llm/modelOptions';
import {
  interruptWorkflowRun,
  listWorkflowRuns,
  streamOnboardingPlan,
  type LlmStreamEvent
} from '@/lib/api/llm';
import type { AskUserQuestion, ChatMessage } from '@/types/llmUi';
import type { WorkflowState } from '@/types/workflow';
import { addAssistantTextMessage } from '@/lib/llm/streamMessageUtils';
import { normalizePlanFileName } from '../planningUtils';

interface UsePlanningStreamProps {
  projectId: string;
  selectedModel: string;
  reasoningEffort: ReasoningEffort;
  currentRound: number;
  setCurrentRound: React.Dispatch<React.SetStateAction<number>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  handleStreamEvent: (event: LlmStreamEvent) => boolean;
  completeThinking: () => void;
  closeTextStream: () => void;
  currentTextIdRef: React.RefObject<string | null>;
  getAnswerHistory: () => { questionId: string; answer: string | string[] }[];
  onStreamComplete?: () => void;
}

export function usePlanningStream({
  projectId,
  selectedModel,
  reasoningEffort,
  currentRound,
  setCurrentRound,
  setMessages,
  setIsStreaming,
  handleStreamEvent,
  completeThinking,
  closeTextStream,
  currentTextIdRef,
  getAnswerHistory,
  onStreamComplete,
}: UsePlanningStreamProps) {
  const controllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);
  const requestRunIdsRef = useRef<Map<number, string>>(new Map());
  const interruptingRequestIdsRef = useRef<Set<number>>(new Set());
  const abortReasonsRef = useRef<Map<number, string>>(new Map());

  const trackRequestState = useCallback((requestId: number, state?: WorkflowState) => {
    if (!state?.runId) {
      return;
    }

    if (state.status === 'running') {
      requestRunIdsRef.current.set(requestId, state.runId);
      return;
    }

    requestRunIdsRef.current.delete(requestId);
  }, []);

  const interruptRequest = useCallback(async (requestId: number, reason: string) => {
    if (requestId <= 0 || interruptingRequestIdsRef.current.has(requestId)) {
      return;
    }

    interruptingRequestIdsRef.current.add(requestId);
    const knownRunId = requestRunIdsRef.current.get(requestId);
    requestRunIdsRef.current.delete(requestId);

    try {
      if (knownRunId) {
        await interruptWorkflowRun(knownRunId, reason);
        return;
      }

      const { runs } = await listWorkflowRuns(projectId, 'onboarding');
      const activeRun = runs.find((run) => run.status === 'running');
      if (activeRun?.runId) {
        await interruptWorkflowRun(activeRun.runId, reason);
      }
    } catch (error) {
      console.warn('[usePlanningStream] Failed to interrupt onboarding workflow run', {
        projectId,
        requestId,
        error
      });
    } finally {
      abortReasonsRef.current.delete(requestId);
      interruptingRequestIdsRef.current.delete(requestId);
    }
  }, [projectId]);

  const requestStream = useCallback(
    async (userIntent?: string, round?: number) => {
      const previousController = controllerRef.current;
      const previousRequestId = activeRequestIdRef.current;

      if (previousController) {
        abortReasonsRef.current.set(previousRequestId, 'Onboarding plan request replaced by a new turn.');
        previousController.abort();
        await interruptRequest(previousRequestId, 'Onboarding plan request replaced by a new turn.');
      }

      const requestId = previousRequestId + 1;
      activeRequestIdRef.current = requestId;
      const controller = new AbortController();
      controller.signal.addEventListener('abort', () => {
        const reason = abortReasonsRef.current.get(requestId) ?? 'Onboarding plan stream aborted by client.';
        void interruptRequest(requestId, reason);
      }, { once: true });
      controllerRef.current = controller;

      const effectiveRound = round ?? currentRound;
      setCurrentRound(effectiveRound);
      setIsStreaming(true);
      completeThinking();
      closeTextStream();

      let sawAskUser = false;
      let sawPlanExit = false;

      try {
        await streamOnboardingPlan(
          {
            projectId,
            userIntent: userIntent || undefined,
            questionAnswers: getAnswerHistory().length > 0 ? getAnswerHistory() : undefined,
            round: effectiveRound,
            reasoningEffort,
            model: selectedModel,
          },
          (event) => {
            if (event.type === 'workflow_state') {
              trackRequestState(requestId, event.state);
              return;
            }

            if ('state' in event) {
              trackRequestState(requestId, event.state);
            }

            if (activeRequestIdRef.current !== requestId) {
              return;
            }

            if (event.type === 'token') {
              handleStreamEvent(event);
              return;
            }

            if (event.type === 'thinking' || event.type === 'usage') {
              handleStreamEvent(event);
              return;
            }

            if (event.type === 'error' || event.type === 'workflow_error') {
              // Preserve the structured error code so resolveErrorDisplay can
              // render friendly copy for UPSTREAM_RATE_LIMITED etc.
              const errorEvent = event.type === 'workflow_error'
                ? {
                    type: 'error' as const,
                    message: event.message,
                    code: event.code,
                    retryable: event.retryable
                  }
                : event;
              handleStreamEvent(errorEvent);
              return;
            }

            if (event.type === 'done') {
              completeThinking();
              closeTextStream();
              return;
            }

            // Backend-executed tool results
            if (event.type === 'tool_executed') {
              setMessages((prev) => [
                ...prev,
                {
                  id: `tool-${event.call.id}`,
                  type: 'tool_call',
                  call: event.call,
                  result: event.result
                } as ChatMessage
              ]);
              return;
            }

            // Workflow pause — may include ask_user questions
            if (event.type === 'workflow_pause') {
              completeThinking();
              closeTextStream();

              const ui = event.ui as Record<string, unknown> | null | undefined;
              const askUserPayload = ui?.ask_user as { questions: AskUserQuestion[] } | undefined;

              if (askUserPayload?.questions?.length) {
                sawAskUser = true;
                setMessages((prev) => [
                  ...prev,
                  { id: `ask-${Date.now()}`, type: 'ask_user' as const, questions: askUserPayload.questions },
                ]);
              } else if (event.message) {
                setMessages((prev) => addAssistantTextMessage(prev, `pause-${Date.now()}`, event.message!));
              }
              return;
            }

            // Artifact updated — handles plan_exit
            if (event.type === 'artifact_updated') {
              const artifact = event.artifact;
              const payload = (artifact.payload ?? {}) as Record<string, unknown>;
              if (artifact.kind === 'plan') {
                const streamingTextId = currentTextIdRef.current;
                completeThinking();
                closeTextStream();
                sawPlanExit = true;

                const planMarkdown = typeof payload.planMarkdown === 'string'
                  ? payload.planMarkdown
                  : typeof payload.message === 'string'
                    ? payload.message
                    : '';
                const planContent = planMarkdown.trim();
                const planName = normalizePlanFileName(
                  typeof payload.planName === 'string' ? payload.planName : undefined
                );
                const planMessageId = `plan-${Date.now()}`;

                setMessages((prev) => {
                  const withoutPlanText = prev.filter((message) =>
                    !(streamingTextId && message.type === 'assistant_text' && message.id === streamingTextId)
                  );
                  const next = withoutPlanText.map((message) =>
                    message.type === 'plan' && !message.approved ? { ...message, hidden: true } : message
                  );

                  return [
                    ...next,
                    { id: planMessageId, type: 'plan', content: planContent, planName, hidden: false }
                  ];
                });
              } else if (artifact.kind === 'summary' && typeof payload.message === 'string') {
                const msg = payload.message;
                if (msg.trim()) {
                  setMessages((prev) => addAssistantTextMessage(prev, `summary-${Date.now()}`, msg));
                }
              }
              return;
            }

            // Legacy ask_user / plan_exit events (from stream parser envelope extraction)
            if (event.type === 'ask_user') {
              completeThinking();
              closeTextStream();
              sawAskUser = true;
              setMessages((prev) => [
                ...prev,
                { id: `ask-${Date.now()}`, type: 'ask_user', questions: event.questions },
              ]);
              return;
            }

            if (event.type === 'plan_exit') {
              const streamingTextId = currentTextIdRef.current;
              completeThinking();
              closeTextStream();
              sawPlanExit = true;

              const planContent = event.planMarkdown.trim();
              const planName = normalizePlanFileName(event.planName);
              const planMessageId = `plan-${Date.now()}`;

              setMessages((prev) => {
                const withoutPlanText = prev.filter((message) =>
                  !(streamingTextId && message.type === 'assistant_text' && message.id === streamingTextId)
                );
                const next = withoutPlanText.map((message) =>
                  message.type === 'plan' && !message.approved ? { ...message, hidden: true } : message
                );

                return [
                  ...next,
                  { id: planMessageId, type: 'plan', content: planContent, planName, hidden: false }
                ];
              });
              return;
            }

            // Envelope events (legacy compatibility — should no longer fire for onboarding)
            if (event.type === 'envelope') {
              const fallback = event.envelope.message?.trim();
              if (fallback && fallback !== 'Done.' && !sawAskUser && !sawPlanExit) {
                setMessages((prev) => addAssistantTextMessage(prev, `text-fallback-${Date.now()}`, fallback));
              }
            }
          },
          controller.signal
        );
      } catch (err) {
        if (!controller.signal.aborted && activeRequestIdRef.current === requestId) {
          const msg = err instanceof Error ? err.message : 'Stream failed';
          setMessages((prev) => [...prev, { id: `error-${Date.now()}`, type: 'error', message: msg }]);
        }
      } finally {
        requestRunIdsRef.current.delete(requestId);
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        if (activeRequestIdRef.current === requestId) {
          completeThinking();
          closeTextStream();
          setIsStreaming(false);
          onStreamComplete?.();
        }
      }
    },
    [
      projectId,
      currentRound,
      selectedModel,
      reasoningEffort,
      handleStreamEvent,
      completeThinking,
      closeTextStream,
      setIsStreaming,
      setMessages,
      currentTextIdRef,
      setCurrentRound,
      getAnswerHistory,
      onStreamComplete,
      interruptRequest,
      trackRequestState
    ]
  );

  useEffect(() => {
    const abortReasons = abortReasonsRef.current;

    return () => {
      const activeController = controllerRef.current;
      if (!activeController) {
        return;
      }

      const activeRequestId = activeRequestIdRef.current;
      abortReasons.set(activeRequestId, 'Onboarding plan stream closed by client.');
      activeController.abort();
      void interruptRequest(activeRequestId, 'Onboarding plan stream closed by client.');
    };
  }, [interruptRequest]);

  return {
    controllerRef,
    requestStream,
  };
}
