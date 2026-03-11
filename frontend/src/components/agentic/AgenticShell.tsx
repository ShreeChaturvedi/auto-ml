/**
 * AgenticShell - Split-pane layout with per-panel ribbons.
 *
 * Left panel:  domain toolbar ribbon + scrollable content + chat composer
 * Right panel: notebook toolbar ribbon + notebook cell editor
 *
 * Both ribbons sit at the same vertical position so they appear as a
 * single ribbon split by the resizable divider.
 */

import React, { useEffect, useState } from 'react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NotebookToolbar } from '@/components/notebook/NotebookToolbar';
import { NotebookEditor } from '@/components/notebook/NotebookEditor';
import { LlmChatComposer, type ChatInputConfig, type ModelConfig, type ReasoningConfig, type ComposerSlots } from '@/components/llm/LlmChatComposer';
import { useAgenticLoop } from '@/hooks/useAgenticLoop';
import { useNotebookStore } from '@/stores/notebookStore';
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

  const suggestions = domainAdapter.suggestionProvider(messages, isGenerating);
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

    const startRun = async () => {
      let preparedPrompt = trimmed;
      if (beforeSubmit) {
        const nextPrompt = await beforeSubmit(trimmed);
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
            
            <div className="border-t bg-background">
              {showModelSwitchPrompt ? (
                <div className="border-b px-4 py-2">
                  <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    <span className="font-medium">Model availability issue detected.</span>
                    <span className="text-amber-800">Switch model and retry?</span>
                    <div className="ml-auto flex flex-wrap gap-2">
                      {modelSwitchOptions.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            handleModelChange(option.value);
                            setDismissedModelPromptFor(modelSwitchError);
                          }}
                          disabled={isGenerating}
                        >
                          {option.label}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setDismissedModelPromptFor(modelSwitchError)}
                      >
                        Keep current
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              {composerStatusSlot ? (
                <div className="border-b px-4 py-2">
                  <div className="mx-auto w-full max-w-5xl">
                    {composerStatusSlot}
                  </div>
                </div>
              ) : null}
              {suggestions.length > 0 && !domainLockReason ? (
                <div className="min-w-0 overflow-x-auto px-4 py-2 scrollbar-hide">
                  <div className="flex min-w-max flex-nowrap gap-2">
                    {suggestions.map((suggestion) => (
                      <Button
                        key={suggestion.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => submitPrompt(suggestion.prompt)}
                        disabled={isGenerating}
                      >
                        {suggestion.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="p-4">
                <LlmChatComposer
                  chatInput={{
                    value: chatInput,
                    onValueChange: setChatInput,
                    onKeyDown: (e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submitPrompt(chatInput);
                      }
                    },
                    placeholder: "Ask the agent to plan, execute, and validate...",
                    disabled: isGenerating || !!domainLockReason,
                    isStreaming: isGenerating,
                    onSend: () => submitPrompt(chatInput),
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
                    reasoningOptions: reasoningEffortOptions,
                  } satisfies ReasoningConfig}
                  slots={{
                    metaSlot: chatMetaSlot,
                    maxWidthClassName: "max-w-5xl",
                  } satisfies ComposerSlots}
                />
              </div>
            </div>
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
