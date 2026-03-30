import type { PlanChat, PlanChatRow, PlanChatSummary } from '../../types/planChat.js';

export function rowToPlanChat(row: PlanChatRow): PlanChat {
  return {
    chatId: row.chat_id,
    projectId: row.project_id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
    messages: row.messages ?? [],
    answerHistory: row.answer_history ?? [],
    currentRound: row.current_round,
    completedPlanId: row.completed_plan_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function rowToSummary(row: PlanChatRow & { message_count?: number }): PlanChatSummary {
  return {
    chatId: row.chat_id,
    projectId: row.project_id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
    currentRound: row.current_round,
    completedPlanId: row.completed_plan_id,
    messageCount: Number(row.message_count ?? 0),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
