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
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          return {
            chats: {
              ...state.chats,
              [chatId]: {
                ...chat,
                status: 'completed',
                completedPlanId,
                name: newName,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      deleteChat: (chatId) => {
        set((state) => {
          const rest = { ...state.chats };
          delete rest[chatId];
          return { chats: rest };
        });
      },

      updateMessages: (chatId, messages) => {
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          return {
            chats: {
              ...state.chats,
              [chatId]: { ...chat, messages, updatedAt: Date.now() },
            },
          };
        });
      },

      updateDrafts: (chatId, drafts) => {
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          return {
            chats: {
              ...state.chats,
              [chatId]: { ...chat, planDrafts: drafts, updatedAt: Date.now() },
            },
          };
        });
      },

      updateAnswerHistory: (chatId, history) => {
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          return {
            chats: {
              ...state.chats,
              [chatId]: { ...chat, answerHistory: history, updatedAt: Date.now() },
            },
          };
        });
      },

      updateRound: (chatId, round) => {
        set((state) => {
          const chat = state.chats[chatId];
          if (!chat) return state;
          return {
            chats: {
              ...state.chats,
              [chatId]: { ...chat, currentRound: round, updatedAt: Date.now() },
            },
          };
        });
      },

      getProjectChats: (projectId) => {
        return Object.values(get().chats)
          .filter((c) => c.projectId === projectId)
          .sort((a, b) => b.createdAt - a.createdAt);
      },

      getInProgressChats: (projectId) => {
        return Object.values(get().chats)
          .filter((c) => c.projectId === projectId && c.status === 'in_progress')
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },
    }),
    {
      name: 'automl-plan-chats-v1',
      partialize: (state) => ({ chats: state.chats }),
    }
  )
);
