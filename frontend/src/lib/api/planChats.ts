import { apiRequest } from './client';

export interface PlanChat {
  chatId: string;
  projectId: string;
  userId: string;
  name: string;
  status: 'in_progress' | 'completed';
  messages: unknown[];
  answerHistory: unknown[];
  currentRound: number;
  completedPlanId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanChatSummary {
  chatId: string;
  projectId: string;
  userId: string;
  name: string;
  status: 'in_progress' | 'completed';
  currentRound: number;
  completedPlanId: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listPlanChats(
  projectId: string,
  status?: 'in_progress' | 'completed'
): Promise<PlanChatSummary[]> {
  const query = status ? `?status=${status}` : '';
  return apiRequest<PlanChatSummary[]>(`/projects/${projectId}/plan-chats${query}`);
}

export async function createPlanChatApi(
  projectId: string,
  name: string
): Promise<PlanChat> {
  return apiRequest<PlanChat>(`/projects/${projectId}/plan-chats`, {
    method: 'POST',
    body: { name },
  });
}

export async function getPlanChat(
  projectId: string,
  chatId: string
): Promise<PlanChat> {
  return apiRequest<PlanChat>(`/projects/${projectId}/plan-chats/${chatId}`);
}

export async function updatePlanChatState(
  projectId: string,
  chatId: string,
  patch: { messages?: unknown[]; answerHistory?: unknown[]; currentRound?: number; name?: string }
): Promise<PlanChat> {
  return apiRequest<PlanChat>(`/projects/${projectId}/plan-chats/${chatId}/state`, {
    method: 'PUT',
    body: patch,
  });
}

export async function completePlanChatApi(
  projectId: string,
  chatId: string,
  payload: { completedPlanId: string; name: string }
): Promise<PlanChat> {
  return apiRequest<PlanChat>(`/projects/${projectId}/plan-chats/${chatId}/complete`, {
    method: 'POST',
    body: payload,
  });
}

export async function deletePlanChatApi(
  projectId: string,
  chatId: string
): Promise<void> {
  return apiRequest<void>(`/projects/${projectId}/plan-chats/${chatId}`, {
    method: 'DELETE',
  });
}
