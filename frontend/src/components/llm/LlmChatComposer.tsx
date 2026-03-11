import { useMemo, useRef, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';

import { MentionInput, type MentionInputHandle } from '@/components/llm/MentionInput';
import type { LlmUsage } from '@/types/llmUi';

import { useMetallicBorder } from '@/hooks/useMetallicBorder';
import {
  ArrowUp,
  Ban,
  Brain,
  Code2,
  CornerDownLeft,
  Crown,
  Flame,
  Gauge,
  Info,
  Loader2,
  Paperclip,
  RefreshCw,
  Rocket,
  Square,
  X,
  Zap
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses } from '@/types/project';
import {
  DEFAULT_ASSISTANT_MODEL,
  getModelOption,
  type AssistantModelOption,
  type ReasoningEffort,
  type ReasoningEffortOption,
  type ReasoningIcon
} from './modelOptions';
import { ContextUsageIndicator } from './ContextUsageIndicator';

/** Compact dropdown group label; smaller than option text (text-sm). */
const SELECT_GROUP_LABEL_CLASS =
  'px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider';

export type AttachmentStatus = 'idle' | 'queued' | 'uploading' | 'success' | 'error';

export interface ComposerAttachmentItem {
  id: string;
  name: string;
  status: Exclude<AttachmentStatus, 'idle'>;
  message?: string | null;
}

interface AttachmentConfig {
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
  onValueChange: (value: string, cursorPos?: number) => void;
}

/** Optional slots and layout overrides for the composer shell. */
export interface ComposerSlots {
  leftSlot?: ReactNode;
  metaSlot?: ReactNode;
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

function renderModelIcon(option: AssistantModelOption, iconColorClass?: string): ReactNode {
  const cls = cn('h-3 w-3', iconColorClass);

  if (option.value === DEFAULT_ASSISTANT_MODEL) {
    return <Crown className={cls} />;
  }

  switch (option.kind) {
    case 'codex':
      return <Code2 className={cls} />;
    case 'mini':
      return <Zap className={cls} />;
    case 'nano':
      return <Gauge className={cls} />;
    case 'base':
    default:
      return <Crown className={cls} />;
  }
}

function renderReasoningIcon(icon: ReasoningIcon, iconColorClass?: string): ReactNode {
  const cls = cn('h-3 w-3', iconColorClass);
  switch (icon) {
    case 'slash': return <Ban className={cls} />;
    case 'zap': return <Zap className={cls} />;
    case 'gauge': return <Gauge className={cls} />;
    case 'brain': return <Brain className={cls} />;
    case 'flame': return <Flame className={cls} />;
    case 'rocket': return <Rocket className={cls} />;
  }
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
    disabled,
    isStreaming,
    onSend,
    onStop
  } = chatInput;

  const { model, onModelChange, modelOptions } = modelConfig;
  const { reasoningEffort, onReasoningEffortChange, reasoningOptions } = reasoningConfig;
  const {
    leftSlot,
    metaSlot,
    attachment,
    mentionSlot,
    maxWidthClassName = 'max-w-5xl',
    textareaRef
  } = slots;

  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const canSend = value.trim().length > 0;
  const attachmentItems = attachment?.items ?? [];
  const attachmentSupportLabel = attachment?.accept
    ? `Supported: ${attachment.accept}`
    : 'Add document to context';

  const { wrapperRef, isFocused, onFocusCapture, onBlurCapture } = useMetallicBorder();

  const activeProject = useProjectStore((s) => s.getActiveProject());
  const projectIconColorClass = activeProject
    ? projectColorClasses[activeProject.color]?.text
    : undefined;

  const currentModelOption = useMemo(
    () => getModelOption(model, modelOptions),
    [model, modelOptions]
  );

  return (
    <div className={cn('mx-auto w-full space-y-2', maxWidthClassName)}>
      {attachmentItems.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-1" aria-label="Attachment queue">
          {attachmentItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs',
                item.status === 'queued' && 'border-muted-foreground/30 bg-muted/40 text-foreground',
                item.status === 'uploading' && 'border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
                item.status === 'success' && 'border-green-500/30 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
                item.status === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
              )}
            >
              <span className="truncate max-w-[220px]" title={item.name}>
                {item.name}
              </span>
              {item.status === 'uploading' ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              {item.status === 'error' && attachment?.onRetryItem ? (
                <button
                  type="button"
                  onClick={() => attachment.onRetryItem?.(item.id)}
                  className="rounded p-0.5 transition-colors hover:bg-destructive/10"
                  aria-label={`Retry ${item.name}`}
                  title="Retry upload"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              ) : null}
              {attachment?.onRemoveItem ? (
                <button
                  type="button"
                  onClick={() => attachment.onRemoveItem?.(item.id)}
                  className="rounded p-0.5 transition-colors hover:bg-foreground/10"
                  aria-label={`Remove ${item.name}`}
                  title="Remove attachment"
                  disabled={item.status === 'uploading'}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div
        ref={wrapperRef}
        className="metallic-border rounded-md"
        data-focused={isFocused}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
      >
        <InputGroup className="has-[[data-slot=input-group-control]:focus-visible]:ring-0">
          {mentionSlot ? (
            <MentionInput
              ref={mentionSlot.inputRef}
              value={value}
              onValueChange={mentionSlot.onValueChange}
              onKeyDown={onKeyDown as (event: ReactKeyboardEvent<HTMLDivElement>) => void}
              mentionNames={mentionSlot.mentionNames}
              mentionTypes={mentionSlot.mentionTypes}
              themeColor={mentionSlot.themeColor}
              placeholder={placeholder}
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
              <div className="hidden lg:flex shrink-0 flex-nowrap items-center gap-2">
                <Select value={currentModelOption.value} onValueChange={onModelChange}>
                  <SelectTrigger className="flex h-7 w-fit min-w-[8.25rem] max-w-none shrink-0 flex-nowrap gap-2 px-2.5 text-xs [&>div]:flex [&>div]:flex-nowrap [&>div]:min-w-0 [&>div]:overflow-hidden">
                    <div className="flex min-w-0 shrink flex-nowrap items-center gap-2 whitespace-nowrap">
                      <span className="shrink-0">{renderModelIcon(currentModelOption, projectIconColorClass)}</span>
                      <span className="min-w-0 truncate">{currentModelOption.label}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className={SELECT_GROUP_LABEL_CLASS}>
                        Model
                      </SelectLabel>
                      {modelOptions.map((option) => {
                        const isSelected = option.value === model;
                        return (
                        <SelectItem key={option.value} value={option.value} indicatorClassName={isSelected ? projectIconColorClass : undefined}>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0">{renderModelIcon(option, isSelected ? projectIconColorClass : undefined)}</span>
                          <span className="truncate">{option.label}</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  aria-label={`${option.label} usage tip`}
                                  className="inline-flex shrink-0 text-muted-foreground"
                                >
                                  <Info className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs text-xs">
                                {option.description}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </SelectItem>
                    );})}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {reasoningOptions.length > 0 ? (
                  <Select value={reasoningEffort} onValueChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}>
                    <SelectTrigger className="h-7 w-fit min-w-[7.5rem] gap-2 px-2.5 text-xs">
                      <SelectValue placeholder="Reasoning">
                        {(() => {
                          const opt = reasoningOptions.find((o) => o.value === reasoningEffort);
                          return opt ? (
                            <span className="flex items-center gap-1.5">
                              {renderReasoningIcon(opt.icon, projectIconColorClass)}
                              {opt.label}
                            </span>
                          ) : null;
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel className={SELECT_GROUP_LABEL_CLASS}>
                          Reasoning
                        </SelectLabel>
                        {reasoningOptions.map((option) => {
                          const isSelected = option.value === reasoningEffort;
                          return (
                          <SelectItem key={option.value} value={option.value} indicatorClassName={isSelected ? projectIconColorClass : undefined}>
                            <span className="flex items-center gap-1.5">
                              {renderReasoningIcon(option.icon, isSelected ? projectIconColorClass : undefined)}
                              {option.label}
                            </span>
                          </SelectItem>
                        );})}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : null}

                {usageConfig && usageConfig.sessionUsages.length > 0 ? (
                  <ContextUsageIndicator
                    sessionUsages={usageConfig.sessionUsages}
                    model={usageConfig.model}
                    projectColorClass={projectIconColorClass}
                    projectBgColorClass={activeProject ? projectColorClasses[activeProject.color]?.bg : undefined}
                    projectColor={activeProject?.color === 'custom' ? activeProject.customColor : undefined}
                  />
                ) : null}
              </div>
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
                          className="h-7 px-2 text-xs shrink-0"
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

              <InputGroupButton
                size="sm"
                onClick={isStreaming ? onStop : onSend}
                disabled={isStreaming ? false : !canSend}
                aria-label={isStreaming ? 'Stop generating' : 'Send message'}
                variant="ghost"
                className="h-9 w-9 rounded-full border border-foreground/30 bg-foreground p-0 text-background hover:bg-foreground/90 disabled:bg-muted/30 disabled:text-muted-foreground shrink-0"
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
