import type { ChatMessage } from '@/types/llmUi';

interface ConversationTurn {
  turnIndex: number;
  userMessage: ChatMessage & { type: 'user' };
  responses: ChatMessage[];
}

/**
 * Group messages into turns. Each turn starts with a user message
 * and includes all subsequent non-user messages until the next user message.
 */
export function groupMessagesByTurn(messages: ChatMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentTurn: ConversationTurn | null = null;

  for (const msg of messages) {
    if (msg.type === 'user') {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = {
        turnIndex: turns.length,
        userMessage: msg as ChatMessage & { type: 'user' },
        responses: []
      };
    } else if (currentTurn) {
      currentTurn.responses.push(msg);
    }
  }

  if (currentTurn) turns.push(currentTurn);
  return turns;
}

/**
 * Get the turn index for a given message ID.
 * Returns -1 if not found.
 */
export function getTurnIndex(messages: ChatMessage[], messageId: string): number {
  const turns = groupMessagesByTurn(messages);
  for (const turn of turns) {
    if (turn.userMessage.id === messageId) return turn.turnIndex;
    if (turn.responses.some(r => r.id === messageId)) return turn.turnIndex;
  }
  return -1;
}

/**
 * Get all messages before the given turn index (turns 0..turnIndex-1).
 */
export function getMessagesUpToTurn(messages: ChatMessage[], turnIndex: number): ChatMessage[] {
  const turns = groupMessagesByTurn(messages);
  const result: ChatMessage[] = [];
  for (const turn of turns) {
    if (turn.turnIndex >= turnIndex) break;
    result.push(turn.userMessage);
    result.push(...turn.responses);
  }
  return result;
}
