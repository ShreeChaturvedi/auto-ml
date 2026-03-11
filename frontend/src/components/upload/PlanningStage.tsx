import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/ui/Markdown';
import { Brain, Check, Database, FileText, Loader2 } from 'lucide-react';

import { LlmChatComposer, type ChatInputConfig, type ModelConfig, type ReasoningConfig, type ComposerSlots } from '@/components/llm/LlmChatComposer';
import { useModelSelection } from '@/hooks/useModelSelection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessageList } from '@/components/llm/ChatMessageList';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { QuestionCards } from './QuestionCards';
import { projectColorClasses } from '@/types/project';
import { buildInitialSuggestions, buildFollowUpSuggestions, toPlanPath } from './planningUtils';
import { usePlanningChat } from './hooks/usePlanningChat';
import { useAttachmentUploader, CONTEXT_ATTACHMENT_ACCEPT } from './hooks/useAttachmentUploader';
import { CenteredSuggestionPills, FollowUpSuggestionPills } from './PlanSuggestionPills';

interface PlanningStageProps {
  projectId: string;
  onPlanApproved: (plan: string, planName: string) => void;
}

export function PlanningStage({ projectId, onPlanApproved }: PlanningStageProps) {
  const files = useDataStore((state) => state.files);
  const projects = useProjectStore((state) => state.projects);

  const {
    selectedModel,
    reasoningEffort,
    inlineModelOptions,
    reasoningEffortOptions,
    handleModelChange,
    setReasoningEffort
  } = useModelSelection();

  const {
    pendingAttachments,
    attachmentStatus,
    attachmentMessage,
    composerAttachmentItems,
    uploadPendingAttachments,
    handleAttachFile,
    handleRemoveAttachment,
    handleRetryAttachment,
  } = useAttachmentUploader({ projectId });

  const pendingAttachmentsCount = pendingAttachments.filter(
    (a) => a.status === 'queued' || a.status === 'error'
  ).length;

  const {
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
  } = usePlanningChat({
    projectId,
    selectedModel,
    reasoningEffort,
    uploadPendingAttachments,
    pendingAttachmentsCount,
    onPlanApproved,
  });

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const project = useMemo(() => projects.find((entry) => entry.id === projectId), [projectId, projects]);
  const projectColor = project?.color ?? 'blue';
  const projectColorClass = projectColorClasses[projectColor];
  const projectFiles = useMemo(
    () => files.filter((file) => file.projectId === projectId),
    [files, projectId]
  );
  const documentFiles = useMemo(
    () => projectFiles.filter((file) => file.metadata?.documentId),
    [projectFiles]
  );
  const hasUserMessages = useMemo(
    () => messages.some((message) => message.type === 'user'),
    [messages]
  );

  const showCenteredSuggestions = !hasUserMessages && !isStreaming && messages.length === 0;
  const centeredSuggestions = useMemo(
    () => (!hasUserMessages
      ? buildInitialSuggestions(projectFiles, project?.title, project?.description)
      : []),
    [hasUserMessages, project?.description, project?.title, projectFiles]
  );
  const followUpSuggestions = useMemo(
    () => (
      hasUserMessages && !isStreaming
        ? buildFollowUpSuggestions(messages, projectFiles, project?.title, project?.description)
        : []
    ),
    [hasUserMessages, isStreaming, messages, project?.description, project?.title, projectFiles]
  );

  // Auto-scroll on new messages
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) {
      return;
    }

    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isStreaming]);

  return (
    <div className="flex h-full flex-col bg-background" data-testid="planning-stage">
      {/* Messages area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
        {showCenteredSuggestions && centeredSuggestions.length > 0 ? (
          <CenteredSuggestionPills
            suggestions={centeredSuggestions}
            isStreaming={isStreaming}
            onSuggestionClick={handleSuggestionClick}
          />
        ) : (
          <ChatMessageList
            messages={messages}
            activeTextMessageId={activeTextMessageId}
            activeThinkingMessageId={activeThinkingMessageId}
            className="w-full space-y-6 p-6 pb-12"
            renderExtra={(msg) => {
            if (msg.type === 'user') {
              const attachedFiles = userMessageAttachments[msg.id] ?? [];
              return (
                <div key={msg.id} className="flex flex-col items-end">
                  <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                    {msg.content}
                    {attachedFiles.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {attachedFiles.map((file) => (
                          <div
                            key={`${msg.id}-${file.name}`}
                            className="rounded-md border border-primary/30 bg-background/80 px-2 py-1.5 text-[11px] text-foreground"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 font-medium">
                                {file.kind === 'dataset' ? <Database className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                                {file.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {file.kind === 'dataset'
                                  ? `${file.nRows ?? 0} rows · ${file.nCols ?? 0} cols`
                                  : `${file.chunkCount ?? 0} chunks`}
                              </span>
                            </div>
                            {file.sample && file.sample.length > 0 ? (
                              <div className="mt-1 rounded border border-border/50 bg-muted/40 px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                                {Object.entries(file.sample[0]).slice(0, 3).map(([key, value], idx) => (
                                  <span key={key}>
                                    {idx > 0 ? ' · ' : ''}
                                    {key}: {String(value)}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
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
              if (msg.hidden && !msg.approved) {
                return null;
              }

              const planPath = toPlanPath(msg.planName);
              const isEditing = editingPlanId === msg.id;
              const draftValue = planDrafts[msg.id] ?? msg.content;

              return (
                <div key={msg.id} className="space-y-3 animate-in fade-in zoom-in-95 duration-300">
                  <div className={cn(
                    "overflow-hidden rounded-lg transition-all",
                    isEditing
                      ? "border border-primary/50 shadow-sm ring-1 ring-primary/20 bg-background"
                      : "border border-primary/30 bg-primary/5 hover:border-primary/50"
                  )}>
                    <div className={cn(
                      "flex items-center justify-between border-b px-3 py-1.5",
                      isEditing ? "bg-muted/30 border-primary/20" : "border-primary/20 bg-muted/40"
                    )}>
                      <div className="font-mono text-[11px] text-muted-foreground" title={planPath}>
                        <span className="block truncate">{planPath}</span>
                      </div>
                      {isEditing && (
                        <div className="text-[10px] uppercase tracking-wider text-primary font-medium">
                          Editing Mode
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <textarea
                        value={draftValue}
                        onChange={(event) => {
                          setPlanDrafts((prev) => ({ ...prev, [msg.id]: event.target.value }));
                        }}
                        aria-label={`Edit plan ${planPath}`}
                        className="min-h-[350px] w-full resize-y bg-transparent px-4 py-4 font-mono text-sm leading-relaxed outline-none"
                        placeholder="Edit the proposed plan here..."
                        data-testid={`plan-editor-${msg.id}`}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartPlanEdit(msg.id, msg.content)}
                        className="w-full text-left p-4 outline-none focus-visible:bg-primary/10 transition-colors"
                        data-testid={`plan-view-${msg.id}`}
                        title="Click to edit this plan manually"
                      >
                        <Markdown className="prose prose-sm max-w-none dark:prose-invert">
                          {msg.content}
                        </Markdown>
                      </button>
                    )}
                  </div>
                  {!msg.approved ? (
                    <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleCancelPlanEdit(msg.id, msg.content)}>
                              Cancel
                            </Button>
                            <Button size="sm" variant="default" onClick={() => handleSavePlanEdit(msg.id)}>
                              Save Edit
                            </Button>
                          </>
                        ) : null}
                        {!isEditing ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn('gap-1.5', projectColorClass.bg, projectColorClass.border, projectColorClass.hover, projectColorClass.text)}
                            onClick={() => handleApprove(msg.content, msg.planName, msg.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve Plan
                          </Button>
                        ) : null}
                      </div>
                      {!isEditing && (
                        <span className="text-xs text-muted-foreground italic">
                          Click the plan above to edit, or ask for changes below
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
                      projectColorClass.bg,
                      projectColorClass.border,
                      projectColorClass.text,
                    )}>
                      <Check className="h-4 w-4" />
                      Plan approved
                    </div>
                  )}
                </div>
              );
            }

            return null;
            }}
          />
        )}

        {isStreaming && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-6">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </div>
        )}
      </ScrollArea>

      <div className="shrink-0 border-t bg-background">
        {hasUserMessages && followUpSuggestions.length > 0 ? (
          <FollowUpSuggestionPills
            suggestions={followUpSuggestions}
            isStreaming={isStreaming}
            onSuggestionClick={handleSuggestionClick}
          />
        ) : null}

        <div className="px-4 pt-2 pb-4">
          <LlmChatComposer
            chatInput={{
              value: inputValue,
              onValueChange: setInputValue,
              onKeyDown: handleKeyDown,
              placeholder: "Describe your goal or request changes...",
              disabled: isStreaming,
              isStreaming,
              onSend: handleSend,
              onStop: () => controllerRef.current?.abort(),
            } satisfies ChatInputConfig}
            modelConfig={{
              model: selectedModel,
              onModelChange: handleModelChange,
              modelOptions: inlineModelOptions,
            } satisfies ModelConfig}
            reasoningConfig={{
              reasoningEffort,
              onReasoningEffortChange: setReasoningEffort,
              reasoningOptions: reasoningEffortOptions,
            } satisfies ReasoningConfig}
            slots={{
              metaSlot: (
                <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
                  <Brain className="mr-1 h-3 w-3" />
                  {documentFiles.length} docs
                </Badge>
              ),
              attachment: {
                onAttachFile: handleAttachFile,
                status: attachmentStatus,
                message: attachmentMessage,
                items: composerAttachmentItems,
                onRemoveItem: handleRemoveAttachment,
                onRetryItem: handleRetryAttachment,
                accept: CONTEXT_ATTACHMENT_ACCEPT,
              },
              maxWidthClassName: "max-w-5xl",
            } satisfies ComposerSlots}
          />
        </div>
      </div>
    </div>
  );
}
