import type { ChatMessage } from '@/types/llmUi';

/** V2 storage format: messages + savepoint map. */
interface StoredConversation {
  version: 2;
  messages: ChatMessage[];
  savepoints: Record<number, string>; // turnIndex → savepointId
}

export function hydrateStoredMessages(messageStorageScope: string | null): {
  messages: ChatMessage[];
  hydratedMessageIds: Set<string>;
  savepoints: Record<number, string>;
} {
  if (!messageStorageScope) {
    return { messages: [], hydratedMessageIds: new Set(), savepoints: {} };
  }

  const stored = localStorage.getItem(messageStorageScope);
  if (!stored) {
    return { messages: [], hydratedMessageIds: new Set(), savepoints: {} };
  }

  try {
    const parsed = JSON.parse(stored);

    // V2 format
    if (parsed && typeof parsed === 'object' && parsed.version === 2) {
      const conv = parsed as StoredConversation;
      if (!Array.isArray(conv.messages)) {
        return { messages: [], hydratedMessageIds: new Set(), savepoints: {} };
      }
      return {
        messages: conv.messages,
        hydratedMessageIds: new Set(conv.messages.map((m) => m.id)),
        savepoints: conv.savepoints && typeof conv.savepoints === 'object' && !Array.isArray(conv.savepoints)
          ? conv.savepoints
          : {}
      };
    }

    // V1 format (raw ChatMessage[])
    if (Array.isArray(parsed)) {
      const messages = parsed as ChatMessage[];
      return {
        messages,
        hydratedMessageIds: new Set(messages.map((m) => m.id)),
        savepoints: {}
      };
    }

    return { messages: [], hydratedMessageIds: new Set(), savepoints: {} };
  } catch {
    return { messages: [], hydratedMessageIds: new Set(), savepoints: {} };
  }
}

export function persistStoredMessages(
  messageStorageScope: string | null,
  messages: ChatMessage[],
  savepoints?: Record<number, string>
): void {
  if (!messageStorageScope) return;

  // Always write v2 format — even for empty messages, preserve savepoints
  const data: StoredConversation = {
    version: 2,
    messages,
    savepoints: savepoints ?? {}
  };

  if (messages.length === 0 && Object.keys(data.savepoints).length === 0) {
    localStorage.removeItem(messageStorageScope);
    return;
  }

  localStorage.setItem(messageStorageScope, JSON.stringify(data));
}
