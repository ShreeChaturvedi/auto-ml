/**
 * planChatStore — API-backed plan chat state.
 *
 * Each chat entry stores the full message list, answer history,
 * and current round so users can navigate away and resume later.
 * Data is persisted to PostgreSQL via the plan-chats API.
 */

import { create } from 'zustand';
import type { ChatMessage, QuestionAnswer } from '@/types/llmUi';
import {
  listPlanChats,
  createPlanChatApi,
  getPlanChat as getPlanChatApi,
  updatePlanChatState as updatePlanChatStateApi,
  completePlanChatApi,
  deletePlanChatApi,
  type PlanChat,
} from '@/lib/api/planChats';

export interface PlanChatEntry {
  id: string;
  projectId: string;
  name: string;
  status: 'in_progress' | 'completed';
  messages: ChatMessage[];
  answerHistory: QuestionAnswer[];
  currentRound: number;
  createdAt: number;
  updatedAt: number;
  completedPlanId?: string;
}

interface PlanChatStore {
  chats: Record<string, PlanChatEntry>;
  isInitialized: boolean;
  initializedProjectId: string | null;

  initialize: (projectId: string) => Promise<void>;
  createChat: (projectId: string, name: string) => Promise<PlanChatEntry>;
  renameChat: (chatId: string, newName: string) => Promise<void>;
  completeChat: (chatId: string, completedPlanId: string, newName: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  persistChatState: (chatId: string, patch: { messages?: ChatMessage[]; answerHistory?: QuestionAnswer[]; currentRound?: number }) => Promise<void>;
  loadFullChat: (projectId: string, chatId: string) => Promise<PlanChatEntry | null>;

  getInProgressChats: (projectId: string) => PlanChatEntry[];
}

/** Shared selector for reactive use in components. */
export function selectInProgressChats(
  state: { chats: Record<string, PlanChatEntry> },
  projectId: string | null | undefined
): PlanChatEntry[] {
  if (!projectId) return [];
  return Object.values(state.chats)
    .filter((c) => c.projectId === projectId && c.status === 'in_progress')
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Map an API PlanChat response to a store PlanChatEntry. */
function toPlanChatEntry(chat: PlanChat): PlanChatEntry {
  return {
    id: chat.chatId,
    projectId: chat.projectId,
    name: chat.name,
    status: chat.status,
    messages: chat.messages as ChatMessage[],
    answerHistory: chat.answerHistory as QuestionAnswer[],
    currentRound: chat.currentRound,
    createdAt: new Date(chat.createdAt).getTime(),
    updatedAt: new Date(chat.updatedAt).getTime(),
    completedPlanId: chat.completedPlanId ?? undefined,
  };
}

let legacyCleanupDone = false;

export const usePlanChatStore = create<PlanChatStore>()((set, get) => ({
  chats: {},
  isInitialized: false,
  initializedProjectId: null,

  initialize: async (projectId) => {
    if (get().initializedProjectId === projectId) return;

    // Claim the slot synchronously to prevent concurrent fetches
    set({ initializedProjectId: projectId, isInitialized: false });

    if (!legacyCleanupDone) {
      legacyCleanupDone = true;
      try { localStorage.removeItem('automl-plan-chats-v1'); } catch { /* noop */ }
    }

    try {
      const summaries = await listPlanChats(projectId);
      // Guard against stale fetch from rapid project switching
      if (get().initializedProjectId !== projectId) return;
      const entries: Record<string, PlanChatEntry> = {};
      for (const s of summaries) {
        entries[s.chatId] = {
          id: s.chatId,
          projectId: s.projectId,
          name: s.name,
          status: s.status,
          messages: [],
          answerHistory: [],
          currentRound: s.currentRound,
          createdAt: new Date(s.createdAt).getTime(),
          updatedAt: new Date(s.updatedAt).getTime(),
          completedPlanId: s.completedPlanId ?? undefined,
        };
      }
      set({ chats: entries, isInitialized: true });
    } catch (err) {
      console.error('[planChatStore] Failed to initialize', err);
      if (get().initializedProjectId === projectId) {
        set({ chats: {}, isInitialized: true });
      }
    }
  },

  createChat: async (projectId, name) => {
    const entry = toPlanChatEntry(await createPlanChatApi(projectId, name));
    set((state) => ({ chats: { ...state.chats, [entry.id]: entry } }));
    return entry;
  },

  renameChat: async (chatId, newName) => {
    const chat = get().chats[chatId];
    if (!chat) return;
    await updatePlanChatStateApi(chat.projectId, chatId, { name: newName });
    set((state) => ({
      chats: {
        ...state.chats,
        [chatId]: { ...state.chats[chatId], name: newName, updatedAt: Date.now() },
      },
    }));
  },

  completeChat: async (chatId, completedPlanId, newName) => {
    const chat = get().chats[chatId];
    if (!chat) return;
    await completePlanChatApi(chat.projectId, chatId, { completedPlanId, name: newName });
    set((state) => {
      const existing = state.chats[chatId];
      if (!existing) return state;
      return {
        chats: {
          ...state.chats,
          [chatId]: { ...existing, status: 'completed', completedPlanId, name: newName, updatedAt: Date.now() },
        },
      };
    });
  },

  deleteChat: async (chatId) => {
    const chat = get().chats[chatId];
    if (!chat) return;
    await deletePlanChatApi(chat.projectId, chatId);
    set((state) => {
      const rest = { ...state.chats };
      delete rest[chatId];
      return { chats: rest };
    });
  },

  persistChatState: async (chatId, patch) => {
    const chat = get().chats[chatId];
    if (!chat) return;
    try {
      await updatePlanChatStateApi(chat.projectId, chatId, patch);
      set((state) => {
        const existing = state.chats[chatId];
        if (!existing) return state;
        return {
          chats: {
            ...state.chats,
            [chatId]: {
              ...existing,
              ...(patch.messages !== undefined && { messages: patch.messages }),
              ...(patch.answerHistory !== undefined && { answerHistory: patch.answerHistory }),
              ...(patch.currentRound !== undefined && { currentRound: patch.currentRound }),
              updatedAt: Date.now(),
            },
          },
        };
      });
    } catch (err) {
      console.error('[planChatStore] Failed to persist state', err);
    }
  },

  loadFullChat: async (projectId, chatId) => {
    try {
      const entry = toPlanChatEntry(await getPlanChatApi(projectId, chatId));
      set((state) => ({ chats: { ...state.chats, [entry.id]: entry } }));
      return entry;
    } catch {
      return null;
    }
  },

  getInProgressChats: (projectId) => {
    return selectInProgressChats(get(), projectId);
  },
}));
