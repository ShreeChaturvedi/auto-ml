/**
 * AgenticStepDisplay - Model-switch prompt, composer status, suggestions bar,
 * and chat composer footer extracted from AgenticShell.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { LlmChatComposer, type ChatInputConfig, type ModelConfig, type ReasoningConfig, type ComposerSlots, type MentionSlotConfig, type UsageConfig } from '@/components/llm/LlmChatComposer';
import { MentionDropdown } from '@/components/llm/MentionDropdown';
import type { MentionInputHandle } from '@/components/llm/MentionInput';
import type { MentionCandidate } from '@/hooks/useMentionAutocomplete';
import type { SuggestionPill } from '@/types/agentic';
import type { LlmUsage } from '@/types/llmUi';

export interface ModelSwitchOption {
  value: string;
  label: string;
}

export interface AgenticStepDisplayProps {
  /* Model switch prompt */
  showModelSwitchPrompt: boolean;
  modelSwitchError: string | null;
  modelSwitchOptions: ModelSwitchOption[];
  handleModelChange: (model: string) => void;
  setDismissedModelPromptFor: (error: string | null) => void;
  isGenerating: boolean;

  /* Composer status */
  composerStatusSlot?: React.ReactNode;

  /* Suggestions */
  suggestions: SuggestionPill[];
  domainLockReason?: string;
  submitPrompt: (prompt: string) => void;

  /* Chat composer */
  chatInput: string;
  mention: {
    isOpen: boolean;
    filtered: MentionCandidate[];
    activeIndex: number;
    handleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => boolean;
    handleValueChange: (newValue: string, cursorPos?: number) => void;
    selectCandidate: (candidate: MentionCandidate) => void;
  };
  mentionInputRef: React.RefObject<MentionInputHandle | null>;
  mentionNames: Set<string>;
  mentionTypes: Map<string, string>;
  themeColor?: string;
  themeColorClass?: string;
  assistantModel: string;
  inlineModelOptions: ModelSwitchOption[];
  reasoningEffort: string;
  setReasoningEffort: (effort: string) => void;
  reasoningEffortOptions: ModelSwitchOption[];
  sessionUsages: LlmUsage[];
  handleStop: () => void;
  chatMetaSlot?: React.ReactNode;
}

export function AgenticStepDisplay({
  showModelSwitchPrompt,
  modelSwitchError,
  modelSwitchOptions,
  handleModelChange,
  setDismissedModelPromptFor,
  isGenerating,
  composerStatusSlot,
  suggestions,
  domainLockReason,
  submitPrompt,
  chatInput,
  mention,
  mentionInputRef,
  mentionNames,
  mentionTypes,
  themeColor,
  themeColorClass,
  assistantModel,
  inlineModelOptions,
  reasoningEffort,
  setReasoningEffort,
  reasoningEffortOptions,
  sessionUsages,
  handleStop,
  chatMetaSlot,
}: AgenticStepDisplayProps) {
  return (
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
      {composerStatusSlot}
      {suggestions.length > 0 && !domainLockReason ? (
        <div className="min-w-0 overflow-x-auto px-4 pt-2 scrollbar-hide">
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

      <div className="px-4 pb-4 pt-2">
        <LlmChatComposer
          chatInput={{
            value: chatInput,
            onValueChange: (v) => mention.handleValueChange(v),
            onKeyDown: (e) => {
              if (mention.handleKeyDown(e as React.KeyboardEvent<HTMLDivElement>)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitPrompt(chatInput);
              }
            },
            placeholder: "Ask the agent to plan, execute, and validate... (@ to mention files)",
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
          usageConfig={{
            sessionUsages,
            model: assistantModel,
          } satisfies UsageConfig}
          slots={{
            metaSlot: chatMetaSlot,
            maxWidthClassName: "max-w-5xl",
            mentionSlot: {
              dropdown: (
                <MentionDropdown
                  isOpen={mention.isOpen}
                  filtered={mention.filtered}
                  activeIndex={mention.activeIndex}
                  anchorRef={mentionInputRef}
                  onSelect={mention.selectCandidate}
                  themeColorClass={themeColorClass}
                />
              ),
              inputRef: mentionInputRef,
              mentionNames,
              mentionTypes,
              themeColor,
              onValueChange: mention.handleValueChange,
            } satisfies MentionSlotConfig,
          } satisfies ComposerSlots}
        />
      </div>
    </div>
  );
}
