import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ArrowLeft, Brain, Check, Loader2 } from 'lucide-react';

import { LlmChatComposer } from '@/components/llm/LlmChatComposer';
import {
  ASSISTANT_MODEL_OPTIONS,
  getDefaultReasoningEffort,
  getModelOption,
  getReasoningEffortOptions,
  type ReasoningEffort
} from '@/components/llm/modelOptions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { uploadDocument } from '@/lib/api/documents';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { useDataStore } from '@/stores/dataStore';
import { QuestionCards } from './QuestionCards';
import { streamOnboardingPlan, executeToolCalls } from '@/lib/api/llm';
import { getFileType, type UploadedFile } from '@/types/file';
import type { ChatMessage, ToolCall, ToolResult, QuestionAnswer } from '@/types/llmUi';

const MAX_TOOL_PASSES = 3;
const PLAN_HEADING_RE = /^#\s+Project Plan/m;

interface PlanningStageProps {
  projectId: string;
  onBack: () => void;
  onPlanApproved: (plan: string, planName: string) => void;
}

function generatePlanName(): string {
  const adjectives = [
    'swift', 'bold', 'calm', 'keen', 'bright', 'clear', 'prime', 'sharp',
    'warm', 'fair', 'deep', 'vast', 'wise', 'neat', 'agile', 'vivid'
  ];
  const nouns = [
    'falcon', 'river', 'summit', 'garden', 'crystal', 'bridge', 'compass',
    'beacon', 'harbor', 'meadow', 'prism', 'orbit', 'spark', 'trail'
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${adj}-${noun}-${suffix}`;
}

export function PlanningStage({ projectId, onBack, onPlanApproved }: PlanningStageProps) {
  const files = useDataStore((state) => state.files);
  const addFile = useDataStore((state) => state.addFile);
  const setFileMetadata = useDataStore((state) => state.setFileMetadata);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [enableThinking, setEnableThinking] = useState(false);
  const [selectedModel, setSelectedModel] = useState(ASSISTANT_MODEL_OPTIONS[0]?.value ?? 'auto');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    getDefaultReasoningEffort(ASSISTANT_MODEL_OPTIONS[0]?.value ?? 'auto')
  );
  const [attachmentStatus, setAttachmentStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const currentThinkingIdRef = useRef<string | null>(null);
  const currentTextIdRef = useRef<string | null>(null);
  const answerHistoryRef = useRef<QuestionAnswer[]>([]);
  const toolCallHistoryRef = useRef<ToolCall[]>([]);
  const toolResultHistoryRef = useRef<ToolResult[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrappedRef = useRef(false);
  const projectFiles = useMemo(
    () => files.filter((file) => file.projectId === projectId),
    [files, projectId]
  );
  const documentFiles = useMemo(
    () => projectFiles.filter((file) => file.metadata?.documentId),
    [projectFiles]
  );
  const reasoningEffortOptions = useMemo(
    () => getReasoningEffortOptions(selectedModel),
    [selectedModel]
  );
  const selectedModelOption = useMemo(
    () => getModelOption(selectedModel),
    [selectedModel]
  );
  const shouldIncludeThoughts = selectedModelOption.supportsThinking
    && (selectedModelOption.thinkingAlwaysOn || enableThinking);

  useEffect(() => {
    const supportsCurrent = reasoningEffortOptions.some((option) => option.value === reasoningEffort);
    if (!supportsCurrent) {
      setReasoningEffort(getDefaultReasoningEffort(selectedModel));
    }
  }, [selectedModel, reasoningEffort, reasoningEffortOptions]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const endThinking = useCallback(() => {
    const id = currentThinkingIdRef.current;
    if (id) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id && m.type === 'thinking' ? { ...m, isComplete: true } : m
        )
      );
      currentThinkingIdRef.current = null;
    }
  }, []);

  const endText = useCallback(() => {
    currentTextIdRef.current = null;
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

      let planMarkdown = '';
      let sawAskUser = false;

      try {
        for (let pass = 0; pass < MAX_TOOL_PASSES; pass++) {
          if (controller.signal.aborted) return;

          let pendingToolCalls: ToolCall[] = [];

          await streamOnboardingPlan(
            {
              projectId,
              userIntent: userIntent || undefined,
              questionAnswers: answerHistoryRef.current.length > 0 ? answerHistoryRef.current : undefined,
              toolCalls: toolCallHistoryRef.current.length > 0 ? toolCallHistoryRef.current : undefined,
              toolResults: toolResultHistoryRef.current.length > 0 ? toolResultHistoryRef.current : undefined,
              round: effectiveRound,
              enableThinking: shouldIncludeThoughts,
              thinkingLevel: reasoningEffort,
              model: selectedModel !== 'auto' ? selectedModel : undefined,
            },
            (event) => {
              // Thinking events
              if (event.type === 'thinking') {
                endText();
                if (!currentThinkingIdRef.current) {
                  const id = `thinking-${Date.now()}`;
                  currentThinkingIdRef.current = id;
                  setMessages((prev) => [
                    ...prev,
                    { id, type: 'thinking', content: event.text, isComplete: false, startTime: Date.now() },
                  ]);
                } else {
                  const tid = currentThinkingIdRef.current;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === tid && m.type === 'thinking'
                        ? { ...m, content: m.content + event.text }
                        : m
                    )
                  );
                }
              }

              // Token events (assistant text or plan)
              if (event.type === 'token') {
                endThinking();
                planMarkdown += event.text;
                if (!currentTextIdRef.current) {
                  const id = `text-${Date.now()}`;
                  currentTextIdRef.current = id;
                  setMessages((prev) => [...prev, { id, type: 'assistant_text', content: event.text }]);
                } else {
                  const tid = currentTextIdRef.current;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === tid && m.type === 'assistant_text'
                        ? { ...m, content: m.content + event.text }
                        : m
                    )
                  );
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

              // Envelope with tool calls
              if (event.type === 'envelope') {
                if (event.envelope.tool_calls?.length) {
                  endThinking();
                  endText();
                  pendingToolCalls = event.envelope.tool_calls;
                  for (const call of event.envelope.tool_calls) {
                    setMessages((prev) => [
                      ...prev,
                      { id: `tool-${call.id}`, type: 'tool_call', call },
                    ]);
                  }
                }
                // Fallback message if no tokens were streamed
                const fallback = event.envelope.message?.trim();
                if (fallback && fallback !== 'Done.' && !planMarkdown && !sawAskUser && pendingToolCalls.length === 0) {
                  planMarkdown = fallback;
                  const id = `text-fallback-${Date.now()}`;
                  setMessages((prev) => [...prev, { id, type: 'assistant_text', content: fallback }]);
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

          // If no tool calls, break out of the loop
          if (pendingToolCalls.length === 0) break;

          // Execute tool calls and feed results back
          const { results } = await executeToolCalls(projectId, pendingToolCalls);
          toolCallHistoryRef.current = [...toolCallHistoryRef.current, ...pendingToolCalls];
          toolResultHistoryRef.current = [...toolResultHistoryRef.current, ...results];

          // Patch tool_call messages with results
          setMessages((prev) =>
            prev.map((m) => {
              if (m.type !== 'tool_call') return m;
              const result = results.find((r) => r.id === m.call.id);
              return result ? { ...m, result } : m;
            })
          );
        }

        // After streaming, check if we got a plan
        if (!sawAskUser && planMarkdown.trim() && PLAN_HEADING_RE.test(planMarkdown)) {
          endText();
          // Replace the assistant_text with a plan message
          setMessages((prev) => {
            const withoutPlanText = prev.filter(
              (m) => !(m.type === 'assistant_text' && PLAN_HEADING_RE.test(m.content))
            );
            return [
              ...withoutPlanText,
              { id: `plan-${Date.now()}`, type: 'plan', content: planMarkdown.trim() },
            ];
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : 'Stream failed';
          setMessages((prev) => [...prev, { id: `error-${Date.now()}`, type: 'error', message: msg }]);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [projectId, currentRound, selectedModel, shouldIncludeThoughts, reasoningEffort, endThinking, endText]
  );

  // Bootstrap: show a static welcome message — do NOT auto-stream.
  // The LLM is only invoked after the user sends their first message.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    setMessages([
      {
        id: 'welcome',
        type: 'assistant_text',
        content:
          "I've processed your uploaded files. What are you trying to achieve with this project?\n\nDescribe your goal — for example, *predict customer churn*, *classify images*, *forecast sales*, or *cluster user segments*.",
      },
    ]);

    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    setInputValue('');
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, type: 'user', content: text, timestamp: Date.now() },
    ]);

    // Use current round for the request, then advance for next interaction.
    // Round 0 = first user message (triggers data inspection + first questions).
    void requestStream(text, currentRound);
    setCurrentRound((prev) => Math.min(prev + 1, 5));
  }, [inputValue, isStreaming, currentRound, requestStream]);

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
    (planContent: string) => {
      const name = generatePlanName();
      setMessages((prev) =>
        prev.map((m) => (m.type === 'plan' ? { ...m, approved: true } : m))
      );
      onPlanApproved(planContent, name);
    },
    [onPlanApproved]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttachFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !projectId) {
      event.target.value = '';
      return;
    }

    const uploadedFile: UploadedFile = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: getFileType(file),
      uploadedAt: new Date(),
      projectId,
      file
    };

    addFile(uploadedFile);
    setAttachmentStatus('uploading');
    setAttachmentMessage(`Uploading ${file.name}...`);

    try {
      const response = await uploadDocument(projectId, file);
      setFileMetadata(uploadedFile.id, {
        documentId: response.document.documentId,
        chunkCount: response.document.chunkCount,
        embeddingDimension: response.document.embeddingDimension
      });
      setAttachmentStatus('success');
      setAttachmentMessage(`Added ${file.name} to context.`);
    } catch {
      setAttachmentStatus('error');
      setAttachmentMessage(`Failed to upload ${file.name}. Please try again.`);
    } finally {
      event.target.value = '';
      setTimeout(() => {
        setAttachmentStatus('idle');
        setAttachmentMessage(null);
      }, 3000);
    }
  }, [projectId, addFile, setFileMetadata]);

  return (
    <div className="flex h-full flex-col" data-testid="planning-stage">
      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="mx-auto max-w-3xl space-y-4 p-6">
          {messages.map((msg) => {
            if (msg.type === 'user') {
              return (
                <div key={msg.id} className="flex flex-col items-end">
                  <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              );
            }

            if (msg.type === 'assistant_text') {
              return (
                <div key={msg.id} className="rounded-md border border-muted/40 bg-muted/20 p-4 text-sm prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              );
            }

            if (msg.type === 'thinking') {
              return (
                <ThinkingBlock key={msg.id} content={msg.content} isComplete={msg.isComplete} />
              );
            }

            if (msg.type === 'tool_call') {
              return (
                <ToolIndicator
                  key={msg.id}
                  toolCalls={[msg.call]}
                  results={msg.result ? [msg.result] : []}
                  isRunning={!msg.result}
                />
              );
            }

            if (msg.type === 'ask_user' && !msg.answered) {
              return (
                <div key={msg.id} className="space-y-2">
                  <QuestionCards
                    questions={msg.questions}
                    onSubmit={(answers) => handleQuestionAnswer(msg.id, answers)}
                    disabled={isStreaming}
                  />
                </div>
              );
            }

            if (msg.type === 'ask_user' && msg.answered) {
              return (
                <Card key={msg.id} className="border-muted/40 bg-muted/10 opacity-60">
                  <CardContent className="p-3 text-xs text-muted-foreground italic">
                    Questions answered
                  </CardContent>
                </Card>
              );
            }

            if (msg.type === 'plan') {
              return (
                <div key={msg.id} className="space-y-3">
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                  {!msg.approved ? (
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleApprove(msg.content)}>
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        Approve Plan
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        or type below to request changes
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <Check className="h-4 w-4" />
                      Plan approved
                    </div>
                  )}
                </div>
              );
            }

            if (msg.type === 'error') {
              return (
                <div key={msg.id} className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {msg.message}
                </div>
              );
            }

            return null;
          })}

          {isStreaming && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="border-t bg-background p-4 shrink-0">
        <LlmChatComposer
          value={inputValue}
          onValueChange={setInputValue}
          onKeyDown={handleKeyDown}
          placeholder="Describe your goal or request changes..."
          disabled={isStreaming}
          isStreaming={isStreaming}
          onSend={handleSend}
          onStop={() => controllerRef.current?.abort()}
          model={selectedModel}
          onModelChange={setSelectedModel}
          modelOptions={ASSISTANT_MODEL_OPTIONS}
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={setReasoningEffort}
          reasoningOptions={reasoningEffortOptions}
          enableThinking={enableThinking}
          onToggleThinking={() => setEnableThinking((prev) => !prev)}
          leftSlot={(
            <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          metaSlot={(
            <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
              <Brain className="mr-1 h-3 w-3" />
              {documentFiles.length} docs
            </Badge>
          )}
          attachment={{
            onAttachFile: handleAttachFile,
            status: attachmentStatus,
            message: attachmentMessage
          }}
          maxWidthClassName="max-w-3xl"
        />
      </div>
    </div>
  );
}
