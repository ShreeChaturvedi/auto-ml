import { useMemo, useRef, type ChangeEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { ArrowUp, Brain, Flame, Gauge, Lightbulb, Loader2, Paperclip, Square, Wand2, Zap } from 'lucide-react';

import { GeminiIcon } from '@/components/icons/GeminiIcon';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getModelOption, type AssistantModelOption, type ReasoningEffort, type ReasoningEffortOption, type ReasoningIcon } from './modelOptions';

type AttachmentStatus = 'idle' | 'uploading' | 'success' | 'error';

interface AttachmentConfig {
  onAttachFile: (event: ChangeEvent<HTMLInputElement>) => void;
  status: AttachmentStatus;
  message: string | null;
  accept?: string;
}

interface LlmChatComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  disabled: boolean;
  isStreaming: boolean;
  onSend: () => void;
  onStop: () => void;
  model: string;
  onModelChange: (model: string) => void;
  modelOptions: readonly AssistantModelOption[];
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  reasoningOptions: readonly ReasoningEffortOption[];
  enableThinking: boolean;
  onToggleThinking: () => void;
  leftSlot?: ReactNode;
  metaSlot?: ReactNode;
  attachment?: AttachmentConfig;
  maxWidthClassName?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

function renderModelIcon(icon: AssistantModelOption['icon']): ReactNode {
  if (icon === 'gemini') {
    return <GeminiIcon className="h-3 w-3" />;
  }

  return <Wand2 className="h-3 w-3" />;
}

function renderReasoningIcon(icon: ReasoningIcon): ReactNode {
  const cls = 'h-3 w-3';
  switch (icon) {
    case 'zap': return <Zap className={cls} />;
    case 'gauge': return <Gauge className={cls} />;
    case 'brain': return <Brain className={cls} />;
    case 'flame': return <Flame className={cls} />;
  }
}

export function LlmChatComposer({
  value,
  onValueChange,
  onKeyDown,
  placeholder,
  disabled,
  isStreaming,
  onSend,
  onStop,
  model,
  onModelChange,
  modelOptions,
  reasoningEffort,
  onReasoningEffortChange,
  reasoningOptions,
  enableThinking,
  onToggleThinking,
  leftSlot,
  metaSlot,
  attachment,
  maxWidthClassName = 'max-w-5xl',
  textareaRef
}: LlmChatComposerProps) {
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const canSend = value.trim().length > 0;

  const currentModelOption = useMemo(() => getModelOption(model), [model]);
  const showThinkingControls = currentModelOption.supportsThinking;
  const isThinkingAlwaysOn = currentModelOption.thinkingAlwaysOn;

  // Derive effective state for the lightbulb
  const effectiveThinkingEnabled = isThinkingAlwaysOn || enableThinking;

  return (
    <div className={cn('mx-auto space-y-2', maxWidthClassName)}>
      <InputGroup>
        <InputGroupTextarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Message input"
          disabled={disabled}
          className="min-h-[60px]"
        />
        <InputGroupAddon align="block-end">
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex items-center gap-2 shrink-0">
              {leftSlot}
              <div className="hidden lg:flex items-center gap-2">
                <Select value={model} onValueChange={onModelChange}>
                  <SelectTrigger className="h-7 w-[170px] text-xs">
                    <SelectValue placeholder="Model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-1.5">
                          {renderModelIcon(option.icon)}
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {showThinkingControls && (
                  <Select value={reasoningEffort} onValueChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}>
                    <SelectTrigger className="h-7 w-[140px] text-xs">
                      <SelectValue placeholder="Reasoning" />
                    </SelectTrigger>
                    <SelectContent>
                      {reasoningOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex items-center gap-1.5">
                            {renderReasoningIcon(option.icon)}
                            {option.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              <span className="hidden sm:inline text-[10px] text-muted-foreground/60">
                ⇧ + ⏎ for newline
              </span>
              {metaSlot}

              {showThinkingControls && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={isThinkingAlwaysOn ? undefined : onToggleThinking}
                        aria-disabled={isThinkingAlwaysOn}
                        aria-label={isThinkingAlwaysOn ? 'Extended thinking always on' : effectiveThinkingEnabled ? 'Disable extended thinking' : 'Enable extended thinking'}
                        className={cn(
                          'h-7 px-2 text-xs transition-colors shrink-0',
                          effectiveThinkingEnabled && 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:hover:bg-yellow-900/60',
                          isThinkingAlwaysOn && 'cursor-default opacity-90 hover:bg-yellow-100 dark:hover:bg-yellow-900/40'
                        )}
                      >
                        <Lightbulb
                          className={cn(
                            'h-3.5 w-3.5 transition-colors',
                            effectiveThinkingEnabled && 'text-yellow-500 fill-yellow-400'
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>
                        {isThinkingAlwaysOn
                          ? 'Gemini reasoning is always enabled for this model'
                          : effectiveThinkingEnabled
                            ? 'Disable extended thinking'
                            : 'Enable extended thinking'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

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
                      <TooltipContent side="top"><p>Add document to context</p></TooltipContent>
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

      {attachment?.message ? (
        <div className={cn(
          'text-xs px-1',
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
    </div>
  );
}
