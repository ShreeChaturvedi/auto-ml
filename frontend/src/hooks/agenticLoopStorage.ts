import type { ChatMessage } from '@/types/llmUi';

export function hydrateStoredMessages(messageStorageScope: string | null): {
  messages: ChatMessage[];
  hydratedMessageIds: Set<string>;
} {
  if (!messageStorageScope) {
    return {
      messages: [],
      hydratedMessageIds: new Set()
    };
  }

  const stored = localStorage.getItem(messageStorageScope);
  if (!stored) {
    return {
      messages: [],
      hydratedMessageIds: new Set()
    };
  }

  try {
    const messages = JSON.parse(stored) as ChatMessage[];
    return {
      messages,
      hydratedMessageIds: new Set(messages.map((message) => message.id))
    };
  } catch {
    return {
      messages: [],
      hydratedMessageIds: new Set()
    };
  }
}

export function persistStoredMessages(
  messageStorageScope: string | null,
  messages: ChatMessage[]
): void {
  if (!messageStorageScope) {
    return;
  }

  if (messages.length === 0) {
    localStorage.removeItem(messageStorageScope);
    return;
  }

  localStorage.setItem(messageStorageScope, JSON.stringify(messages));
}
