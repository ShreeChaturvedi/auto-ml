import { useRef, useState } from 'react';
import type { ChatMessage, QuestionAnswer } from '@/types/llmUi';
import { useLlmStreamState } from '@/hooks/useLlmStreamState';
import { usePlanEditor } from './usePlanEditor';
import { usePlanningStream } from './usePlanningStream';
import { usePlanningMessages } from './usePlanningMessages';
import type { UploadedAttachmentPreview } from './useAttachmentUploader';

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
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}

export function usePlanningChat({
  projectId,
  selectedModel,
  reasoningEffort,
  uploadPendingAttachments,
  pendingAttachmentsCount,
  onPlanApproved,
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
