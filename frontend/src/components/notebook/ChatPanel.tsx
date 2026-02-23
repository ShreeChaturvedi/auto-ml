/**
 * ChatPanel - LLM chat interface for notebook
 *
 * Features:
 * - Chat messages with user/assistant distinction
 * - Tool call indicators
 * - Thinking block display
 * - Context file attachments
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea
} from '@/components/ui/input-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Loader2,
  ArrowUp,
  Square,
  Paperclip,
  Brain,
  Lightbulb
} from 'lucide-react';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { useDataStore } from '@/stores/dataStore';
import { uploadDocument } from '@/lib/api/documents';
import { streamTrainingPlan, executeToolCalls } from '@/lib/api/llm';
import { getFileType, type UploadedFile } from '@/types/file';
import type { ChatMessage, ToolCall } from '@/types/llmUi';
import { cn } from '@/lib/utils';

interface ChatPanelProps {
  projectId: string;
  className?: string;
}

const stripAssistantArtifacts = (text: string) => {
  if (!text) return '';
  let cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '');
  const markerIndex = cleaned.indexOf('<<<JSON>>>');
  if (markerIndex !== -1) {
    cleaned = cleaned.slice(0, markerIndex);
  }
  const endIndex = cleaned.indexOf('<<<END>>>');
  if (endIndex !== -1) {
    cleaned = cleaned.slice(0, endIndex);
  }
  const jsonIndex = cleaned.search(/{\s*"version"\s*:\s*"1"/);
  if (jsonIndex !== -1) {
    cleaned = cleaned.slice(0, jsonIndex);
  }
  return cleaned.trim();
};

export function ChatPanel({ projectId, className }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [enableThinking, setEnableThinking] = useState(false);
  const [attachmentStatus, setAttachmentStatus] = useState<'idle' | 'uploading' | 'error' | 'success'>('idle');
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentThinkingIdRef = useRef<string | null>(null);
  const currentTextIdRef = useRef<string | null>(null);

  const files = useDataStore((s) => s.files);
  const addFile = useDataStore((s) => s.addFile);
  const setFileMetadata = useDataStore((s) => s.setFileMetadata);

  const documentFiles = files.filter(
    (f) => f.projectId === projectId && f.metadata?.documentId
  );

  // Load messages from localStorage
  useEffect(() => {
    if (!projectId) return;
    const stored = localStorage.getItem(`notebook-messages-${projectId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ChatMessage[];
        setMessages(parsed);
      } catch {
        // Ignore invalid stored data
      }
    }
  }, [projectId]);

  // Save messages to localStorage
  useEffect(() => {
    if (!projectId || messages.length === 0) return;
    localStorage.setItem(`notebook-messages-${projectId}`, JSON.stringify(messages));
  }, [projectId, messages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const nextHeight = Math.min(220, Math.max(80, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
  }, [chatInput]);

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

  const handleSend = useCallback(async () => {
    if (!chatInput.trim() || isGenerating) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setIsGenerating(true);

    // Add user message
    const userChatMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: userMessage,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, userChatMessage]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamTrainingPlan(
        {
          projectId,
          prompt: userMessage,
          enableThinking
        },
        (event) => {
          if (event.type === 'token') {
            // Mark thinking as complete if we were thinking
            if (currentThinkingIdRef.current) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                    ? { ...msg, isComplete: true }
                    : msg
                )
              );
              currentThinkingIdRef.current = null;
            }

            // Append to current text message or create new one
            if (!currentTextIdRef.current) {
              const id = `text-${Date.now()}`;
              currentTextIdRef.current = id;
              setMessages((prev) => [...prev, { id, type: 'assistant_text', content: event.text }]);
            } else {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === currentTextIdRef.current && msg.type === 'assistant_text'
                    ? { ...msg, content: msg.content + event.text }
                    : msg
                )
              );
            }
          }

          if (event.type === 'thinking') {
            currentTextIdRef.current = null;
            if (!currentThinkingIdRef.current) {
              const id = `thinking-${Date.now()}`;
              currentThinkingIdRef.current = id;
              setMessages((prev) => [
                ...prev,
                { id, type: 'thinking', content: event.text, isComplete: false, startTime: Date.now() }
              ]);
            } else {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                    ? { ...msg, content: msg.content + event.text }
                    : msg
                )
              );
            }
          }

          if (event.type === 'envelope' && event.envelope.tool_calls?.length) {
            currentTextIdRef.current = null;
            const toolCalls = event.envelope.tool_calls;

            // Add tool call messages (initially without results)
            for (const call of toolCalls) {
              setMessages((prev) => [...prev, { id: `tool-${call.id}`, type: 'tool_call', call }]);
            }

            // Execute tool calls and update messages with results
            executeToolCalls(projectId, toolCalls)
              .then(({ results }) => {
                // Update each tool call message with its result
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.type === 'tool_call') {
                      const result = results.find((r) => r.id === msg.call.id);
                      if (result) {
                        return { ...msg, result };
                      }
                    }
                    return msg;
                  })
                );

                // Re-invoke LLM with tool results to continue the agentic loop
                setTimeout(() => {
                  streamTrainingPlan(
                    {
                      projectId,
                      toolCalls,
                      toolResults: results,
                      enableThinking
                    },
                    (continueEvent) => {
                      if (continueEvent.type === 'token') {
                        if (!currentTextIdRef.current) {
                          const id = `text-${Date.now()}`;
                          currentTextIdRef.current = id;
                          setMessages((prev) => [...prev, { id, type: 'assistant_text', content: continueEvent.text }]);
                        } else {
                          setMessages((prev) =>
                            prev.map((msg) =>
                              msg.id === currentTextIdRef.current && msg.type === 'assistant_text'
                                ? { ...msg, content: msg.content + continueEvent.text }
                                : msg
                            )
                          );
                        }
                      }
                      if (continueEvent.type === 'thinking') {
                        currentTextIdRef.current = null;
                        if (!currentThinkingIdRef.current) {
                          const id = `thinking-${Date.now()}`;
                          currentThinkingIdRef.current = id;
                          setMessages((prev) => [
                            ...prev,
                            { id, type: 'thinking', content: continueEvent.text, isComplete: false, startTime: Date.now() }
                          ]);
                        } else {
                          setMessages((prev) =>
                            prev.map((msg) =>
                              msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                                ? { ...msg, content: msg.content + continueEvent.text }
                                : msg
                            )
                          );
                        }
                      }
                      if (continueEvent.type === 'done') {
                        if (currentThinkingIdRef.current) {
                          setMessages((prev) =>
                            prev.map((msg) =>
                              msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                                ? { ...msg, isComplete: true }
                                : msg
                            )
                          );
                          currentThinkingIdRef.current = null;
                        }
                        setIsGenerating(false);
                      }
                    }
                  ).catch((err) => {
                    console.error('[ChatPanel] LLM continuation failed:', err);
                    setIsGenerating(false);
                  });
                }, 100);
              })
              .catch((toolError) => {
                console.error('[ChatPanel] Tool execution failed:', toolError);
                // Mark tools as failed
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.type === 'tool_call' && toolCalls.some((tc: ToolCall) => tc.id === msg.call.id)) {
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
              })
              .finally(() => {
                // Ensure all tools from this batch are marked as complete even if no responses came back
                // This prevents spinners from running indefinitely
                const toolIds = new Set(toolCalls.map((tc: ToolCall) => tc.id));
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.type === 'tool_call' && toolIds.has(msg.call.id) && !msg.result) {
                      return {
                        ...msg,
                        result: {
                          id: msg.call.id,
                          tool: msg.call.tool,
                          output: { status: 'completed' },
                          error: undefined
                        }
                      };
                    }
                    return msg;
                  })
                );
              });
          }

          if (event.type === 'error') {
            setMessages((prev) => [
              ...prev,
              { id: `error-${Date.now()}`, type: 'error', message: event.message }
            ]);
            setIsGenerating(false);
          }

          if (event.type === 'done') {
            if (currentThinkingIdRef.current) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                    ? { ...msg, isComplete: true }
                    : msg
                )
              );
            }
            currentThinkingIdRef.current = null;
            currentTextIdRef.current = null;
            setIsGenerating(false);
          }
        },
        controller.signal
      );
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
      textareaRef.current?.focus();
    }
  }, [chatInput, isGenerating, projectId, enableThinking]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
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
                    </div>
                  </div>
                );
              case 'thinking':
                return (
                  <ThinkingBlock
                    key={msg.id}
                    content={msg.content}
                    isComplete={msg.isComplete}
                  />
                );
              case 'assistant_text':
                return msg.content.trim() ? (
                  <div
                    key={msg.id}
                    className="rounded-md border border-muted/40 bg-muted/20 p-4 text-sm text-foreground"
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {stripAssistantArtifacts(msg.content)}
                    </div>
                  </div>
                ) : null;
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
        <InputGroup>
          <InputGroupTextarea
            ref={textareaRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI for help..."
            disabled={isGenerating}
            className="min-h-[80px]"
          />
          <InputGroupAddon align="block-end">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] gap-1">
                <Brain className="h-3 w-3" />
                {documentFiles.length} doc{documentFiles.length === 1 ? '' : 's'}
              </Badge>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEnableThinking(!enableThinking)}
                      className={cn(
                        'h-7 gap-1.5 px-2 text-xs transition-colors',
                        enableThinking &&
                        'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300'
                      )}
                    >
                      <Lightbulb
                        className={cn(
                          'h-3.5 w-3.5',
                          enableThinking && 'text-yellow-500 fill-yellow-400'
                        )}
                      />
                      {enableThinking && <span>Thinking</span>}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{enableThinking ? 'Disable' : 'Enable'} extended thinking</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachmentStatus === 'uploading'}
                title="Attach context file"
              >
                {attachmentStatus === 'uploading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
              </Button>

              <InputGroupButton
                size="sm"
                onClick={isGenerating ? handleStop : handleSend}
                disabled={!chatInput.trim() && !isGenerating}
                variant="ghost"
                className="h-9 w-9 rounded-full border border-foreground/30 bg-foreground p-0 text-background hover:bg-foreground/90 disabled:bg-muted/30 disabled:text-muted-foreground"
              >
                {isGenerating ? <Square className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
              </InputGroupButton>
            </div>
          </InputGroupAddon>
        </InputGroup>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.md,.txt"
          onChange={handleAttachFile}
          className="hidden"
        />

        {attachmentMessage && (
          <div className="mt-2 text-xs text-muted-foreground">
            <span
              className={cn(
                attachmentStatus === 'success' && 'text-emerald-600',
                attachmentStatus === 'error' && 'text-destructive'
              )}
            >
              {attachmentMessage}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
