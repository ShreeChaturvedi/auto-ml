/**
 * ChatMessageRenderer - Shared message rendering component for all agentic phases.
 *
 * Handles common message types (user, assistant_text, thinking, tool_call, error, ui)
 * and delegates phase-specific lifecycle card rendering to the `renderLifecycleCard` prop.
 *
 * Follows the same patterns as ChatMessageList but adds lifecycle card support.
 */

import type { ReactNode } from 'react';
import { Wand2 } from 'lucide-react';
import { sanitizeAssistantText } from '@/lib/llm/sanitizeAssistantText';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import type { ChatMessage } from '@/types/llmUi';
import { cn } from '@/lib/utils';

export interface ChatMessageRendererProps {
  messages: ChatMessage[];
  /** Map tool_call messages to lifecycle card components. When non-null, replaces the default ToolIndicator. */
  renderLifecycleCard?: (message: ChatMessage) => ReactNode | null;
  /** ID of the currently-streaming assistant_text message */
  activeTextMessageId?: string | null;
  /** ID of the currently-streaming thinking message */
  activeThinkingMessageId?: string | null;
  /**
   * Set of message IDs present on mount. Suppresses entry animations for pre-existing messages.
   */
  hydratedMessageIds?: Set<string>;
  /** Additional className for the root container */
  className?: string;
}

export function ChatMessageRenderer({
  messages,
  renderLifecycleCard,
  activeTextMessageId = null,
  activeThinkingMessageId = null,
  hydratedMessageIds,
  className,
}: ChatMessageRendererProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {messages.map((msg) => {
        // ── user ──────────────────────────────────────────────────────────
        if (msg.type === 'user') {
          return (
            <div key={msg.id} className="flex flex-col items-end group">
              <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          );
        }

        // ── assistant_text ───────────────────────────────────────────────
        if (msg.type === 'assistant_text') {
          const cleaned = sanitizeAssistantText(msg.content);
          if (!cleaned) return null;

          const isLive = activeTextMessageId === msg.id;
          const animateOnMount = hydratedMessageIds
            ? !hydratedMessageIds.has(msg.id)
            : undefined;

          return (
            <div key={msg.id} className="flex items-start gap-3 w-full">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                <Wand2 className="h-3 w-3 text-emerald-600" />
              </div>
              <ProgressiveMessageText
                messageId={msg.id}
                text={cleaned}
                isLive={isLive}
                mode="markdown"
                animateOnMount={animateOnMount}
                className="llm-assistant-markdown prose prose-sm dark:prose-invert mt-0.5 max-w-none text-foreground break-words prose-p:leading-relaxed prose-pre:p-0"
              />
            </div>
          );
        }

        // ── thinking ─────────────────────────────────────────────────────
        if (msg.type === 'thinking') {
          const animateOnMount = hydratedMessageIds
            ? !hydratedMessageIds.has(msg.id)
            : undefined;
          return (
            <ThinkingBlock
              key={msg.id}
              messageId={msg.id}
              content={msg.content}
              isComplete={msg.isComplete}
              isLive={activeThinkingMessageId === msg.id}
              animateOnMount={animateOnMount}
            />
          );
        }

        // ── tool_call ────────────────────────────────────────────────────
        if (msg.type === 'tool_call') {
          // Try lifecycle card rendering first
          const lifecycleCard = renderLifecycleCard?.(msg);
          if (lifecycleCard != null) {
            return <div key={msg.id}>{lifecycleCard}</div>;
          }

          // Fallback to standard ToolIndicator
          return (
            <ToolIndicator
              key={msg.id}
              toolCalls={[msg.call]}
              results={msg.result ? [msg.result] : []}
              isRunning={!msg.result}
              autoExpandPreviewTools
            />
          );
        }

        // ── error ────────────────────────────────────────────────────────
        if (msg.type === 'error') {
          return (
            <div
              key={msg.id}
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {msg.message}
            </div>
          );
        }

        // ── ui (schema-driven) ───────────────────────────────────────────
        if (msg.type === 'ui') {
          // Lifecycle card hook may handle some ui messages
          const lifecycleCard = renderLifecycleCard?.(msg);
          if (lifecycleCard != null) {
            return <div key={msg.id}>{lifecycleCard}</div>;
          }
          return null;
        }

        // ── other types (plan, ask_user, code_cell) ──────────────────────
        // Delegate to lifecycle card renderer for phase-specific handling
        const extra = renderLifecycleCard?.(msg);
        if (extra != null) {
          return <div key={msg.id}>{extra}</div>;
        }

        return null;
      })}
    </div>
  );
}
