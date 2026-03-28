/**
 * usePlanningMessages - Message building and history management for the planning chat.
 *
 * Extracted from usePlanningChat to isolate user-message submission,
 * question-answer handling, plan approval, and keyboard shortcuts.
 */

import { useCallback, useState } from 'react';
import type { ChatMessage, QuestionAnswer } from '@/types/llmUi';
import { normalizePlanFileName } from '../planningUtils';
import type { UploadedAttachmentPreview } from './useAttachmentUploader';

interface UsePlanningMessagesProps {
  isStreaming: boolean;
  currentRound: number;
  setCurrentRound: React.Dispatch<React.SetStateAction<number>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  requestStream: (userIntent?: string, round?: number) => void;
  onPlanApproved: (plan: string, planName: string) => void;
  uploadPendingAttachments: (targetIds?: string[]) => Promise<{ uploaded: UploadedAttachmentPreview[]; failedCount: number }>;
  pendingAttachmentsCount: number;
  answerHistoryRef: React.RefObject<QuestionAnswer[]>;
}

export function usePlanningMessages({
  isStreaming,
  currentRound,
  setCurrentRound,
  setMessages,
  requestStream,
  onPlanApproved,
  uploadPendingAttachments,
  pendingAttachmentsCount,
  answerHistoryRef,
}: UsePlanningMessagesProps) {
  const [inputValue, setInputValue] = useState('');
  const [userMessageAttachments, setUserMessageAttachments] = useState<Record<string, UploadedAttachmentPreview[]>>({});

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

    void requestStream(requestText, currentRound);
    setCurrentRound((prev) => Math.min(prev + 1, 5));
  }, [isStreaming, pendingAttachmentsCount, uploadPendingAttachments, currentRound, requestStream, setMessages, setCurrentRound]);

  const handleSend = useCallback(() => {
    void submitUserMessage(inputValue);
  }, [inputValue, submitUserMessage]);

  const handleSuggestionClick = useCallback((prompt: string) => {
    void submitUserMessage(prompt);
  }, [submitUserMessage]);

  const handleQuestionAnswer = useCallback(
    (msgId: string, answers: QuestionAnswer[]) => {
      answerHistoryRef.current = [...answerHistoryRef.current, ...answers];

      setMessages((prev) =>
        prev.map((m) => (m.id === msgId && m.type === 'ask_user' ? { ...m, answered: true } : m))
      );

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
    [answerHistoryRef, currentRound, requestStream, setMessages, setCurrentRound]
  );

  const handleApprove = useCallback(
    (planContent: string, planName: string, planId: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.type !== 'plan') return m;
          if (m.id !== planId) return { ...m, hidden: true };
          return { ...m, approved: true, hidden: false, content: planContent, planName };
        })
      );
      onPlanApproved(planContent, normalizePlanFileName(planName));
    },
    [onPlanApproved, setMessages]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return {
    inputValue,
    setInputValue,
    userMessageAttachments,
    handleSend,
    handleSuggestionClick,
    handleQuestionAnswer,
    handleApprove,
    handleKeyDown,
  };
}
