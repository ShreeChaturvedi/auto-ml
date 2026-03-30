import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, QuestionAnswer } from '@/types/llmUi';
import type { ReasoningEffort } from '@/components/llm/modelOptions';
import { useLlmStreamState } from '@/hooks/useLlmStreamState';
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
  userMessageAttachments: Record<string, UploadedAttachmentPreview[]>;
  activeTextMessageId: string | null;
  activeThinkingMessageId: string | null;
  controllerRef: React.RefObject<AbortController | null>;
  handleSend: () => void;
  handleSuggestionClick: (prompt: string) => void;
  handleQuestionAnswer: (msgId: string, answers: QuestionAnswer[]) => void;
  handleApprove: (planContent: string, planName: string, planId: string) => void;
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

  const [currentRound, setCurrentRound] = useState(0);
  const answerHistoryRef = useRef<QuestionAnswer[]>([]);

  // Stable refs for async persist callbacks (avoids stale closures)
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const currentRoundRef = useRef(currentRound);
  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);

  const isInitialized = usePlanChatStore((s) => s.isInitialized);

  // ── Persist helper — shared by debounce, visibilitychange, and post-stream
  const persistCurrentState = useCallback(() => {
    if (!planChatId) return;
    const store = usePlanChatStore.getState();
    if (!store.chats[planChatId]) return;
    void store.persistChatState(planChatId, {
      messages: messagesRef.current,
      answerHistory: answerHistoryRef.current,
      currentRound: currentRoundRef.current,
    });
  }, [planChatId]);

  // ── Restore from store on mount ──────────────────────────────────────
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!planChatId || initializedRef.current || !isInitialized) return;
    const chat = usePlanChatStore.getState().chats[planChatId];
    if (!chat) return;
    initializedRef.current = true;
    if (chat.messages.length > 0) setMessages(chat.messages);
    if (chat.answerHistory.length > 0) answerHistoryRef.current = chat.answerHistory;
    if (chat.currentRound > 0) setCurrentRound(chat.currentRound);
  }, [planChatId, setMessages, isInitialized]);

  // ── Debounce-persist to API (2s) ────────────────────────────────────
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!planChatId) return;
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(persistCurrentState, 2000);
    return () => clearTimeout(persistTimerRef.current);
  }, [planChatId, messages, currentRound, persistCurrentState]);

  // ── visibilitychange handler — persist on tab hide ──────────────────
  useEffect(() => {
    if (!planChatId) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(persistTimerRef.current);
        persistCurrentState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [planChatId, persistCurrentState]);

  // ── Stream execution (tool-call loop, domain events) ────────────────
  const { controllerRef, requestStream } = usePlanningStream({
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
    getAnswerHistory: () => answerHistoryRef.current,
    onStreamComplete: persistCurrentState,
  });

  // ── Message building / user interaction handlers ────────────────────
  const messaging = usePlanningMessages({
    isStreaming,
    currentRound,
    setCurrentRound,
    setMessages,
    requestStream,
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
    userMessageAttachments: messaging.userMessageAttachments,
    activeTextMessageId,
    activeThinkingMessageId,
    controllerRef,
    handleSend: messaging.handleSend,
    handleSuggestionClick: messaging.handleSuggestionClick,
    handleQuestionAnswer: messaging.handleQuestionAnswer,
    handleApprove: messaging.handleApprove,
    handleKeyDown: messaging.handleKeyDown,
  };
}
