import { Wand2 } from 'lucide-react';
import { sanitizeAssistantText } from '@/lib/llm/sanitizeAssistantText';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { MessageActionBar } from './MessageActionBar';
import { DiffBadge } from './DiffBadge';
import type { ChatMessage } from '@/types/llmUi';
import type { SavepointDiff } from '@/types/savepoint';
import { cn } from '@/lib/utils';

interface AssistantMessageBubbleProps {
  message: ChatMessage & { type: 'assistant_text' };
  isLive: boolean;
  animateOnMount?: boolean;
  isDimmed?: boolean;
  diff?: SavepointDiff | null;
  onDiffHover?: (hovering: boolean) => void;
  onDiffClick?: () => void;
  isGenerating?: boolean;
}

export function AssistantMessageBubble({
  message,
  isLive,
  animateOnMount,
  isDimmed,
  diff,
  onDiffHover,
  onDiffClick,
  isGenerating
}: AssistantMessageBubbleProps) {
  const cleaned = sanitizeAssistantText(message.content);
  if (!cleaned) return null;

  return (
    <div
      data-message-id={message.id}
      className={cn(
        'flex items-start gap-3 w-full group',
        isDimmed && 'opacity-40'
      )}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm dark:shadow-none">
        <Wand2 className="h-3 w-3 text-emerald-600" />
      </div>
      <div className="min-w-0 flex-1">
        <ProgressiveMessageText
          messageId={message.id}
          text={cleaned}
          isLive={isLive}
          mode="markdown"
          animateOnMount={animateOnMount}
          className="llm-assistant-markdown prose prose-sm dark:prose-invert mt-0.5 max-w-none text-foreground break-words prose-p:leading-relaxed prose-pre:p-0"
        />
        <div className="flex items-center gap-1 mt-1">
          {diff && <DiffBadge diff={diff} onHover={onDiffHover} onClick={onDiffClick} />}
          <MessageActionBar
            messageType="assistant"
            messageContent={message.content}
            isGenerating={isGenerating}
          />
        </div>
      </div>
    </div>
  );
}
