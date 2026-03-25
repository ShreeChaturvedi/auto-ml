/**
 * ChatMessageRenderer - Shared message rendering component for all agentic phases.
 *
 * Handles common message types (user, assistant_text, thinking, tool_call, error, ui)
 * and delegates phase-specific lifecycle card rendering to the `renderLifecycleCard` prop.
 *
 * Supports savepoint-based edit/revert via optional props.
 */

import { useMemo, type ReactNode } from 'react';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { UserMessageBubble } from './UserMessageBubble';
import { AssistantMessageBubble } from './AssistantMessageBubble';
import { useHighlightStore } from '@/stores/highlightStore';
import { getTurnIndex, groupMessagesByTurn } from '@/lib/llm/turnUtils';
import type { ChatMessage } from '@/types/llmUi';
import type { SavepointDiff } from '@/types/savepoint';
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
  /** Savepoint props — all optional */
  onEditMessage?: (messageId: string) => void;
  onRevertToMessage?: (messageId: string) => void;
  editingMessageId?: string | null;
  turnDiffs?: ReadonlyMap<string, SavepointDiff>;
  isGenerating?: boolean;
}

export function ChatMessageRenderer({
  messages,
  renderLifecycleCard,
  activeTextMessageId = null,
  activeThinkingMessageId = null,
  hydratedMessageIds,
  className,
  onEditMessage,
  onRevertToMessage,
  editingMessageId,
  turnDiffs,
  isGenerating,
}: ChatMessageRendererProps) {
  // Find the index of the editing message for dimming
  const editingIndex = useMemo(() => {
    if (!editingMessageId) return -1;
    const idx = messages.findIndex(m => m.id === editingMessageId);
    // Only dim after user messages — guard against non-user editingMessageId
    if (idx >= 0 && messages[idx]?.type !== 'user') return -1;
    return idx;
  }, [editingMessageId, messages]);

  const setHighlightedCells = useHighlightStore(s => s.setHighlightedCells);
  const clearHighlights = useHighlightStore(s => s.clearHighlights);

  return (
    <div className={cn('space-y-3', className)}>
      {messages.map((msg, idx) => {
        const isDimmed = editingIndex >= 0 && idx > editingIndex;

        // ── user ──────────────────────────────────────────────────────────
        if (msg.type === 'user') {
          return (
            <UserMessageBubble
              key={msg.id}
              message={msg as ChatMessage & { type: 'user' }}
              isEditing={editingMessageId === msg.id}
              isDimmed={isDimmed}
              onEdit={onEditMessage ? () => onEditMessage(msg.id) : undefined}
              onRevert={onRevertToMessage ? () => onRevertToMessage(msg.id) : undefined}
              isGenerating={isGenerating}
            />
          );
        }

        // ── assistant_text ───────────────────────────────────────────────
        if (msg.type === 'assistant_text') {
          const isLive = activeTextMessageId === msg.id;
          const animateOnMount = hydratedMessageIds
            ? !hydratedMessageIds.has(msg.id)
            : undefined;
          const diff = turnDiffs?.get(msg.id) ?? null;

          return (
            <AssistantMessageBubble
              key={msg.id}
              message={msg as ChatMessage & { type: 'assistant_text' }}
              isLive={isLive}
              animateOnMount={animateOnMount}
              isDimmed={isDimmed}
              diff={diff}
              onDiffHover={(hovering) => {
                if (hovering && diff?.details) {
                  setHighlightedCells(diff.details.map(d => d.cellId));
                } else {
                  clearHighlights();
                }
              }}
              onDiffClick={() => {
                if (!onRevertToMessage) return;
                const turns = groupMessagesByTurn(messages);
                const turnIdx = getTurnIndex(messages, msg.id);
                const turn = turns.find(t => t.turnIndex === turnIdx);
                if (turn) onRevertToMessage(turn.userMessage.id);
              }}
              isGenerating={isGenerating}
            />
          );
        }

        // ── thinking ─────────────────────────────────────────────────────
        if (msg.type === 'thinking') {
          const animateOnMount = hydratedMessageIds
            ? !hydratedMessageIds.has(msg.id)
            : undefined;
          return (
            <div key={msg.id} className={cn(isDimmed && 'opacity-40')}>
              <ThinkingBlock
                messageId={msg.id}
                content={msg.content}
                isComplete={msg.isComplete}
                isLive={activeThinkingMessageId === msg.id}
                animateOnMount={animateOnMount}
              />
            </div>
          );
        }

        // ── tool_call ────────────────────────────────────────────────────
        if (msg.type === 'tool_call') {
          // Try lifecycle card rendering first
          const lifecycleCard = renderLifecycleCard?.(msg);
          if (lifecycleCard != null) {
            return <div key={msg.id} className={cn(isDimmed && 'opacity-40')}>{lifecycleCard}</div>;
          }

          // Fallback to standard ToolIndicator
          return (
            <div key={msg.id} className={cn(isDimmed && 'opacity-40')}>
              <ToolIndicator
                toolCalls={[msg.call]}
                results={msg.result ? [msg.result] : []}
                isRunning={!msg.result}
                autoExpandPreviewTools
              />
            </div>
          );
        }

        // ── error ────────────────────────────────────────────────────────
        if (msg.type === 'error') {
          return (
            <div
              key={msg.id}
              className={cn(
                'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive',
                isDimmed && 'opacity-40'
              )}
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
            return <div key={msg.id} className={cn(isDimmed && 'opacity-40')}>{lifecycleCard}</div>;
          }
          return null;
        }

        // ── other types (plan, ask_user, code_cell) ──────────────────────
        // Delegate to lifecycle card renderer for phase-specific handling
        const extra = renderLifecycleCard?.(msg);
        if (extra != null) {
          return <div key={msg.id} className={cn(isDimmed && 'opacity-40')}>{extra}</div>;
        }

        return null;
      })}
    </div>
  );
}
