/**
 * ComposerAttachments - Displays file attachment chips with status, retry, and remove actions.
 */

import { Loader2, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AttachmentConfig, ComposerAttachmentItem } from './LlmChatComposer';

interface ComposerAttachmentsProps {
  items: ComposerAttachmentItem[];
  attachment: AttachmentConfig;
}

export function ComposerAttachments({ items, attachment }: ComposerAttachmentsProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1" aria-label="Attachment queue">
      {items.map((item) => (
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
          {item.status === 'error' && attachment.onRetryItem ? (
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
          {attachment.onRemoveItem ? (
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
  );
}
