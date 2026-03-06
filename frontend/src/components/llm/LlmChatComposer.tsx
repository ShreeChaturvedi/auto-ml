import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import {
  ArrowUp,
  Ban,
  Brain,
  Code2,
  Flame,
  Gauge,
  Info,
  Loader2,
  Paperclip,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Square,
  X,
  Zap
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  OTHER_ASSISTANT_MODEL_VALUE,
  getModelOption,
  type AssistantModelKind,
  type AssistantModelOption,
  type ReasoningEffort,
  type ReasoningEffortOption,
  type ReasoningIcon
} from './modelOptions';

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
  searchModelOptions: readonly AssistantModelOption[];
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  reasoningOptions: readonly ReasoningEffortOption[];
  leftSlot?: ReactNode;
  metaSlot?: ReactNode;
  attachment?: AttachmentConfig;
  maxWidthClassName?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

function renderModelIcon(kind: AssistantModelKind): ReactNode {
  const cls = 'h-3 w-3';

  switch (kind) {
    case 'codex':
      return <Code2 className={cls} />;
    case 'mini':
      return <Zap className={cls} />;
    case 'nano':
      return <Gauge className={cls} />;
    case 'pro':
      return <Rocket className={cls} />;
    case 'search':
      return <Search className={cls} />;
    case 'chat':
    case 'base':
    default:
      return <Sparkles className={cls} />;
  }
}

function renderReasoningIcon(icon: ReasoningIcon): ReactNode {
  const cls = 'h-3 w-3';
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
  searchModelOptions,
  reasoningEffort,
  onReasoningEffortChange,
  reasoningOptions,
  leftSlot,
  metaSlot,
  attachment,
  maxWidthClassName = 'max-w-5xl',
  textareaRef
}: LlmChatComposerProps) {
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const canSend = value.trim().length > 0;
  const attachmentItems = attachment?.items ?? [];
  const attachmentSupportLabel = attachment?.accept
    ? `Supported: ${attachment.accept}`
    : 'Add document to context';

  const currentModelOption = useMemo(
    () => getModelOption(model, [...modelOptions, ...searchModelOptions]),
    [model, modelOptions, searchModelOptions]
  );

  const filteredSearchModelOptions = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    if (!query) {
      return searchModelOptions;
    }

    return searchModelOptions.filter((option) => (
      option.label.toLowerCase().includes(query)
      || option.value.toLowerCase().includes(query)
      || option.kind.toLowerCase().includes(query)
      || option.description.toLowerCase().includes(query)
    ));
  }, [modelSearch, searchModelOptions]);

  const handleModelValueChange = (nextValue: string) => {
    if (nextValue === OTHER_ASSISTANT_MODEL_VALUE) {
      setIsModelDialogOpen(true);
      return;
    }

    onModelChange(nextValue);
  };

  return (
    <>
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
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {leftSlot}
                <div className="hidden lg:flex items-center gap-2">
                  <Select value={model} onValueChange={handleModelValueChange}>
                    <SelectTrigger className="h-7 w-[210px] text-xs">
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0">{renderModelIcon(option.kind)}</span>
                            <span className="truncate">{option.label}</span>
                            {option.value !== OTHER_ASSISTANT_MODEL_VALUE ? (
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
                            ) : null}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {reasoningOptions.length > 0 ? (
                    <Select value={reasoningEffort} onValueChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}>
                      <SelectTrigger className="h-7 w-[150px] text-xs">
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
                  ) : null}
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
                <span className="hidden sm:inline text-[10px] text-muted-foreground/60">
                  ⇧ + ⏎ for newline
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
      </div>

      <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Other GPT-5 models</DialogTitle>
            <DialogDescription>
              Search the full GPT-5 catalog and choose a model for this conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
              placeholder="Search GPT-5 models..."
              aria-label="Search GPT-5 models"
            />

            <ScrollArea className="max-h-[360px] rounded-md border">
              <div className="space-y-2 p-3">
                {filteredSearchModelOptions.length > 0 ? filteredSearchModelOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onModelChange(option.value);
                      setIsModelDialogOpen(false);
                      setModelSearch('');
                    }}
                    className={cn(
                      'flex w-full items-start justify-between gap-3 rounded-md border px-3 py-3 text-left transition-colors hover:bg-muted/50',
                      option.value === model && 'border-primary bg-primary/5'
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0">{renderModelIcon(option.kind)}</span>
                        <span className="font-medium">{option.label}</span>
                        <Badge variant="outline" className="h-5 text-[10px] uppercase tracking-[0.12em]">
                          {option.kind}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    {option.value === currentModelOption.value ? (
                      <Badge variant="secondary" className="shrink-0">Selected</Badge>
                    ) : null}
                  </button>
                )) : (
                  <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    No GPT-5 models matched your search.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
