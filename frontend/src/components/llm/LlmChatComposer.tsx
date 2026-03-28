import { useRef, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';

import { MentionInput, type MentionInputHandle } from '@/components/llm/MentionInput';
import type { LlmUsage } from '@/types/llmUi';

import { useMetallicBorder } from '@/hooks/useMetallicBorder';
import {
  ArrowUp,
  CornerDownLeft,
  Loader2,
  Paperclip,
  Square
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  type AssistantModelOption,
  type ReasoningEffort,
  type ReasoningEffortOption
} from './modelOptions';
import { ComposerModelBar } from './ComposerModelBar';
import { ComposerAttachments } from './ComposerAttachments';

export type AttachmentStatus = 'idle' | 'queued' | 'uploading' | 'success' | 'error';

export interface ComposerAttachmentItem {
  id: string;
  name: string;
  status: Exclude<AttachmentStatus, 'idle'>;
  message?: string | null;
}

export interface AttachmentConfig {
  onAttachFile: (event: ChangeEvent<HTMLInputElement>) => void;
  status: AttachmentStatus;
  message: string | null;
  accept?: string;
  items?: ComposerAttachmentItem[];
  onRemoveItem?: (itemId: string) => void;
  onRetryItem?: (itemId: string) => void;
}

/** Controls the textarea input, send/stop actions, and disabled/streaming state. */
export interface ChatInputConfig {
  value: string;
  onValueChange: (value: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  placeholder: string;
  /** Animated cycling placeholders — takes precedence when non-empty */
  placeholders?: string[];
  disabled: boolean;
  isStreaming: boolean;
  onSend: () => void;
  onStop: () => void;
}

/** Controls which model is selected and which options are available. */
export interface ModelConfig {
  model: string;
  onModelChange: (model: string) => void;
  modelOptions: readonly AssistantModelOption[];
}

/** Controls reasoning effort selection and available options. */
export interface ReasoningConfig {
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  reasoningOptions: readonly ReasoningEffortOption[];
}

/** Slot for rendering mention dropdown + input ref alongside the composer. */
export interface MentionSlotConfig {
  dropdown: ReactNode;
  inputRef: RefObject<MentionInputHandle | null>;
  mentionNames: Set<string>;
  mentionTypes?: Map<string, string>;
  /** Resolved CSS color string for project theme (for chip dots) */
  themeColor?: string;
  voiceActive?: boolean;
  onValueChange: (value: string, cursorPos?: number) => void;
}

/** Optional slots and layout overrides for the composer shell. */
export interface ComposerSlots {
  leftSlot?: ReactNode;
  metaSlot?: ReactNode;
  voiceSlot?: ReactNode;
  attachment?: AttachmentConfig;
  mentionSlot?: MentionSlotConfig;
  maxWidthClassName?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

export interface UsageConfig {
  sessionUsages: LlmUsage[];
  model: string;
}

interface LlmChatComposerProps {
  chatInput: ChatInputConfig;
  modelConfig: ModelConfig;
  reasoningConfig: ReasoningConfig;
  usageConfig?: UsageConfig;
  slots?: ComposerSlots;
}

export function LlmChatComposer({
  chatInput,
  modelConfig,
  reasoningConfig,
  usageConfig,
  slots = {}
}: LlmChatComposerProps) {
  const {
    value,
    onValueChange,
    onKeyDown,
    placeholder,
    placeholders,
    disabled,
    isStreaming,
    onSend,
    onStop
  } = chatInput;

  const {
    leftSlot,
    metaSlot,
    voiceSlot,
    attachment,
    mentionSlot,
    maxWidthClassName = 'max-w-5xl',
    textareaRef
  } = slots;

  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const canSend = value.trim().length > 0;
  const attachmentItems = attachment?.items ?? [];
  const attachmentSupportLabel = 'Attach files';

  const { wrapperRef, isFocused, onFocusCapture, onBlurCapture } = useMetallicBorder();

  return (
    <div className={cn('mx-auto w-full space-y-2', maxWidthClassName)}>
      {attachment && attachmentItems.length > 0 ? (
        <ComposerAttachments items={attachmentItems} attachment={attachment} />
      ) : null}

      <div
        ref={wrapperRef}
        className="metallic-border rounded-md"
        data-focused={isFocused}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
      >
        <InputGroup className="has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:shadow-none">
          {mentionSlot ? (
            <MentionInput
              ref={mentionSlot.inputRef}
              value={value}
              onValueChange={mentionSlot.onValueChange}
              onKeyDown={onKeyDown as (event: ReactKeyboardEvent<HTMLDivElement>) => void}
              mentionNames={mentionSlot.mentionNames}
              mentionTypes={mentionSlot.mentionTypes}
              themeColor={mentionSlot.themeColor}
              voiceActive={mentionSlot.voiceActive}
              placeholder={placeholder}
              placeholders={placeholders}
              disabled={disabled}
              className="min-h-[60px]"
            />
          ) : (
            <InputGroupTextarea
              ref={textareaRef}
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              onKeyDown={onKeyDown as (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void}
              placeholder={placeholder}
              aria-label="Message input"
              disabled={disabled}
              className="min-h-[60px]"
            />
          )}
        <InputGroupAddon align="block-end">
          <div className="flex w-full min-w-0 flex-nowrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {leftSlot}
              <ComposerModelBar
                modelConfig={modelConfig}
                reasoningConfig={reasoningConfig}
                usageConfig={usageConfig}
              />
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
              <span className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted/50 px-1.5">
                  <ArrowUp className="h-3 w-3" />
                </kbd>
                <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted/50 px-1.5">
                  <CornerDownLeft className="h-3 w-3" />
                </kbd>
                <span>for newline</span>
              </span>
              <div className="min-w-0 max-w-full overflow-hidden">
                {metaSlot}
              </div>

              {attachment ? (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => attachmentInputRef.current?.click()}
                          disabled={attachment.status === 'uploading'}
                          aria-label="Attach file"
                          className="h-7 px-2 text-xs shrink-0 focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
                        >
                          {attachment.status === 'uploading'
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Paperclip className="h-3.5 w-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top"><p>{attachmentSupportLabel}</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <input
                    ref={attachmentInputRef}
                    type="file"
                    className="hidden"
                    accept={attachment.accept ?? '.pdf,.md,.txt'}
                    onChange={attachment.onAttachFile}
                  />
                </>
              ) : null}

              {voiceSlot}

              <InputGroupButton
                size="sm"
                onClick={isStreaming ? onStop : onSend}
                disabled={isStreaming ? false : !canSend}
                aria-label={isStreaming ? 'Stop generating' : 'Send message'}
                variant="ghost"
                className="h-9 w-9 rounded-full p-0 shrink-0 transition-[background-color,color,opacity] bg-accent-fill text-accent-on-fill hover:bg-accent-fill-hover focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 disabled:bg-muted/30 disabled:text-muted-foreground dark:shadow-none"
              >
                {isStreaming ? <Square className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
              </InputGroupButton>
            </div>
          </div>
        </InputGroupAddon>
        </InputGroup>
      </div>

      {attachment?.message ? (
        <div className={cn(
          'text-xs px-1',
          attachment.status === 'queued' && 'text-muted-foreground',
          attachment.status === 'success' && 'text-green-600',
          attachment.status === 'error' && 'text-red-600',
          attachment.status === 'uploading' && 'text-blue-600',
        )}
          role={attachment.status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {attachment.message}
        </div>
      ) : null}

      {mentionSlot?.dropdown}
    </div>
  );
}
