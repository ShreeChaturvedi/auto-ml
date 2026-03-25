import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, QuestionAnswer } from '@/types/llmUi';
import type { ReasoningEffort } from '@/components/llm/modelOptions';
import { useLlmStreamState } from '@/hooks/useLlmStreamState';
import { usePlanEditor } from './usePlanEditor';
import { usePlanningStream } from './usePlanningStream';
import { usePlanningMessages } from './usePlanningMessages';
import type { UploadedAttachmentPreview } from './useAttachmentUploader';
import { usePlanChatStore } from '@/stores/planChatStore';

interface UsePlanningChatProps {
  projectId: string;
  selectedModel: string;
  reasoningEffort: ReasoningEffort;
  uploadPendingAttachments: (targetIds?: string[]) => Promise<{ uploaded: UploadedAttachmentPreview[]; failedCount: number }>;
  pendingAttachmentsCount: number;
  onPlanApproved: (plan: string, planName: string) => void;
  planChatId?: string | null;
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
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}

export function usePlanningChat({
  projectId,
  selectedModel,
  reasoningEffort,
  uploadPendingAttachments,
  pendingAttachmentsCount,
  onPlanApproved,
  planChatId,
}: UsePlanningChatProps): UsePlanningChatReturn {
  const stream = useLlmStreamState();
  const {
    messages, setMessages,
    isStreaming, setIsStreaming,
    activeTextMessageId, activeThinkingMessageId,
    handleStreamEvent,
    completeThinking, closeTextStream,
    currentTextIdRef,
  } = stream;

  const planEditor = usePlanEditor();
  const {
    editingPlanId, setEditingPlanId,
    planDrafts, setPlanDrafts,
    handleStartPlanEdit, handleCancelPlanEdit,
    handleSavePlanEdit: planEditorSave,
  } = planEditor;

  const [currentRound, setCurrentRound] = useState(0);
  const answerHistoryRef = useRef<QuestionAnswer[]>([]);

  // ── Restore from store on mount ──────────────────────────────────────
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!planChatId || initializedRef.current) return;
    const chat = usePlanChatStore.getState().chats[planChatId];
    if (!chat) return;
    initializedRef.current = true;
    if (chat.messages.length > 0) setMessages(chat.messages);
    if (Object.keys(chat.planDrafts).length > 0) setPlanDrafts(chat.planDrafts);
    if (chat.answerHistory.length > 0) answerHistoryRef.current = chat.answerHistory;
    if (chat.currentRound > 0) setCurrentRound(chat.currentRound);
  }, [planChatId, setMessages, setPlanDrafts]);

  // ── Debounce-persist to store (2s) ───────────────────────────────────
  const persistTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!planChatId) return;
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const store = usePlanChatStore.getState();
      if (!store.chats[planChatId]) return;
      store.updateMessages(planChatId, messages);
      store.updateDrafts(planChatId, planDrafts);
      store.updateAnswerHistory(planChatId, answerHistoryRef.current);
      store.updateRound(planChatId, currentRound);
    }, 2000);
    return () => clearTimeout(persistTimerRef.current);
  }, [planChatId, messages, planDrafts, currentRound]);

  // ── Stream execution (tool-call loop, domain events) ────────────────
  const { controllerRef, requestStream } = usePlanningStream({
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
    getAnswerHistory: () => answerHistoryRef.current,
  });

  // ── Message building / user interaction handlers ────────────────────
  const messaging = usePlanningMessages({
    isStreaming,
    currentRound,
    setCurrentRound,
    setMessages,
    setEditingPlanId,
    requestStream,
    planEditorSave,
    onPlanApproved,
    uploadPendingAttachments,
    pendingAttachmentsCount,
    answerHistoryRef,
  });

  return {
    messages,
    inputValue: messaging.inputValue,
    setInputValue: messaging.setInputValue,
    isStreaming,
    editingPlanId,
    planDrafts,
    setPlanDrafts,
    userMessageAttachments: messaging.userMessageAttachments,
    activeTextMessageId,
    activeThinkingMessageId,
    controllerRef,
    handleSend: messaging.handleSend,
    handleSuggestionClick: messaging.handleSuggestionClick,
    handleQuestionAnswer: messaging.handleQuestionAnswer,
    handleApprove: messaging.handleApprove,
    handleStartPlanEdit,
    handleCancelPlanEdit,
    handleSavePlanEdit: messaging.handleSavePlanEdit,
    handleKeyDown: messaging.handleKeyDown,
  };
}
