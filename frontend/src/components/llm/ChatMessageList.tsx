/**
 * ChatMessageList - Shared message rendering for LLM chat interfaces
 *
 * Handles the common message types from the llmUi ChatMessage union:
 *   user, assistant_text, thinking, tool_call, error
 *
 * Consumer-specific types (plan, ask_user, ui, custom user rendering)
 * are delegated to the `renderExtra` prop so each consumer stays in control
 * of its own domain logic.
 */
import type { ReactNode, RefObject } from 'react';
import { Wand2 } from 'lucide-react';
import { sanitizeAssistantText } from '@/lib/llm/sanitizeAssistantText';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import type { ChatMessage } from '@/types/llmUi';

export interface ChatMessageListProps {
  messages: ChatMessage[];
  /** Optional ref forwarded to the scroll container — consumers own the outer element */
  scrollRef?: RefObject<HTMLElement>;
  /** ID of the currently-streaming assistant_text message */
  activeTextMessageId?: string | null;
  /** ID of the currently-streaming thinking message */
  activeThinkingMessageId?: string | null;
  /**
   * Set of message IDs that were already present when the component mounted.
   * Used to suppress mount animations for pre-existing messages.
   */
  hydratedMessageIds?: Set<string>;
  /**
   * When true, assistant_text messages are rendered with a small Wand2 avatar
   * on the left (TrainingPanel style). Defaults to false (PlanningStage style).
   */
  showAssistantAvatar?: boolean;
  /**
   * Render additional/consumer-specific content for a message.
   * Called for every message after the built-in handlers have run.
   * Returning a non-null ReactNode replaces the default "return null" fallback.
   *
   * Use this for:
   *  - `plan` messages (PlanningStage)
   *  - `ask_user` messages (PlanningStage)
   *  - `ui` schema messages (TrainingPanel)
   *  - custom user-message chrome (AgenticChatArea edit controls)
   *  - custom tool_call rendering via toolUiRegistry (AgenticChatArea)
   */
  renderExtra?: (msg: ChatMessage) => ReactNode;
  /** Additional className applied to the root list container */
  className?: string;
}

export function ChatMessageList({
  messages,
  activeTextMessageId = null,
  activeThinkingMessageId = null,
  hydratedMessageIds,
  showAssistantAvatar = false,
  renderExtra,
  className,
}: ChatMessageListProps) {
  return (
    <div className={className}>
      {messages.map((msg) => {
        // ── user ─────────────────────────────────────────────────────────────
        if (msg.type === 'user') {
          // Allow consumers to replace user-message rendering entirely
          // (AgenticChatArea adds inline edit controls on top of the bubble)
          const extra = renderExtra?.(msg);
          if (extra != null) return extra;

          return (
            <div key={msg.id} className="flex flex-col items-end group">
              <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          );
        }

        // ── assistant_text ────────────────────────────────────────────────────
        if (msg.type === 'assistant_text') {
          const cleaned = sanitizeAssistantText(msg.content);
          if (!cleaned) return null;

          const isLive = activeTextMessageId === msg.id;
          const animateOnMount = hydratedMessageIds
            ? !hydratedMessageIds.has(msg.id)
            : undefined;

          if (showAssistantAvatar) {
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

          return (
            <div key={msg.id} className="text-sm text-foreground">
              <ProgressiveMessageText
                messageId={msg.id}
                text={cleaned}
                isLive={isLive}
                mode="markdown"
                animateOnMount={animateOnMount}
                className="llm-assistant-markdown prose prose-sm max-w-none dark:prose-invert"
              />
            </div>
          );
        }

        // ── thinking ──────────────────────────────────────────────────────────
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

        // ── tool_call ─────────────────────────────────────────────────────────
        if (msg.type === 'tool_call') {
          // Allow consumers to override with domain-specific tool UI
          // (AgenticChatArea uses toolUiRegistry)
          const extra = renderExtra?.(msg);
          if (extra != null) return extra;

          return (
            <ToolIndicator
              key={msg.id}
              toolCalls={[msg.call]}
              results={msg.result ? [msg.result] : []}
              isRunning={!msg.result}
            />
          );
        }

        // ── error ─────────────────────────────────────────────────────────────
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

        // ── consumer-specific types (plan, ask_user, ui, code_cell) ───────────
        return renderExtra?.(msg) ?? null;
      })}
    </div>
  );
}
