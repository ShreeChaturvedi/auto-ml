/** Raw database row shape (snake_case). */
export interface PlanChatRow {
  chat_id: string;
  project_id: string;
  user_id: string;
  name: string;
  status: 'in_progress' | 'completed';
  messages: unknown[];
  answer_history: unknown[];
  current_round: number;
  completed_plan_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Full plan chat with messages (camelCase). */
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

/** Lightweight summary for list endpoints (no messages). */
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
