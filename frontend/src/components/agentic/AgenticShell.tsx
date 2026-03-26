/**
 * AgenticShell - Split-pane layout with per-panel ribbons.
 *
 * Left panel:  domain toolbar ribbon + scrollable content + chat composer
 * Right panel: notebook toolbar ribbon + notebook cell editor
 *
 * Both ribbons sit at the same vertical position so they appear as a
 * single ribbon split by the resizable divider.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotebookHeadings } from '@/hooks/useNotebookHeadings';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NotebookToolbar } from '@/components/notebook/NotebookToolbar';
import { NotebookEditor, type NotebookEditorHandle } from '@/components/notebook/NotebookEditor';
import type { MentionInputHandle } from '@/components/llm/MentionInput';
import { AgenticStepDisplay } from './AgenticStepDisplay';
import { useAgenticLoop } from '@/hooks/useAgenticLoop';
import { useSavepoints } from '@/hooks/useSavepoints';
import { useMentionAutocomplete, type MentionCandidate } from '@/hooks/useMentionAutocomplete';
import { useNotebookStore } from '@/stores/notebookStore';
import { useDataStore } from '@/stores/dataStore';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { useComposerVoiceInput } from '@/hooks/useComposerVoiceInput';
import { getTurnIndex, groupMessagesByTurn } from '@/lib/llm/turnUtils';
import type { DomainAdapter, LeftPaneRenderProps } from '@/types/agentic';
import type { SavepointDiff } from '@/types/savepoint';
import { useModelSelection } from '@/hooks/useModelSelection';

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
  /**
   * When set, this prompt is auto-submitted once the shell mounts
   * and the session is empty. The caller should clear the value after
   * passing it so it does not re-trigger.
   */
  initialPrompt?: string | null;
  /** Animated workflow placeholders for the chat composer */
  composerPlaceholders?: string[];
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
  renderLeftPane,
  initialPrompt,
  composerPlaceholders
}: AgenticShellProps) {
  const [chatInput, setChatInput] = useState('');
  const mentionInputRef = useRef<MentionInputHandle>(null);
  const editorRef = useRef<NotebookEditorHandle>(null);
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

  const { themeColor } = useProjectThemeColor();

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

  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);

  const notebookHeadings = useNotebookHeadings();

  const {
    messages,
    setMessages,
    isGenerating,
    error,
    sessionUsages,
    activeTextMessageId,
    activeThinkingMessageId,
    hydratedMessageIds,
    runLoop,
    handleStop,
    revertToTurn,
    editAndResend,
    editingMessageId,
    setEditingMessageId,
    registerSavepoint
  } = useAgenticLoop({
    projectId,
    storageKey,
    sessionVersion,
    domainAdapter,
    domainLockReason
  });

  const savepoints = useSavepoints();

  // Pre-fill composer when editing a message; exit edit mode if message was removed
  useEffect(() => {
    if (!editingMessageId) return;
    const msg = messages.find(m => m.id === editingMessageId);
    if (msg?.type === 'user') {
      setChatInput(msg.content);
    } else {
      setEditingMessageId(null);
      setChatInput('');
    }
  }, [editingMessageId, messages, setEditingMessageId]);

  const handleEditMessage = useCallback((messageId: string) => {
    setEditingMessageId(messageId);
  }, [setEditingMessageId]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setChatInput('');
  }, [setEditingMessageId]);

  const { clearAfter: savepointsClearAfter, getDiff: savepointsGetDiff } = savepoints;

  const handleRevertToMessage = useCallback((messageId: string) => {
    const turnIdx = getTurnIndex(messages, messageId);
    if (turnIdx === -1) return;
    revertToTurn(turnIdx);
    if (activeNotebookId) {
      void savepointsClearAfter(activeNotebookId, turnIdx);
    }
  }, [messages, revertToTurn, activeNotebookId, savepointsClearAfter]);

  const handleRetryWorkflow = useCallback(() => {
    if (isGenerating || !projectId) return;
    // Strip trailing error messages
    setMessages((prev) => {
      const trimmed = [...prev];
      while (trimmed.length > 0 && trimmed[trimmed.length - 1].type === 'error') {
        trimmed.pop();
      }
      return trimmed;
    });
    // Re-run with empty prompt (won't add a user message) to retry the workflow turn
    void runLoop('', { model: assistantModel, reasoningEffort });
  }, [isGenerating, projectId, setMessages, runLoop, assistantModel, reasoningEffort]);

  // Fetch turn diffs only after streaming completes (not during token-by-token updates)
  const [turnDiffs, setTurnDiffs] = useState<ReadonlyMap<string, SavepointDiff>>(new Map());
  useEffect(() => {
    if (!activeNotebookId || isGenerating) return;
    const turns = groupMessagesByTurn(messages);
    if (turns.length === 0) return;
    let cancelled = false;

    const fetchDiffs = async () => {
      const entries = await Promise.all(
        turns.map(async (turn) => {
          const diff = await savepointsGetDiff(activeNotebookId, turn.turnIndex);
          const lastResponse = turn.responses[turn.responses.length - 1];
          return diff && lastResponse ? [lastResponse.id, diff] as const : null;
        })
      );
      if (cancelled) return;
      const newDiffs = new Map<string, SavepointDiff>();
      for (const entry of entries) {
        if (entry) newDiffs.set(entry[0], entry[1]);
      }
      setTurnDiffs(newDiffs);
    };

    void fetchDiffs();
    return () => { cancelled = true; };
  }, [activeNotebookId, isGenerating, messages, savepointsGetDiff]);

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

    // If editing, do editAndResend instead
    if (editingMessageId) {
      setEditingMessageId(null);
      editAndResend(editingMessageId, trimmed, {
        model: assistantModel,
        reasoningEffort
      });
      setChatInput('');
      mention.dismiss();
      return;
    }

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

      // Create savepoint in background (fire-and-forget to avoid blocking UX)
      const turnIndex = messages.filter(m => m.type === 'user').length;
      const userMsgId = `user-${Date.now()}`;
      if (activeNotebookId) {
        void savepoints.createSavepoint(activeNotebookId, turnIndex, userMsgId).then(sp => {
          if (sp) registerSavepoint(turnIndex, sp.savepointId);
        });
      }

      // Show message immediately — don't wait for savepoint API
      setChatInput('');
      mention.dismiss();
      void runLoop(preparedPrompt, {
        model: assistantModel,
        reasoningEffort
      }, undefined, undefined, userMsgId);
    };

    void startRun();
  };

  // Auto-submit an initial prompt once when the session is empty
  const initialPromptFiredRef = useRef(false);
  useEffect(() => {
    if (!initialPrompt || initialPromptFiredRef.current || messages.length > 0 || isGenerating) {
      return;
    }
    initialPromptFiredRef.current = true;
    // Defer to next tick so all shell state is settled
    const id = window.setTimeout(() => submitPrompt(initialPrompt), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount when conditions are met
  }, [initialPrompt, messages.length, isGenerating]);

  const leftPaneRenderProps: LeftPaneRenderProps = {
    messages,
    isGenerating,
    error,
    activeTextMessageId,
    activeThinkingMessageId,
    hydratedMessageIds,
    onEditMessage: handleEditMessage,
    onRevertToMessage: handleRevertToMessage,
    editingMessageId,
    turnDiffs,
    onRetryWorkflow: handleRetryWorkflow
  };

  const leftPaneContent = renderLeftPane
    ? renderLeftPane(leftPaneRenderProps)
    : LeftPaneComponent
      ? <LeftPaneComponent {...leftPaneRenderProps} />
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
              composerPlaceholders={composerPlaceholders}
              editingMessageId={editingMessageId}
              onCancelEdit={handleCancelEdit}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Right panel: notebook ribbon + cells ── */}
        <ResizablePanel defaultSize={52} minSize={30}>
          <div className="flex h-full flex-col">
            <NotebookToolbar
              projectId={projectId}
              headings={notebookHeadings}
              onScrollToHeading={(slug) => editorRef.current?.scrollToHeading(slug)}
            />
            <NotebookEditor ref={editorRef} projectId={projectId} className="min-h-0 flex-1" />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
