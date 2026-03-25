/**
 * useMessageAccumulator
 *
 * Manages message state, persistence, hydration, and savepoint tracking
 * for the agentic loop. Handles message assembly from streaming,
 * localStorage synchronization, and turn-based message slicing.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatMessage } from '@/types/llmUi';
import { hydrateStoredMessages, persistStoredMessages } from '@/hooks/agenticLoopStorage';

export interface UseMessageAccumulatorOptions {
  storageKey?: string;
  projectId?: string;
  sessionVersion?: number;
  onHydrate?: (messages: ChatMessage[], hydratedIds: Set<string>, savepoints: Record<number, string>) => void;
}

export interface UseMessageAccumulatorReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  hydratedMessageIds: Set<string>;
  setHydratedMessageIds: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Persistence and hydration refs
  skipPersistOnceRef: React.RefObject<boolean>;
  savepointsRef: React.RefObject<Record<number, string>>;
  messageStorageScope: string | null;

  // Lifecycle
  resetAccumulator: () => void;
  registerSavepoint: (turnIndex: number, savepointId: string) => void;
}

export function useMessageAccumulator({
  storageKey,
  projectId,
  sessionVersion = 0,
  onHydrate
}: UseMessageAccumulatorOptions): UseMessageAccumulatorReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydratedMessageIds, setHydratedMessageIds] = useState<Set<string>>(new Set());

  const skipPersistOnceRef = useRef(false);
  const savepointsRef = useRef<Record<number, string>>({});

  const messageStorageScope = storageKey && projectId
    ? `${storageKey}-${projectId}`
    : null;

  // --- Hydration on mount or when session version changes ---
  useEffect(() => {
    skipPersistOnceRef.current = true;

    const hydrated = hydrateStoredMessages(messageStorageScope);
    setMessages(hydrated.messages);
    setHydratedMessageIds(hydrated.hydratedMessageIds);
    savepointsRef.current = hydrated.savepoints;

    onHydrate?.(hydrated.messages, hydrated.hydratedMessageIds, hydrated.savepoints);
  }, [messageStorageScope, sessionVersion, onHydrate]);

  // --- Persistence effect ---
  useEffect(() => {
    if (!messageStorageScope) return;
    if (skipPersistOnceRef.current) {
      skipPersistOnceRef.current = false;
      return;
    }
    persistStoredMessages(messageStorageScope, messages, savepointsRef.current);
  }, [messageStorageScope, messages]);

  const resetAccumulator = useCallback(() => {
    setMessages([]);
    setHydratedMessageIds(new Set());
    savepointsRef.current = {};
    if (messageStorageScope) {
      localStorage.removeItem(messageStorageScope);
    }
  }, [messageStorageScope]);

  const registerSavepoint = useCallback((turnIndex: number, savepointId: string) => {
    savepointsRef.current = { ...savepointsRef.current, [turnIndex]: savepointId };
  }, []);

  return {
    messages,
    setMessages,
    hydratedMessageIds,
    setHydratedMessageIds,
    skipPersistOnceRef,
    savepointsRef,
    messageStorageScope,
    resetAccumulator,
    registerSavepoint
  };
}
