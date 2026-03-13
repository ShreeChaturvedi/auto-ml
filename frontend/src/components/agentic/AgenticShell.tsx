/**
 * AgenticShell - Split-pane layout with per-panel ribbons.
 *
 * Left panel:  domain toolbar ribbon + scrollable content + chat composer
 * Right panel: notebook toolbar ribbon + notebook cell editor
 *
 * Both ribbons sit at the same vertical position so they appear as a
 * single ribbon split by the resizable divider.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NotebookToolbar } from '@/components/notebook/NotebookToolbar';
import { NotebookEditor } from '@/components/notebook/NotebookEditor';
import type { MentionInputHandle } from '@/components/llm/MentionInput';
import { AgenticStepDisplay } from './AgenticStepDisplay';
import { useAgenticLoop } from '@/hooks/useAgenticLoop';
import { useMentionAutocomplete, type MentionCandidate } from '@/hooks/useMentionAutocomplete';
import { useNotebookStore } from '@/stores/notebookStore';
import { useDataStore } from '@/stores/dataStore';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { useComposerVoiceInput } from '@/hooks/useComposerVoiceInput';
import type { DomainAdapter } from '@/types/agentic';
import type { ChatMessage } from '@/types/llmUi';
import { useModelSelection } from '@/hooks/useModelSelection';

type LeftPaneRenderProps = {
  messages: ChatMessage[];
  isGenerating: boolean;
  error: string | null;
  activeTextMessageId: string | null;
  activeThinkingMessageId: string | null;
  hydratedMessageIds: Set<string>;
};

interface AgenticShellProps {
  projectId: string;
  domainAdapter: DomainAdapter;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  chatMetaSlot?: React.ReactNode;
  composerStatusSlot?: React.ReactNode;
  storageKey: string;
  sessionVersion?: number;
  domainLockReason?: string;
  beforeSubmit?: (prompt: string) => Promise<string | null>;
  leftPaneScrollable?: boolean;
  LeftPaneComponent?: React.ComponentType<LeftPaneRenderProps>;
  renderLeftPane?: (props: LeftPaneRenderProps) => React.ReactNode;
}

export function AgenticShell({
  projectId,
  domainAdapter,
  toolbarLeft,
  toolbarRight,
  chatMetaSlot,
  composerStatusSlot,
  storageKey,
  sessionVersion = 0,
  domainLockReason,
  beforeSubmit,
  leftPaneScrollable = true,
  LeftPaneComponent,
  renderLeftPane
}: AgenticShellProps) {
  const [chatInput, setChatInput] = useState('');
  const mentionInputRef = useRef<MentionInputHandle>(null);
  const {
    selectedModel: assistantModel,
    reasoningEffort,
    inlineModelOptions,
    reasoningEffortOptions,
    dismissedModelPromptFor,
    setDismissedModelPromptFor,
    handleModelChange,
    setReasoningEffort
  } = useModelSelection();

  const files = useDataStore((s) => s.files);
  const mentionCandidates = useMemo<MentionCandidate[]>(
    () =>
      files
        .filter((f) => f.projectId === projectId)
        .map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          meta: {
            datasetId: f.metadata?.datasetId,
            documentId: f.metadata?.documentId
          }
        })),
    [files, projectId]
  );

  const mentionNames = useMemo(
    () => new Set(mentionCandidates.map((c) => c.name.toLowerCase())),
    [mentionCandidates]
  );

  const mentionTypes = useMemo(
    () => new Map(mentionCandidates.map((c) => [c.name.toLowerCase(), c.type])),
    [mentionCandidates]
  );

  const { themeColor, themeColorClass } = useProjectThemeColor(projectId);

  const mention = useMentionAutocomplete({
    candidates: mentionCandidates,
    value: chatInput,
    onValueChange: setChatInput,
    inputRef: mentionInputRef
  });

  const initializeNotebook = useNotebookStore((s) => s.initializeNotebook);
  const disconnectNotebook = useNotebookStore((s) => s.disconnect);

  useEffect(() => {
    if (projectId) initializeNotebook(projectId);
    return () => disconnectNotebook();
  }, [projectId, initializeNotebook, disconnectNotebook]);

  const {
    messages,
    isGenerating,
    error,
    sessionUsages,
    activeTextMessageId,
    activeThinkingMessageId,
    hydratedMessageIds,
    runLoop,
    handleStop
  } = useAgenticLoop({
    projectId,
    storageKey,
    sessionVersion,
    domainAdapter,
    domainLockReason
  });

  const {
    state: voiceState,
    analyserRef: voiceAnalyserRef,
    toggleRecording: voiceToggle,
    handlePushToTalkKeyDown,
    handlePushToTalkKeyUp,
  } = useComposerVoiceInput({
    value: chatInput,
    inputRef: mentionInputRef,
    onValueChange: mention.handleValueChange,
    disabled: isGenerating,
  });

  const suggestions = useMemo(
    () => domainAdapter.suggestionProvider(messages, isGenerating),
    [domainAdapter, messages, isGenerating]
  );
  const modelSwitchError = error && error.toLowerCase().includes('choose a different model')
    ? error
    : null;
  const modelSwitchOptions = inlineModelOptions
    .filter((option) => option.value !== assistantModel);
  const showModelSwitchPrompt = Boolean(modelSwitchError && dismissedModelPromptFor !== modelSwitchError);

  useEffect(() => {
    if (!modelSwitchError) {
      setDismissedModelPromptFor(null);
    }
  }, [modelSwitchError, setDismissedModelPromptFor]);

  const submitPrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || !projectId || isGenerating || domainLockReason) return;

    // Capture mentions before clearing input
    const currentMentions = mention.resolvedMentions;

    const startRun = async () => {
      let preparedPrompt = trimmed;

      // Append file mention context
      if (currentMentions.length > 0) {
        const fileList = currentMentions.map((m) => m.name).join(', ');
        preparedPrompt += `\n\n[Referenced files: ${fileList}]`;
      }

      if (beforeSubmit) {
        const nextPrompt = await beforeSubmit(preparedPrompt);
        if (!nextPrompt?.trim()) {
          return;
        }
        preparedPrompt = nextPrompt.trim();
      }

      if (!projectId || isGenerating || domainLockReason) {
        return;
      }

      void runLoop(preparedPrompt, {
        model: assistantModel,
        reasoningEffort
      });
      setChatInput('');
      mention.dismiss();
    };

    void startRun();
  };

  const leftPaneContent = renderLeftPane
    ? renderLeftPane({
      messages,
      isGenerating,
      error,
      activeTextMessageId,
      activeThinkingMessageId,
      hydratedMessageIds
    })
    : LeftPaneComponent
      ? (
        <LeftPaneComponent
          messages={messages}
          isGenerating={isGenerating}
          error={error}
          activeTextMessageId={activeTextMessageId}
          activeThinkingMessageId={activeThinkingMessageId}
          hydratedMessageIds={hydratedMessageIds}
        />
      )
      : null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* ── Left panel: domain ribbon + content + chat ── */}
        <ResizablePanel defaultSize={48} minSize={30}>
          <div className="flex h-full min-h-0 flex-col">
            {/* Left ribbon */}
            <div className="flex h-14 items-center justify-between gap-3 border-b px-3 shrink-0">
              <div className="flex min-w-0 items-center gap-3">
                {toolbarLeft}
              </div>
              <div className="flex items-center gap-2">
                {toolbarRight}
              </div>
            </div>

            {leftPaneScrollable ? (
              <ScrollArea className="flex-1">
                {leftPaneContent}
              </ScrollArea>
            ) : (
              <div className="min-h-0 flex-1">
                {leftPaneContent}
              </div>
            )}

            <AgenticStepDisplay
              showModelSwitchPrompt={showModelSwitchPrompt}
              modelSwitchError={modelSwitchError}
              modelSwitchOptions={modelSwitchOptions}
              handleModelChange={handleModelChange}
              setDismissedModelPromptFor={setDismissedModelPromptFor}
              isGenerating={isGenerating}
              composerStatusSlot={composerStatusSlot}
              suggestions={suggestions}
              domainLockReason={domainLockReason}
              submitPrompt={submitPrompt}
              chatInput={chatInput}
              mention={mention}
              mentionInputRef={mentionInputRef}
              mentionNames={mentionNames}
              mentionTypes={mentionTypes}
              themeColor={themeColor}
              themeColorClass={themeColorClass}
              voiceConfig={{
                state: voiceState,
                analyserRef: voiceAnalyserRef,
                onToggle: voiceToggle,
                handleKeyDown: handlePushToTalkKeyDown,
                handleKeyUp: handlePushToTalkKeyUp,
              }}
              assistantModel={assistantModel}
              inlineModelOptions={inlineModelOptions}
              reasoningEffort={reasoningEffort}
              setReasoningEffort={setReasoningEffort}
              reasoningEffortOptions={reasoningEffortOptions}
              sessionUsages={sessionUsages}
              handleStop={handleStop}
              chatMetaSlot={chatMetaSlot}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Right panel: notebook ribbon + cells ── */}
        <ResizablePanel defaultSize={52} minSize={30}>
          <div className="flex h-full flex-col">
            <NotebookToolbar projectId={projectId} />
            <NotebookEditor projectId={projectId} className="min-h-0 flex-1" />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
