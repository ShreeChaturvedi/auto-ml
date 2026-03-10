import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addAssistantTextMessage,
  addThinkingMessage,
  appendAssistantTextDelta,
  appendThinkingDelta,
  markThinkingMessageComplete
} from '@/lib/llm/streamMessageUtils';
import { streamOnboardingPlan, executeToolCalls } from '@/lib/api/llm';
import type { ChatMessage, ToolCall, ToolResult, QuestionAnswer } from '@/types/llmUi';
import { normalizePlanFileName } from '../planningUtils';
import type { UploadedAttachmentPreview } from './useAttachmentUploader';

const MAX_TOOL_PASSES = 3;

interface UsePlanningChatProps {
  projectId: string;
  selectedModel: string;
  reasoningEffort: string;
  uploadPendingAttachments: (targetIds?: string[]) => Promise<{ uploaded: UploadedAttachmentPreview[]; failedCount: number }>;
  pendingAttachmentsCount: number;
  onPlanApproved: (plan: string, planName: string) => void;
}

interface UsePlanningChatReturn {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isStreaming: boolean;
  editingPlanId: string | null;
  planDrafts: Record<string, string>;
  setPlanDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  userMessageAttachments: Record<string, UploadedAttachmentPreview[]>;
  activeTextMessageId: string | null;
  activeThinkingMessageId: string | null;
  controllerRef: React.RefObject<AbortController | null>;
  handleSend: () => void;
  handleSuggestionClick: (prompt: string) => void;
  handleQuestionAnswer: (msgId: string, answers: QuestionAnswer[]) => void;
  handleApprove: (planContent: string, planName: string, planId: string) => void;
  handleStartPlanEdit: (planId: string, currentContent: string) => void;
  handleCancelPlanEdit: (planId: string, currentContent: string) => void;
  handleSavePlanEdit: (planId: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function usePlanningChat({
  projectId,
  selectedModel,
  reasoningEffort,
  uploadPendingAttachments,
  pendingAttachmentsCount,
  onPlanApproved,
}: UsePlanningChatProps): UsePlanningChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<Record<string, string>>({});
  const [userMessageAttachments, setUserMessageAttachments] = useState<Record<string, UploadedAttachmentPreview[]>>({});
  const [activeTextMessageId, setActiveTextMessageId] = useState<string | null>(null);
  const [activeThinkingMessageId, setActiveThinkingMessageId] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const currentThinkingIdRef = useRef<string | null>(null);
  const currentTextIdRef = useRef<string | null>(null);
  const answerHistoryRef = useRef<QuestionAnswer[]>([]);
  const toolCallHistoryRef = useRef<ToolCall[]>([]);
  const toolResultHistoryRef = useRef<ToolResult[]>([]);

  const endThinking = useCallback(() => {
    const id = currentThinkingIdRef.current;
    if (id) {
      setMessages((prev) => markThinkingMessageComplete(prev, id));
      currentThinkingIdRef.current = null;
      setActiveThinkingMessageId(null);
    }
  }, []);

  const endText = useCallback(() => {
    currentTextIdRef.current = null;
    setActiveTextMessageId(null);
  }, []);

  const requestStream = useCallback(
    async (userIntent?: string, round?: number) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const effectiveRound = round ?? currentRound;
      setCurrentRound(effectiveRound);
      setIsStreaming(true);
      endThinking();
      endText();

      let sawAskUser = false;
      let sawPlanExit = false;
      let recoveryAttempted = false;
      let requestUserIntent = userIntent || undefined;

      const executePendingToolCalls = async (pendingToolCalls: ToolCall[]) => {
        if (pendingToolCalls.length === 0) {
          return;
        }

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
              questionAnswers: answerHistoryRef.current.length > 0 ? answerHistoryRef.current : undefined,
              toolCalls: toolCallHistoryRef.current.length > 0 ? toolCallHistoryRef.current : undefined,
              toolResults: toolResultHistoryRef.current.length > 0 ? toolResultHistoryRef.current : undefined,
              round: effectiveRound,
              reasoningEffort,
              model: selectedModel,
            },
            (event) => {
              // Thinking events
              if (event.type === 'thinking') {
                endText();
                if (!currentThinkingIdRef.current) {
                  const id = `thinking-${Date.now()}`;
                  currentThinkingIdRef.current = id;
                  setActiveThinkingMessageId(id);
                  setMessages((prev) => addThinkingMessage(prev, id, event.text, Date.now()));
                } else {
                  const tid = currentThinkingIdRef.current;
                  setMessages((prev) => appendThinkingDelta(prev, tid, event.text));
                }
              }

              // Token events (assistant text or plan)
              if (event.type === 'token') {
                endThinking();
                streamedText += event.text;
                passProducedPlainText = true;
                if (!currentTextIdRef.current) {
                  const id = `text-${Date.now()}`;
                  currentTextIdRef.current = id;
                  setActiveTextMessageId(id);
                  passTextMessageId = id;
                  setMessages((prev) => addAssistantTextMessage(prev, id, event.text));
                } else {
                  const tid = currentTextIdRef.current;
                  passTextMessageId = tid;
                  setMessages((prev) => appendAssistantTextDelta(prev, tid, event.text));
                }
              }

              // Ask user questions
              if (event.type === 'ask_user') {
                endThinking();
                endText();
                sawAskUser = true;
                setMessages((prev) => [
                  ...prev,
                  { id: `ask-${Date.now()}`, type: 'ask_user', questions: event.questions },
                ]);
              }

              if (event.type === 'plan_exit') {
                const streamingTextId = currentTextIdRef.current;
                endThinking();
                endText();
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

              // Envelope with tool calls
              if (event.type === 'envelope') {
                if (event.envelope.tool_calls?.length) {
                  endThinking();
                  endText();

                  const nextCalls = event.envelope.tool_calls.filter(
                    (call) => !pendingToolCalls.some((pending) => pending.id === call.id)
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

              if (event.type === 'error') {
                setMessages((prev) => [
                  ...prev,
                  { id: `error-${Date.now()}`, type: 'error', message: event.message },
                ]);
              }

              if (event.type === 'done') {
                endThinking();
                endText();
              }
            },
            controller.signal
          );

          requestUserIntent = undefined;

          if (sawPlanExit) {
            break;
          }

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

          if (sawAskUser || pendingToolCalls.length === 0) {
            break;
          }
        }

      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : 'Stream failed';
          setMessages((prev) => [...prev, { id: `error-${Date.now()}`, type: 'error', message: msg }]);
        }
      } finally {
        endThinking();
        endText();
        setIsStreaming(false);
      }
    },
    [projectId, currentRound, selectedModel, reasoningEffort, endThinking, endText]
  );

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const submitUserMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || isStreaming) return;

    const queuedCount = pendingAttachmentsCount;
    let uploadedAttachments: UploadedAttachmentPreview[] = [];

    if (queuedCount > 0) {
      const uploadResult = await uploadPendingAttachments();
      uploadedAttachments = uploadResult.uploaded;
      if (uploadResult.failedCount > 0 && uploadedAttachments.length === 0) {
        return;
      }
    }

    const userMessageId = `user-${Date.now()}`;
    setInputValue('');
    setEditingPlanId(null);
    setMessages((prev) => {
      const next = prev.map((message) =>
        message.type === 'plan' && !message.approved ? { ...message, hidden: true } : message
      );

      return [
        ...next,
        { id: userMessageId, type: 'user', content: text, timestamp: Date.now() }
      ];
    });
    if (uploadedAttachments.length > 0) {
      setUserMessageAttachments((prev) => ({ ...prev, [userMessageId]: uploadedAttachments }));
    }

    const uploadedNames = uploadedAttachments.map((item) => item.name);
    const requestText = uploadedNames.length > 0
      ? `${text}\n\nUse and prioritize these newly attached files for this response: ${uploadedNames.join(', ')}.`
      : text;

    // Use current round for the request, then advance for next interaction.
    // Round 0 = first user message (triggers data inspection + first questions).
    void requestStream(requestText, currentRound);
    setCurrentRound((prev) => Math.min(prev + 1, 5));
  }, [isStreaming, pendingAttachmentsCount, uploadPendingAttachments, currentRound, requestStream]);

  const handleSend = useCallback(() => {
    void submitUserMessage(inputValue);
  }, [inputValue, submitUserMessage]);

  const handleSuggestionClick = useCallback((prompt: string) => {
    void submitUserMessage(prompt);
  }, [submitUserMessage]);

  const handleQuestionAnswer = useCallback(
    (msgId: string, answers: QuestionAnswer[]) => {
      answerHistoryRef.current = [...answerHistoryRef.current, ...answers];

      // Mark questions as answered
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId && m.type === 'ask_user' ? { ...m, answered: true } : m))
      );

      // Add a user message summarizing answers
      const summary = answers
        .map((a) => (Array.isArray(a.answer) ? a.answer.join(', ') : a.answer))
        .join('; ');
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, type: 'user', content: summary, timestamp: Date.now() },
      ]);

      void requestStream(undefined, currentRound);
      setCurrentRound((prev) => Math.min(prev + 1, 5));
    },
    [currentRound, requestStream]
  );

  const handleApprove = useCallback(
    (planContent: string, planName: string, planId: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.type !== 'plan') {
            return m;
          }

          if (m.id !== planId) {
            return { ...m, hidden: true };
          }

          return { ...m, approved: true, hidden: false, content: planContent, planName };
        })
      );
      onPlanApproved(planContent, normalizePlanFileName(planName));
    },
    [onPlanApproved]
  );

  const handleStartPlanEdit = useCallback((planId: string, currentContent: string) => {
    setEditingPlanId(planId);
    setPlanDrafts((prev) => ({ ...prev, [planId]: prev[planId] ?? currentContent }));
  }, []);

  const handleCancelPlanEdit = useCallback((planId: string, currentContent: string) => {
    setEditingPlanId(null);
    setPlanDrafts((prev) => ({ ...prev, [planId]: currentContent }));
  }, []);

  const handleSavePlanEdit = useCallback((planId: string) => {
    const draft = planDrafts[planId];
    if (!draft?.trim()) {
      return;
    }

    const nextContent = draft.trim();
    setMessages((prev) =>
      prev.map((message) =>
        message.type === 'plan' && message.id === planId ? { ...message, content: nextContent } : message
      )
    );
    setPlanDrafts((prev) => ({ ...prev, [planId]: nextContent }));
    setEditingPlanId(null);
  }, [planDrafts]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return {
    messages,
    inputValue,
    setInputValue,
    isStreaming,
    editingPlanId,
    planDrafts,
    setPlanDrafts,
    userMessageAttachments,
    activeTextMessageId,
    activeThinkingMessageId,
    controllerRef,
    handleSend,
    handleSuggestionClick,
    handleQuestionAnswer,
    handleApprove,
    handleStartPlanEdit,
    handleCancelPlanEdit,
    handleSavePlanEdit,
    handleKeyDown,
  };
}
