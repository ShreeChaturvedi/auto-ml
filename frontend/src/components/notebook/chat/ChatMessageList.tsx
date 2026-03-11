/**
 * ChatMessageList - Renders the interleaved list of chat messages.
 *
 * Extracted from ChatPanel to isolate the message-rendering JSX:
 * - Empty state placeholder
 * - User / assistant_text / thinking / tool_call / error message bubbles
 * - Streaming indicator
 * - Scroll-to-bottom anchor
 */

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Brain } from 'lucide-react';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { sanitizeAssistantText } from '@/lib/llm/sanitizeAssistantText';
import { fileIconByType, fileIconColorByType } from '@/lib/fileUtils';
import type { ChatMessage } from '@/types/llmUi';
import type { FileType } from '@/types/file';
import { cn } from '@/lib/utils';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  activeTextMessageId: string | null;
  activeThinkingMessageId: string | null;
  hydratedMessageIds: Set<string>;
}

export function ChatMessageList({
  messages,
  isGenerating,
  activeTextMessageId,
  activeThinkingMessageId,
  hydratedMessageIds
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Brain className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-2">AI Assistant</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Ask questions, request code, or get help with your ML workflow.
              The AI can create and edit notebook cells directly.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          switch (msg.type) {
            case 'user':
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%]">
                    {msg.content}
                    {msg.mentions && msg.mentions.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {msg.mentions.map((m) => {
                          const MIcon = fileIconByType[m.type as FileType] ?? fileIconByType.other;
                          const mColor = fileIconColorByType[m.type as FileType] ?? fileIconColorByType.other;
                          return (
                            <Badge key={m.id} variant="secondary" className="gap-1 text-[10px] py-0">
                              <MIcon className={cn('h-2.5 w-2.5', mColor)} />
                              {m.name}
                            </Badge>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            case 'thinking':
              return (
                <ThinkingBlock
                  key={msg.id}
                  messageId={msg.id}
                  content={msg.content}
                  isComplete={msg.isComplete}
                  isLive={activeThinkingMessageId === msg.id}
                  animateOnMount={!hydratedMessageIds.has(msg.id)}
                />
              );
            case 'assistant_text': {
              const cleaned = sanitizeAssistantText(msg.content);
              return cleaned ? (
                <div
                  key={msg.id}
                  className="rounded-md border border-muted/40 bg-muted/20 p-4 text-sm text-foreground"
                >
                  <ProgressiveMessageText
                    messageId={msg.id}
                    text={cleaned}
                    isLive={activeTextMessageId === msg.id}
                    mode="markdown"
                    animateOnMount={!hydratedMessageIds.has(msg.id)}
                    className="llm-notebook-markdown whitespace-pre-wrap leading-relaxed"
                  />
                </div>
              ) : null;
            }
            case 'tool_call':
              return (
                <ToolIndicator
                  key={msg.id}
                  toolCalls={[msg.call]}
                  results={msg.result ? [msg.result] : []}
                  isRunning={!msg.result}
                />
              );
            case 'error':
              return (
                <div
                  key={msg.id}
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {msg.message}
                </div>
              );
            default:
              return null;
          }
        })}

        {isGenerating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </div>
        )}

        <div ref={scrollRef} />
      </div>
    </ScrollArea>
  );
}
