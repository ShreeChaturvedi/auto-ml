import type { ChatMessage } from '@/types/llmUi';

/** V2 storage format: messages + savepoint map. */
interface StoredConversation {
  version: 2;
  messages: ChatMessage[];
  savepoints: Record<number, string>; // turnIndex → savepointId
}

const MAX_STRING_LENGTH = 4000;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 40;
const MAX_RECURSION_DEPTH = 4;
const FALLBACK_MESSAGE_LIMIT = 40;

function compactString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}\n…truncated…`;
}

function compactUnknown(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return compactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (depth >= MAX_RECURSION_DEPTH) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_ITEMS).map((entry) => compactUnknown(entry, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      limited.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`);
    }
    return limited;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    const compacted = Object.fromEntries(entries.map(([key, entryValue]) => [key, compactUnknown(entryValue, depth + 1)]));
    const totalKeys = Object.keys(value as Record<string, unknown>).length;
    if (totalKeys > MAX_OBJECT_KEYS) {
      compacted.__truncatedKeys = totalKeys - MAX_OBJECT_KEYS;
    }
    return compacted;
  }

  return String(value);
}

function compactChatMessage(message: ChatMessage): ChatMessage {
  switch (message.type) {
    case 'user':
      return {
        ...message,
        content: compactString(message.content),
        ...(message.mentions ? { mentions: message.mentions.slice(0, MAX_ARRAY_ITEMS) } : {})
      };
    case 'assistant_text':
    case 'thinking':
    case 'plan':
      return {
        ...message,
        content: compactString(message.content)
      };
    case 'tool_call':
      return {
        ...message,
        call: {
          ...message.call,
          ...(message.call.args ? { args: compactUnknown(message.call.args) as Record<string, unknown> } : {}),
          ...(message.call.rationale ? { rationale: compactString(message.call.rationale) } : {})
        },
        ...(message.result
          ? {
              result: {
                ...message.result,
                ...(message.result.output !== undefined ? { output: compactUnknown(message.result.output) } : {}),
                ...(message.result.error ? { error: compactString(message.result.error) } : {})
              }
            }
          : {})
      };
    case 'error':
      return {
        ...message,
        message: compactString(message.message)
      };
    case 'ui':
      return {
        ...message,
        schema: compactUnknown(message.schema) as typeof message.schema
      };
    case 'ask_user':
      return {
        ...message,
        questions: compactUnknown(message.questions) as typeof message.questions
      };
    default:
      return message;
  }
}

function buildStoredConversation(
  messages: ChatMessage[],
  savepoints?: Record<number, string>,
  limit = messages.length
): StoredConversation {
  const trimmedMessages = limit < messages.length ? messages.slice(-limit) : messages;
  return {
    version: 2,
    messages: trimmedMessages.map((message) => compactChatMessage(message)),
    savepoints: savepoints ?? {}
  };
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
  const data = buildStoredConversation(messages, savepoints);

  if (messages.length === 0 && Object.keys(data.savepoints).length === 0) {
    localStorage.removeItem(messageStorageScope);
    return;
  }

  try {
    localStorage.setItem(messageStorageScope, JSON.stringify(data));
  } catch (error) {
    try {
      const fallback = buildStoredConversation(messages, savepoints, FALLBACK_MESSAGE_LIMIT);
      localStorage.setItem(messageStorageScope, JSON.stringify(fallback));
    } catch (fallbackError) {
      console.warn('[agenticLoopStorage] Failed to persist chat transcript', {
        primaryError: error instanceof Error ? error.message : String(error),
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        messageStorageScope,
        messageCount: messages.length
      });
    }
  }
}
