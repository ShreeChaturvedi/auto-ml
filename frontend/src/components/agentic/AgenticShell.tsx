import React, { useState } from 'react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NotebookEditor } from '@/components/notebook/NotebookEditor';
import { LlmChatComposer } from '@/components/llm/LlmChatComposer';
import { useAgenticLoop } from '@/hooks/useAgenticLoop';
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
  storageKey: string;
  domainLockReason?: string;
  LeftPaneComponent: React.ComponentType<{ messages: ChatMessage[], isGenerating: boolean, error: string | null }>;
}

export function AgenticShell({
  projectId,
  domainAdapter,
  toolbarLeft,
  toolbarRight,
  chatMetaSlot,
  storageKey,
  domainLockReason,
  LeftPaneComponent
}: AgenticShellProps) {
  const [chatInput, setChatInput] = useState('');
  const [assistantModel, setAssistantModel] = useState(ASSISTANT_MODEL_OPTIONS[0].value);
  const [enableThinking, setEnableThinking] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    getDefaultReasoningEffort(ASSISTANT_MODEL_OPTIONS[0].value)
  );

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
    
    void runLoop(trimmed, {
      model: assistantModel,
      enableThinking,
      thinkingLevel: reasoningEffort
    });
    setChatInput('');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex h-14 items-center justify-between gap-4 border-b px-4 shrink-0">
        <div className="flex items-center gap-3">
          {toolbarLeft}
        </div>
        <div className="flex items-center gap-2">
          {toolbarRight}
        </div>
      </div>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={48} minSize={30}>
          <div className="flex h-full min-h-0 flex-col">
            <ScrollArea className="flex-1">
              {<LeftPaneComponent messages={messages} isGenerating={isGenerating} error={error} />}
            </ScrollArea>
            
            <div className="border-t bg-background">
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

        <ResizablePanel defaultSize={52} minSize={30}>
          <NotebookEditor projectId={projectId} className="h-full" />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
