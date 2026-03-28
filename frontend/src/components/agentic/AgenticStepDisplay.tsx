/**
 * AgenticStepDisplay - Model-switch prompt, composer status, suggestions bar,
 * and chat composer footer extracted from AgenticShell.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { LlmChatComposer, type ChatInputConfig, type ModelConfig, type ReasoningConfig, type ComposerSlots, type MentionSlotConfig, type UsageConfig } from '@/components/llm/LlmChatComposer';
import { MentionDropdown } from '@/components/llm/MentionDropdown';
import { VoiceInputButton } from '@/components/llm/VoiceInputButton';
import type { MentionInputHandle } from '@/components/llm/MentionInput';
import type { MentionCandidate } from '@/hooks/useMentionAutocomplete';
import type { VoiceState } from '@/hooks/useVoiceInput';
import type { SuggestionPill } from '@/types/agentic';
import type { LlmUsage } from '@/types/llmUi';
import type {
  AssistantModelOption,
  ReasoningEffort,
  ReasoningEffortOption,
} from '@/components/llm/modelOptions';

export type ModelSwitchOption = AssistantModelOption;

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
  voiceConfig?: {
    state: VoiceState;
    analyserRef: React.RefObject<AnalyserNode | null>;
    onToggle: () => void;
    handleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => boolean;
    handleKeyUp: (event: React.KeyboardEvent<HTMLDivElement>) => boolean;
  };
  assistantModel: string;
  inlineModelOptions: AssistantModelOption[];
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  reasoningEffortOptions: ReasoningEffortOption[];
  sessionUsages: LlmUsage[];
  handleStop: () => void;
  chatMetaSlot?: React.ReactNode;

  /* Animated workflow placeholders */
  composerPlaceholders?: string[];

  /* Edit mode */
  editingMessageId?: string | null;
  onCancelEdit?: () => void;
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
  voiceConfig,
  assistantModel,
  inlineModelOptions,
  reasoningEffort,
  setReasoningEffort,
  reasoningEffortOptions,
  sessionUsages,
  handleStop,
  chatMetaSlot,
  composerPlaceholders,
  editingMessageId,
  onCancelEdit,
}: AgenticStepDisplayProps) {
  return (
    <div className="border-t bg-background">
      {editingMessageId ? (
        <div className="flex items-center justify-between border-b px-4 py-1.5 bg-muted/30">
          <span className="text-xs text-muted-foreground">Editing message</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={onCancelEdit}
          >
            Cancel
          </Button>
        </div>
      ) : null}
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
          <div className="flex flex-wrap gap-2">
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
                {suggestion.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="px-4 pb-4 pt-2"
        style={
          voiceConfig?.state === 'listening' && themeColor
            ? { '--voice-theme-color': themeColor } as React.CSSProperties
            : undefined
        }
        onKeyUp={(event) => {
          voiceConfig?.handleKeyUp(event);
        }}
      >
        <LlmChatComposer
          chatInput={{
            value: chatInput,
            onValueChange: (v) => mention.handleValueChange(v),
            onKeyDown: (e) => {
              if (mention.handleKeyDown(e as React.KeyboardEvent<HTMLDivElement>)) return;
              if (voiceConfig?.handleKeyDown(e as React.KeyboardEvent<HTMLDivElement>)) {
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitPrompt(chatInput);
              }
            },
            placeholder: "Ask the agent to plan, execute, and validate... (@ to mention files)",
            placeholders: composerPlaceholders,
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
            voiceSlot: voiceConfig ? (
              <div className="group/voice">
                <VoiceInputButton
                  state={voiceConfig.state}
                  analyserRef={voiceConfig.analyserRef}
                  onToggle={voiceConfig.onToggle}
                  themeColor={themeColor}
                  disabled={isGenerating || !!domainLockReason}
                />
              </div>
            ) : undefined,
            mentionSlot: {
              dropdown: (
                <MentionDropdown
                  isOpen={mention.isOpen}
                  filtered={mention.filtered}
                  activeIndex={mention.activeIndex}
                  anchorRef={mentionInputRef}
                  onSelect={mention.selectCandidate}
                />
              ),
              inputRef: mentionInputRef,
              mentionNames,
              mentionTypes,
              themeColor,
              voiceActive: voiceConfig?.state === 'listening',
              onValueChange: mention.handleValueChange,
            } satisfies MentionSlotConfig,
          } satisfies ComposerSlots}
        />
      </div>
    </div>
  );
}
