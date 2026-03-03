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
import { LlmChatComposer } from '@/components/llm/LlmChatComposer';
import { useAgenticLoop } from '@/hooks/useAgenticLoop';
import { useNotebookStore } from '@/stores/notebookStore';
import type { DomainAdapter } from '@/types/agentic';
import type { ChatMessage } from '@/types/llmUi';
import { ASSISTANT_MODEL_OPTIONS, getDefaultReasoningEffort, getReasoningEffortOptions, type ReasoningEffort } from '@/components/llm/modelOptions';
import { Sparkles } from 'lucide-react';

interface AgenticShellProps {
  projectId: string;
  domainAdapter: DomainAdapter;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  chatMetaSlot?: React.ReactNode;
  composerStatusSlot?: React.ReactNode;
  storageKey: string;
  domainLockReason?: string;
  beforeSubmit?: (prompt: string) => Promise<string | null>;
  leftPaneScrollable?: boolean;
  LeftPaneComponent?: React.ComponentType<{ messages: ChatMessage[], isGenerating: boolean, error: string | null }>;
  renderLeftPane?: (props: { messages: ChatMessage[]; isGenerating: boolean; error: string | null }) => React.ReactNode;
}

export function AgenticShell({
  projectId,
  domainAdapter,
  toolbarLeft,
  toolbarRight,
  chatMetaSlot,
  composerStatusSlot,
  storageKey,
  domainLockReason,
  beforeSubmit,
  leftPaneScrollable = true,
  LeftPaneComponent,
  renderLeftPane
}: AgenticShellProps) {
  const [chatInput, setChatInput] = useState('');
  const [assistantModel, setAssistantModel] = useState(ASSISTANT_MODEL_OPTIONS[0].value);
  const [enableThinking, setEnableThinking] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    getDefaultReasoningEffort(ASSISTANT_MODEL_OPTIONS[0].value)
  );

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
    runLoop,
    handleStop
  } = useAgenticLoop({
    projectId,
    storageKey,
    domainAdapter,
    domainLockReason
  });

  const suggestions = domainAdapter.suggestionProvider(messages, isGenerating);

  const handleModelChange = (model: string) => {
    setAssistantModel(model);
    setReasoningEffort(getDefaultReasoningEffort(model));
  };

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
        enableThinking,
        thinkingLevel: reasoningEffort
      });
      setChatInput('');
    };

    void startRun();
  };

  const leftPaneContent = renderLeftPane
    ? renderLeftPane({ messages, isGenerating, error })
    : LeftPaneComponent
      ? <LeftPaneComponent messages={messages} isGenerating={isGenerating} error={error} />
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
              {composerStatusSlot ? (
                <div className="border-b px-4 py-2">
                  <div className="mx-auto w-full max-w-5xl">
                    {composerStatusSlot}
                  </div>
                </div>
              ) : null}
              {suggestions.length > 0 && !domainLockReason ? (
                <div className="border-b px-4 py-2">
                  <div className="mx-auto flex max-w-5xl flex-wrap gap-2">
                    {suggestions.map((suggestion) => (
                      <Button
                        key={suggestion.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => submitPrompt(suggestion.prompt)}
                        disabled={isGenerating}
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" />
                        {suggestion.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="p-4">
                <LlmChatComposer
                  value={chatInput}
                  onValueChange={setChatInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitPrompt(chatInput);
                    }
                  }}
                  placeholder="Ask the agent to plan, execute, and validate..."
                  disabled={isGenerating || !!domainLockReason}
                  isStreaming={isGenerating}
                  onSend={() => submitPrompt(chatInput)}
                  onStop={handleStop}
                  model={assistantModel}
                  onModelChange={handleModelChange}
                  modelOptions={ASSISTANT_MODEL_OPTIONS}
                  reasoningEffort={reasoningEffort}
                  onReasoningEffortChange={setReasoningEffort}
                  reasoningOptions={getReasoningEffortOptions(assistantModel)}
                  enableThinking={enableThinking}
                  onToggleThinking={() => setEnableThinking(prev => !prev)}
                  metaSlot={chatMetaSlot}
                  maxWidthClassName="max-w-5xl"
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
