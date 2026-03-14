/**
 * usePlanningStream - Stream execution loop for the planning chat.
 *
 * Extracted from usePlanningChat to isolate the multi-pass NDJSON
 * streaming logic, tool-call execution, and domain-specific event
 * handling (ask_user, plan_exit, envelope).
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ReasoningEffort } from '@/components/llm/modelOptions';
import { streamOnboardingPlan, executeToolCalls, type LlmStreamEvent } from '@/lib/api/llm';
import type { ChatMessage, ToolCall, ToolResult } from '@/types/llmUi';
import { addAssistantTextMessage } from '@/lib/llm/streamMessageUtils';
import { normalizePlanFileName } from '../planningUtils';

const MAX_TOOL_PASSES = 3;

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
  const toolCallHistoryRef = useRef<ToolCall[]>([]);
  const toolResultHistoryRef = useRef<ToolResult[]>([]);

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
      let recoveryAttempted = false;
      let requestUserIntent = userIntent || undefined;

      const executePendingToolCalls = async (pendingToolCalls: ToolCall[]) => {
        if (pendingToolCalls.length === 0) return;

        const { results } = await executeToolCalls(projectId, pendingToolCalls);
        toolCallHistoryRef.current = [...toolCallHistoryRef.current, ...pendingToolCalls];
        toolResultHistoryRef.current = [...toolResultHistoryRef.current, ...results];

        setMessages((prev) =>
          prev.map((m) => {
            if (m.type !== 'tool_call') return m;
            const result = results.find((r) => r.id === m.call.id);
            return result ? { ...m, result } : m;
          })
        );
      };

      try {
        for (let pass = 0; pass < MAX_TOOL_PASSES; pass++) {
          if (controller.signal.aborted) return;

          let streamedText = '';
          let pendingToolCalls: ToolCall[] = [];
          let passTextMessageId: string | null = null;
          let passProducedPlainText = false;

          await streamOnboardingPlan(
            {
              projectId,
              userIntent: requestUserIntent,
              questionAnswers: getAnswerHistory().length > 0 ? getAnswerHistory() : undefined,
              toolCalls: toolCallHistoryRef.current.length > 0 ? toolCallHistoryRef.current : undefined,
              toolResults: toolResultHistoryRef.current.length > 0 ? toolResultHistoryRef.current : undefined,
              round: effectiveRound,
              reasoningEffort,
              model: selectedModel,
            },
            (event) => {
              // Let the shared hook handle token, thinking, usage, error, done
              if (event.type === 'token') {
                handleStreamEvent(event);
                streamedText += event.text;
                passProducedPlainText = true;
                passTextMessageId = currentTextIdRef.current;
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
                // Don't let shared hook set isStreaming=false mid-loop;
                // we handle that in finally. Just clean up thinking/text.
                completeThinking();
                closeTextStream();
                return;
              }

              // Domain-specific: ask_user
              if (event.type === 'ask_user') {
                completeThinking();
                closeTextStream();
                sawAskUser = true;
                setMessages((prev) => [
                  ...prev,
                  { id: `ask-${Date.now()}`, type: 'ask_user', questions: event.questions },
                ]);
              }

              // Domain-specific: plan_exit
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
              }

              // Domain-specific: envelope with tool calls
              if (event.type === 'envelope') {
                if (event.envelope.tool_calls?.length) {
                  completeThinking();
                  closeTextStream();

                  const nextCalls = event.envelope.tool_calls.filter(
                    (call: ToolCall) => !pendingToolCalls.some((pending) => pending.id === call.id)
                  );
                  pendingToolCalls = [...pendingToolCalls, ...nextCalls];

                  for (const call of nextCalls) {
                    setMessages((prev) => [
                      ...prev,
                      { id: `tool-${call.id}`, type: 'tool_call', call },
                    ]);
                  }
                }
                // Fallback message if no tokens were streamed
                const fallback = event.envelope.message?.trim();
                if (
                  fallback
                  && fallback !== 'Done.'
                  && !streamedText
                  && !sawAskUser
                  && !sawPlanExit
                  && !event.envelope.ask_user
                  && !event.envelope.plan_exit
                  && pendingToolCalls.length === 0
                ) {
                  streamedText = fallback;
                  passProducedPlainText = true;
                  const id = `text-fallback-${Date.now()}`;
                  passTextMessageId = id;
                  setMessages((prev) => addAssistantTextMessage(prev, id, fallback));
                }
              }
            },
            controller.signal
          );

          requestUserIntent = undefined;

          if (sawPlanExit) break;

          await executePendingToolCalls(pendingToolCalls);

          if (
            !sawAskUser
            && !sawPlanExit
            && pendingToolCalls.length === 0
            && passProducedPlainText
            && !recoveryAttempted
            && pass < MAX_TOOL_PASSES - 1
          ) {
            recoveryAttempted = true;

            if (passTextMessageId) {
              setMessages((prev) =>
                prev.filter((message) => !(message.type === 'assistant_text' && message.id === passTextMessageId))
              );
            }

            requestUserIntent = [
              userIntent,
              'Continue now by using exactly one structured tool call. Use ask_user if clarification is needed, otherwise use plan_exit with complete markdown.'
            ]
              .filter(Boolean)
              .join('\n\n');

            continue;
          }

          if (sawAskUser || pendingToolCalls.length === 0) break;
        }

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
