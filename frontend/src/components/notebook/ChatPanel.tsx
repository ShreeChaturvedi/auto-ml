/**
 * ChatPanel - LLM chat interface for notebook
 *
 * Features:
 * - Chat messages with user/assistant distinction
 * - Tool call indicators
 * - Thinking block display
 * - Context file attachments
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Brain,
} from 'lucide-react';
import { LlmChatComposer, type AttachmentStatus, type ChatInputConfig, type ModelConfig, type ReasoningConfig, type ComposerSlots, type MentionSlotConfig, type UsageConfig } from '@/components/llm/LlmChatComposer';
import { MentionDropdown } from '@/components/llm/MentionDropdown';
import type { MentionInputHandle } from '@/components/llm/MentionInput';
import { useMentionAutocomplete, type MentionCandidate } from '@/hooks/useMentionAutocomplete';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { useDataStore } from '@/stores/dataStore';
import { uploadDocument } from '@/lib/api/documents';
import { streamTrainingPlan, executeToolCalls, type LlmStreamEvent } from '@/lib/api/llm';
import {
  buildInlineModelOptions,
  DEFAULT_ASSISTANT_MODEL,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  type ReasoningEffort
} from '@/components/llm/modelOptions';
import { useLlmModelCatalog } from '@/hooks/useLlmModelCatalog';
import { sanitizeAssistantText } from '@/lib/llm/sanitizeAssistantText';
import { useLlmStreamState } from '@/hooks/useLlmStreamState';
import { getFileType, fileIconByType, fileIconColorByType } from '@/lib/fileUtils';
import type { UploadedFile, FileType } from '@/types/file';
import type { ChatMessage, ToolCall, ToolResult } from '@/types/llmUi';
import { cn } from '@/lib/utils';

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
  const [hydratedMessageIds, setHydratedMessageIds] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const mentionInputRef = useRef<MentionInputHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
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

  // Load messages from localStorage
  useEffect(() => {
    if (!projectId) return;
    const stored = localStorage.getItem(`notebook-messages-${projectId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ChatMessage[];
        setMessages(parsed);
        setHydratedMessageIds(new Set(parsed.map((message) => message.id)));
      } catch {
        // Ignore invalid stored data
        setHydratedMessageIds(new Set());
      }
    } else {
      setHydratedMessageIds(new Set());
    }
  }, [projectId, setMessages]);

  // Save messages to localStorage
  useEffect(() => {
    if (!projectId || messages.length === 0) return;
    localStorage.setItem(`notebook-messages-${projectId}`, JSON.stringify(messages));
  }, [projectId, messages]);

  // Clear attachment message after timeout
  useEffect(() => {
    if (!attachmentMessage) return;
    const timeout = setTimeout(() => {
      setAttachmentMessage(null);
      setAttachmentStatus('idle');
    }, 4000);
    return () => clearTimeout(timeout);
  }, [attachmentMessage]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

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

  const markToolsCompleteFallback = useCallback((toolCalls: ToolCall[]) => {
    const toolIds = new Set(toolCalls.map((tc) => tc.id));
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.type === 'tool_call' && toolIds.has(msg.call.id) && !msg.result) {
          return {
            ...msg,
            result: {
              id: msg.call.id,
              tool: msg.call.tool,
              output: { status: 'completed' }
            }
          };
        }
        return msg;
      })
    );
  }, [setMessages]);

  const applyToolResults = useCallback((results: ToolResult[]) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.type !== 'tool_call') return msg;
        const result = results.find((entry) => entry.id === msg.call.id);
        return result ? { ...msg, result } : msg;
      })
    );
  }, [setMessages]);

  const runStream = useCallback(async (
    request: {
      prompt?: string;
      toolCalls?: ToolCall[];
      toolResults?: ToolResult[];
    },
    controller: AbortController
  ) => {
    await streamTrainingPlan(
      {
        projectId,
        prompt: request.prompt,
        toolCalls: request.toolCalls,
        toolResults: request.toolResults,
        model: assistantModel,
        reasoningEffort
      },
      async (event: LlmStreamEvent) => {
        // Let the shared hook handle token, thinking, usage, error, done
        if (handleStreamEvent(event)) return;

        // Handle envelope events (tool calls + fallback message)
        if (event.type === 'envelope') {
          if (event.envelope.tool_calls?.length) {
            closeTextStream();
            const toolCalls = event.envelope.tool_calls;
            for (const call of toolCalls) {
              setMessages((prev) => [...prev, { id: `tool-${call.id}`, type: 'tool_call', call }]);
            }

            try {
              const { results } = await executeToolCalls(projectId, toolCalls);
              applyToolResults(results);
              if (!controller.signal.aborted) {
                await runStream({ toolCalls, toolResults: results }, controller);
              }
            } catch (toolError) {
              console.error('[ChatPanel] Tool execution failed:', toolError);
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.type === 'tool_call' && toolCalls.some((tc) => tc.id === msg.call.id)) {
                    return {
                      ...msg,
                      result: {
                        id: msg.call.id,
                        tool: msg.call.tool,
                        error: toolError instanceof Error ? toolError.message : 'Tool execution failed'
                      }
                    };
                  }
                  return msg;
                })
              );
            } finally {
              markToolsCompleteFallback(toolCalls);
            }
            return;
          }

          if (event.envelope.message?.trim()) {
            appendToken(event.envelope.message);
          }
        }
      },
      controller.signal
    );
  }, [
    appendToken,
    applyToolResults,
    closeTextStream,
    handleStreamEvent,
    markToolsCompleteFallback,
    assistantModel,
    projectId,
    reasoningEffort,
    setMessages
  ]);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim() || isGenerating) return;

    const userMessage = chatInput.trim();
    const currentMentions = resolvedMentions;

    setChatInput('');
    mentionDismiss();
    setIsGenerating(true);

    const userChatMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: userMessage,
      mentions: currentMentions.length > 0 ? currentMentions : undefined,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, userChatMessage]);

    // Append referenced files context to prompt for the LLM
    let prompt = userMessage;
    if (currentMentions.length > 0) {
      const fileList = currentMentions.map((m) => m.name).join(', ');
      prompt += `\n\n[Referenced files: ${fileList}]`;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await runStream({ prompt }, controller);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to generate response'
        }
      ]);
      setIsGenerating(false);
    } finally {
      mentionInputRef.current?.focus();
    }
  }, [chatInput, isGenerating, resolvedMentions, mentionDismiss, setIsGenerating, setMessages, runStream]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    completeThinking();
    closeTextStream();
    setIsGenerating(false);
  }, [closeTextStream, completeThinking, setIsGenerating]);

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

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-primary/10 p-4 mb-4">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">AI Assistant</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ask questions, request code, or get help with your ML workflow.
                The AI can create and edit notebook cells directly.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            switch (msg.type) {
              case 'user':
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%]">
                      {msg.content}
                      {msg.mentions && msg.mentions.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {msg.mentions.map((m) => {
                            const MIcon = fileIconByType[m.type as FileType] ?? fileIconByType.other;
                            const mColor = fileIconColorByType[m.type as FileType] ?? fileIconColorByType.other;
                            return (
                              <Badge key={m.id} variant="secondary" className="gap-1 text-[10px] py-0">
                                <MIcon className={cn('h-2.5 w-2.5', mColor)} />
                                {m.name}
                              </Badge>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              case 'thinking':
                return (
                  <ThinkingBlock
                    key={msg.id}
                    messageId={msg.id}
                    content={msg.content}
                    isComplete={msg.isComplete}
                    isLive={activeThinkingMessageId === msg.id}
                    animateOnMount={!hydratedMessageIds.has(msg.id)}
                  />
                );
              case 'assistant_text': {
                const cleaned = sanitizeAssistantText(msg.content);
                return cleaned ? (
                  <div
                    key={msg.id}
                    className="rounded-md border border-muted/40 bg-muted/20 p-4 text-sm text-foreground"
                  >
                    <ProgressiveMessageText
                      messageId={msg.id}
                      text={cleaned}
                      isLive={activeTextMessageId === msg.id}
                      mode="markdown"
                      animateOnMount={!hydratedMessageIds.has(msg.id)}
                      className="llm-notebook-markdown whitespace-pre-wrap leading-relaxed"
                    />
                  </div>
                ) : null;
              }
              case 'tool_call':
                return (
                  <ToolIndicator
                    key={msg.id}
                    toolCalls={[msg.call]}
                    results={msg.result ? [msg.result] : []}
                    isRunning={!msg.result}
                  />
                );
              case 'error':
                return (
                  <div
                    key={msg.id}
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  >
                    {msg.message}
                  </div>
                );
              default:
                return null;
            }
          })}

          {isGenerating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

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
