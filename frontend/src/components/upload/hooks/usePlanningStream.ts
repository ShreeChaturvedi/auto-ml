/**
 * usePlanningStream - Stream execution loop for the planning chat.
 *
 * Now routes through the unified workflow engine. Tool execution happens
 * backend-side — the frontend just processes streaming events.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ReasoningEffort } from '@/components/llm/modelOptions';
import { streamOnboardingPlan, type LlmStreamEvent } from '@/lib/api/llm';
import type { AskUserQuestion, ChatMessage } from '@/types/llmUi';
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
  setEditingPlanId: (id: string | null) => void;
  setPlanDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleStreamEvent: (event: LlmStreamEvent) => boolean;
  completeThinking: () => void;
  closeTextStream: () => void;
  currentTextIdRef: React.RefObject<string | null>;
  getAnswerHistory: () => { questionId: string; answer: string | string[] }[];
}

export function usePlanningStream({
  projectId,
  selectedModel,
  reasoningEffort,
  currentRound,
  setCurrentRound,
  setMessages,
  setIsStreaming,
  setEditingPlanId,
  setPlanDrafts,
  handleStreamEvent,
  completeThinking,
  closeTextStream,
  currentTextIdRef,
  getAnswerHistory,
}: UsePlanningStreamProps) {
  const controllerRef = useRef<AbortController | null>(null);

  const requestStream = useCallback(
    async (userIntent?: string, round?: number) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
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
            if (event.type === 'token') {
              handleStreamEvent(event);
              return;
            }

            if (event.type === 'thinking' || event.type === 'usage') {
              handleStreamEvent(event);
              return;
            }

            if (event.type === 'error') {
              handleStreamEvent(event);
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
                setEditingPlanId(null);

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

                setPlanDrafts((prev) => ({ ...prev, [planMessageId]: planContent }));
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
              setEditingPlanId(null);

              const planContent = event.planMarkdown.trim();
              const planName = normalizePlanFileName(event.planName);
              const planMessageId = `plan-${Date.now()}`;

              setPlanDrafts((prev) => ({ ...prev, [planMessageId]: planContent }));
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
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : 'Stream failed';
          setMessages((prev) => [...prev, { id: `error-${Date.now()}`, type: 'error', message: msg }]);
        }
      } finally {
        completeThinking();
        closeTextStream();
        setIsStreaming(false);
      }
    },
    [projectId, currentRound, selectedModel, reasoningEffort, handleStreamEvent, completeThinking, closeTextStream, setIsStreaming, setMessages, currentTextIdRef, setEditingPlanId, setPlanDrafts, setCurrentRound, getAnswerHistory]
  );

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return {
    controllerRef,
    requestStream,
  };
}
