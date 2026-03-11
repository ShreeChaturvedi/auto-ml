/**
 * useMessagePersistence - Hydrates and persists chat messages to/from localStorage.
 *
 * Extracted from ChatPanel to isolate the localStorage side-effects:
 * - Load messages on mount (keyed by projectId)
 * - Save messages whenever they change
 * - Track which message IDs were restored (so animations can skip them)
 */

import { useState, useEffect } from 'react';
import type { ChatMessage } from '@/types/llmUi';

const STORAGE_KEY_PREFIX = 'notebook-messages-';

interface UseMessagePersistenceOptions {
  projectId: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export function useMessagePersistence({
  projectId,
  messages,
  setMessages
}: UseMessagePersistenceOptions) {
  const [hydratedMessageIds, setHydratedMessageIds] = useState<Set<string>>(new Set());

  // Load messages from localStorage
  useEffect(() => {
    if (!projectId) return;
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ChatMessage[];
        setMessages(parsed);
        setHydratedMessageIds(new Set(parsed.map((message) => message.id)));
      } catch {
        // Ignore invalid stored data
        setHydratedMessageIds(new Set());
      }
    } else {
      setHydratedMessageIds(new Set());
    }
  }, [projectId, setMessages]);

  // Save messages to localStorage
  useEffect(() => {
    if (!projectId || messages.length === 0) return;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}`, JSON.stringify(messages));
  }, [projectId, messages]);

  return { hydratedMessageIds };
}
