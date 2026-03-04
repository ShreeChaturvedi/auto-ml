import type { ChatMessage } from '@/types/llmUi';

export function addAssistantTextMessage(
  messages: ChatMessage[],
  messageId: string,
  content: string
): ChatMessage[] {
  return [...messages, { id: messageId, type: 'assistant_text', content }];
}

export function appendAssistantTextDelta(
  messages: ChatMessage[],
  messageId: string,
  delta: string
): ChatMessage[] {
  if (!delta) return messages;
  return messages.map((message) => (
    message.id === messageId && message.type === 'assistant_text'
      ? { ...message, content: message.content + delta }
      : message
  ));
}

export function addThinkingMessage(
  messages: ChatMessage[],
  messageId: string,
  content: string,
  startTime: number
): ChatMessage[] {
  return [...messages, { id: messageId, type: 'thinking', content, isComplete: false, startTime }];
}

export function appendThinkingDelta(
  messages: ChatMessage[],
  messageId: string,
  delta: string
): ChatMessage[] {
  if (!delta) return messages;
  return messages.map((message) => (
    message.id === messageId && message.type === 'thinking'
      ? { ...message, content: message.content + delta }
      : message
  ));
}

export function markThinkingMessageComplete(
  messages: ChatMessage[],
  messageId: string | null
): ChatMessage[] {
  if (!messageId) return messages;
  return messages.map((message) => (
    message.id === messageId && message.type === 'thinking' && !message.isComplete
      ? { ...message, isComplete: true }
      : message
  ));
}

export function markAllThinkingMessagesComplete(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => (
    message.type === 'thinking' && !message.isComplete
      ? { ...message, isComplete: true }
      : message
  ));
}
