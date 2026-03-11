/**
 * ChatPanel - LLM chat interface for notebook
 *
 * Features:
 * - Chat messages with user/assistant distinction
 * - Tool call indicators
 * - Thinking block display
 * - Context file attachments
 *
 * Delegates concerns to extracted hooks/components:
 * - useToolCallProcessor: tool result application
 * - useMessagePersistence: localStorage hydration/save
 * - useChatStream: stream execution loop + send/stop
 * - ChatMessageList: message rendering JSX
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Brain } from 'lucide-react';
import { LlmChatComposer, type AttachmentStatus, type ChatInputConfig, type ModelConfig, type ReasoningConfig, type ComposerSlots, type MentionSlotConfig, type UsageConfig } from '@/components/llm/LlmChatComposer';
import { MentionDropdown } from '@/components/llm/MentionDropdown';
import type { MentionInputHandle } from '@/components/llm/MentionInput';
import { useMentionAutocomplete, type MentionCandidate } from '@/hooks/useMentionAutocomplete';
import { useDataStore } from '@/stores/dataStore';
import { uploadDocument } from '@/lib/api/documents';
import {
  buildInlineModelOptions,
  DEFAULT_ASSISTANT_MODEL,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  type ReasoningEffort
} from '@/components/llm/modelOptions';
import { useLlmModelCatalog } from '@/hooks/useLlmModelCatalog';
import { useLlmStreamState } from '@/hooks/useLlmStreamState';
import { getFileType } from '@/lib/fileUtils';
import type { UploadedFile } from '@/types/file';
import { cn } from '@/lib/utils';

import { useToolCallProcessor } from './chat/useToolCallProcessor';
import { useMessagePersistence } from './chat/useMessagePersistence';
import { useChatStream } from './chat/useChatStream';
import { ChatMessageList } from './chat/ChatMessageList';

interface ChatPanelProps {
  projectId: string;
  className?: string;
}

export function ChatPanel({ projectId, className }: ChatPanelProps) {
  const {
    messages,
    setMessages,
    isStreaming: isGenerating,
    setIsStreaming: setIsGenerating,
    sessionUsages,
    activeTextMessageId,
    activeThinkingMessageId,
    appendToken,
    completeThinking,
    closeTextStream,
    handleStreamEvent
  } = useLlmStreamState();

  const [chatInput, setChatInput] = useState('');
  const [assistantModel, setAssistantModel] = useState(DEFAULT_ASSISTANT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');
  const [attachmentStatus, setAttachmentStatus] = useState<AttachmentStatus>('idle');
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);

  const mentionInputRef = useRef<MentionInputHandle>(null);
  const {
    featuredModelOptions,
    allModelOptions,
    defaultModel,
    defaultReasoningEffort
  } = useLlmModelCatalog();

  const files = useDataStore((s) => s.files);
  const addFile = useDataStore((s) => s.addFile);
  const setFileMetadata = useDataStore((s) => s.setFileMetadata);

  const documentFiles = files.filter(
    (f) => f.projectId === projectId && f.metadata?.documentId
  );

  const projectFiles = useMemo(
    () => files.filter((f) => f.projectId === projectId),
    [files, projectId]
  );

  const mentionCandidates = useMemo<MentionCandidate[]>(
    () =>
      projectFiles.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        meta: {
          datasetId: f.metadata?.datasetId,
          documentId: f.metadata?.documentId
        }
      })),
    [projectFiles]
  );

  const inlineModelOptions = buildInlineModelOptions(featuredModelOptions);

  const handleModelChange = useCallback((model: string) => {
    setAssistantModel(model);
    setReasoningEffort(getDefaultReasoningEffort(model, allModelOptions));
  }, [allModelOptions]);

  const mentionNames = useMemo(
    () => new Set(mentionCandidates.map((c) => c.name.toLowerCase())),
    [mentionCandidates]
  );

  const mentionTypes = useMemo(
    () => new Map(mentionCandidates.map((c) => [c.name.toLowerCase(), c.type])),
    [mentionCandidates]
  );

  const {
    isOpen: mentionIsOpen,
    filtered: mentionFiltered,
    activeIndex: mentionActiveIndex,
    handleKeyDown: mentionHandleKeyDown,
    handleValueChange: mentionHandleValueChange,
    selectCandidate: mentionSelectCandidate,
    dismiss: mentionDismiss,
    resolvedMentions
  } = useMentionAutocomplete({
    candidates: mentionCandidates,
    value: chatInput,
    onValueChange: setChatInput,
    inputRef: mentionInputRef
  });

  // ── Extracted hooks ──────────────────────────────────────────────────

  const { hydratedMessageIds } = useMessagePersistence({
    projectId,
    messages,
    setMessages
  });

  const { markToolsCompleteFallback, applyToolResults } = useToolCallProcessor({
    setMessages
  });

  const { handleSend, handleStop } = useChatStream({
    projectId,
    assistantModel,
    reasoningEffort,
    chatInput,
    isGenerating,
    resolvedMentions,
    setChatInput,
    setMessages,
    setIsGenerating,
    appendToken,
    closeTextStream,
    completeThinking,
    handleStreamEvent,
    markToolsCompleteFallback,
    applyToolResults,
    mentionDismiss,
    mentionInputRef
  });

  // ── Side-effects ─────────────────────────────────────────────────────

  // Clear attachment message after timeout
  useEffect(() => {
    if (!attachmentMessage) return;
    const timeout = setTimeout(() => {
      setAttachmentMessage(null);
      setAttachmentStatus('idle');
    }, 4000);
    return () => clearTimeout(timeout);
  }, [attachmentMessage]);

  useEffect(() => {
    if (!assistantModel && defaultModel) {
      setAssistantModel(defaultModel);
    }
  }, [assistantModel, defaultModel]);

  useEffect(() => {
    if (!allModelOptions.length) {
      setReasoningEffort(defaultReasoningEffort);
      return;
    }

    const nextModel = allModelOptions.some((option) => option.value === assistantModel)
      ? assistantModel
      : defaultModel;
    if (nextModel !== assistantModel) {
      setAssistantModel(nextModel);
      return;
    }

    const supportsCurrent = getReasoningEffortOptions(nextModel, allModelOptions)
      .some((option) => option.value === reasoningEffort);
    if (!supportsCurrent) {
      setReasoningEffort(getDefaultReasoningEffort(nextModel, allModelOptions));
    }
  }, [allModelOptions, assistantModel, defaultModel, defaultReasoningEffort, reasoningEffort]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Let mention autocomplete handle keys first
      if (mentionHandleKeyDown(event)) return;

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend, mentionHandleKeyDown]
  );

  const handleAttachFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !projectId) return;

      const uploadedFile: UploadedFile = {
        id: crypto.randomUUID(),
        name: file.name,
        type: getFileType(file),
        size: file.size,
        uploadedAt: new Date(),
        projectId,
        file
      };

      addFile(uploadedFile);
      setAttachmentStatus('uploading');
      setAttachmentMessage(null);

      try {
        const response = await uploadDocument(projectId, file);
        const document = response.document;

        setFileMetadata(uploadedFile.id, {
          documentId: document.documentId,
          chunkCount: document.chunkCount,
          embeddingDimension: document.embeddingDimension
        });

        setAttachmentStatus('success');
        setAttachmentMessage(`Added ${file.name} to context`);
      } catch (error) {
        setAttachmentStatus('error');
        setAttachmentMessage(error instanceof Error ? error.message : 'Failed to upload document');
      } finally {
        event.target.value = '';
      }
    },
    [projectId, addFile, setFileMetadata]
  );

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Messages */}
      <ChatMessageList
        messages={messages}
        isGenerating={isGenerating}
        activeTextMessageId={activeTextMessageId}
        activeThinkingMessageId={activeThinkingMessageId}
        hydratedMessageIds={hydratedMessageIds}
      />

      {/* Input */}
      <div className="border-t bg-background p-4">
        <LlmChatComposer
          chatInput={{
            value: chatInput,
            onValueChange: (v) => mentionHandleValueChange(v),
            onKeyDown: handleKeyDown as (event: React.KeyboardEvent<HTMLElement>) => void,
            placeholder: "Ask AI for help... (type @ to mention files)",
            disabled: isGenerating,
            isStreaming: isGenerating,
            onSend: () => void handleSend(),
            onStop: handleStop,
          } satisfies ChatInputConfig}
          modelConfig={{
            model: assistantModel,
            onModelChange: handleModelChange,
            modelOptions: inlineModelOptions,
          } satisfies ModelConfig}
          reasoningConfig={{
            reasoningEffort,
            onReasoningEffortChange: setReasoningEffort,
            reasoningOptions: getReasoningEffortOptions(assistantModel, allModelOptions),
          } satisfies ReasoningConfig}
          usageConfig={{
            sessionUsages,
            model: assistantModel,
          } satisfies UsageConfig}
          slots={{
            metaSlot: (
              <Badge variant="outline" className="text-[11px] gap-1">
                <Brain className="h-3 w-3" />
                {documentFiles.length} doc{documentFiles.length === 1 ? '' : 's'}
              </Badge>
            ),
            attachment: {
              onAttachFile: handleAttachFile,
              status: attachmentStatus,
              message: attachmentMessage,
              items: [],
              accept: '.pdf,.md,.txt',
            },
            mentionSlot: {
              dropdown: (
                <MentionDropdown
                  isOpen={mentionIsOpen}
                  filtered={mentionFiltered}
                  activeIndex={mentionActiveIndex}
                  anchorRef={mentionInputRef}
                  onSelect={mentionSelectCandidate}
                />
              ),
              inputRef: mentionInputRef,
              mentionNames,
              mentionTypes,
              onValueChange: mentionHandleValueChange,
            } satisfies MentionSlotConfig,
          } satisfies ComposerSlots}
        />
      </div>
    </div>
  );
}
