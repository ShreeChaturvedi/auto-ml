/**
 * planChatStore — Persists in-progress plan chat conversations to localStorage.
 *
 * Each chat entry stores the full message list, plan drafts, answer history,
 * and current round so users can navigate away and resume later.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage, QuestionAnswer } from '@/types/llmUi';

export interface PlanChatEntry {
  id: string;
  projectId: string;
  name: string;
  status: 'in_progress' | 'completed';
  messages: ChatMessage[];
  planDrafts: Record<string, string>;
  answerHistory: QuestionAnswer[];
  currentRound: number;
  createdAt: number;
  updatedAt: number;
  completedPlanId?: string;
}

interface PlanChatStore {
  chats: Record<string, PlanChatEntry>;
  createChat: (projectId: string, name: string) => PlanChatEntry;
  completeChat: (chatId: string, completedPlanId: string, newName: string) => void;
  deleteChat: (chatId: string) => void;
  updateMessages: (chatId: string, messages: ChatMessage[]) => void;
  updateDrafts: (chatId: string, drafts: Record<string, string>) => void;
  updateAnswerHistory: (chatId: string, history: QuestionAnswer[]) => void;
  updateRound: (chatId: string, round: number) => void;
  getProjectChats: (projectId: string) => PlanChatEntry[];
  getInProgressChats: (projectId: string) => PlanChatEntry[];
}

/** Shared selector for reactive use in components (avoids inline duplication). */
export function selectInProgressChats(
  state: { chats: Record<string, PlanChatEntry> },
  projectId: string | null | undefined
): PlanChatEntry[] {
  if (!projectId) return [];
  return Object.values(state.chats)
    .filter((c) => c.projectId === projectId && c.status === 'in_progress')
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function patchChat(
  state: { chats: Record<string, PlanChatEntry> },
  chatId: string,
  fields: Partial<PlanChatEntry>
) {
  const chat = state.chats[chatId];
  if (!chat) return state;
  return {
    chats: {
      ...state.chats,
      [chatId]: { ...chat, ...fields, updatedAt: Date.now() },
    },
  };
}

export const usePlanChatStore = create<PlanChatStore>()(
  persist(
    (set, get) => ({
      chats: {},

      createChat: (projectId, name) => {
        const id = `plan-chat-${Date.now()}`;
        const entry: PlanChatEntry = {
          id,
          projectId,
          name,
          status: 'in_progress',
          messages: [],
          planDrafts: {},
          answerHistory: [],
          currentRound: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ chats: { ...state.chats, [id]: entry } }));
        return entry;
      },

      completeChat: (chatId, completedPlanId, newName) => {
        set((state) => patchChat(state, chatId, { status: 'completed', completedPlanId, name: newName }));
      },

      deleteChat: (chatId) => {
        set((state) => {
          const rest = { ...state.chats };
          delete rest[chatId];
          return { chats: rest };
        });
      },

      updateMessages: (chatId, messages) => {
        set((state) => patchChat(state, chatId, { messages }));
      },

      updateDrafts: (chatId, drafts) => {
        set((state) => patchChat(state, chatId, { planDrafts: drafts }));
      },

      updateAnswerHistory: (chatId, history) => {
        set((state) => patchChat(state, chatId, { answerHistory: history }));
      },

      updateRound: (chatId, round) => {
        set((state) => patchChat(state, chatId, { currentRound: round }));
      },

      getProjectChats: (projectId) => {
        return Object.values(get().chats)
          .filter((c) => c.projectId === projectId)
          .sort((a, b) => b.createdAt - a.createdAt);
      },

      getInProgressChats: (projectId) => {
        return selectInProgressChats(get(), projectId);
      },
    }),
    {
      name: 'automl-plan-chats-v1',
      partialize: (state) => ({ chats: state.chats }),
    }
  )
);
