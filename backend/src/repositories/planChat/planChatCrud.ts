import { getDbPool, hasDatabaseConfiguration } from '../../db.js';
import type { PlanChat, PlanChatRow, PlanChatSummary } from '../../types/planChat.js';

import { rowToPlanChat, rowToSummary } from './helpers.js';

function requireDb() {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for plan chat operations');
  }
}

export async function createPlanChat(
  projectId: string,
  userId: string,
  name: string
): Promise<PlanChat> {
  requireDb();
  const pool = getDbPool();
  const result = await pool.query<PlanChatRow>(
    `INSERT INTO plan_chats (project_id, user_id, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [projectId, userId, name]
  );
  return rowToPlanChat(result.rows[0]);
}

export async function getPlanChat(chatId: string): Promise<PlanChat | null> {
  requireDb();
  const pool = getDbPool();
  const result = await pool.query<PlanChatRow>(
    `SELECT * FROM plan_chats WHERE chat_id = $1`,
    [chatId]
  );
  if (!result.rowCount || result.rowCount === 0) return null;
  return rowToPlanChat(result.rows[0]);
}

export async function listPlanChatsByProject(
  projectId: string,
  userId: string,
  statusFilter?: 'in_progress' | 'completed'
): Promise<PlanChatSummary[]> {
  requireDb();
  const pool = getDbPool();

  const conditions = ['project_id = $1', 'user_id = $2'];
  const values: unknown[] = [projectId, userId];

  if (statusFilter) {
    conditions.push(`status = $3`);
    values.push(statusFilter);
  }

  const result = await pool.query<PlanChatRow & { message_count: number }>(
    `SELECT chat_id, project_id, user_id, name, status,
            current_round, completed_plan_id, created_at, updated_at,
            jsonb_array_length(messages) AS message_count
     FROM plan_chats
     WHERE ${conditions.join(' AND ')}
     ORDER BY updated_at DESC`,
    values
  );

  return result.rows.map(rowToSummary);
}

export async function updatePlanChatState(
  chatId: string,
  patch: {
    messages?: unknown[];
    answerHistory?: unknown[];
    currentRound?: number;
  }
): Promise<PlanChat | null> {
  requireDb();
  const pool = getDbPool();

  const setClauses: string[] = [];
  const values: unknown[] = [chatId];
  let paramIndex = 2;

  if (patch.messages !== undefined) {
    setClauses.push(`messages = $${paramIndex++}`);
    values.push(JSON.stringify(patch.messages));
  }
  if (patch.answerHistory !== undefined) {
    setClauses.push(`answer_history = $${paramIndex++}`);
    values.push(JSON.stringify(patch.answerHistory));
  }
  if (patch.currentRound !== undefined) {
    setClauses.push(`current_round = $${paramIndex++}`);
    values.push(patch.currentRound);
  }

  if (setClauses.length === 0) {
    return getPlanChat(chatId);
  }

  const result = await pool.query<PlanChatRow>(
    `UPDATE plan_chats
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE chat_id = $1
     RETURNING *`,
    values
  );

  if (!result.rowCount || result.rowCount === 0) return null;
  return rowToPlanChat(result.rows[0]);
}

export async function completePlanChat(
  chatId: string,
  completedPlanId: string,
  newName: string
): Promise<PlanChat | null> {
  requireDb();
  const pool = getDbPool();
  const result = await pool.query<PlanChatRow>(
    `UPDATE plan_chats
     SET status = 'completed', completed_plan_id = $2, name = $3, updated_at = NOW()
     WHERE chat_id = $1
     RETURNING *`,
    [chatId, completedPlanId, newName]
  );
  if (!result.rowCount || result.rowCount === 0) return null;
  return rowToPlanChat(result.rows[0]);
}

export async function deletePlanChat(chatId: string): Promise<void> {
  requireDb();
  const pool = getDbPool();
  await pool.query(`DELETE FROM plan_chats WHERE chat_id = $1`, [chatId]);
}
