import { apiRequest } from './client';
import type { Savepoint, SavepointDiff } from '@/types/savepoint';

export async function createSavepoint(
  notebookId: string,
  turnIndex: number,
  turnMessageId: string
): Promise<Savepoint> {
  return apiRequest<Savepoint>(`/notebooks/${notebookId}/savepoints`, {
    method: 'POST',
    body: { turnIndex, turnMessageId }
  });
}

export async function getSavepointDiff(
  notebookId: string,
  savepointId: string
): Promise<SavepointDiff> {
  return apiRequest<SavepointDiff>(`/notebooks/${notebookId}/savepoints/${savepointId}/diff`);
}

export async function deleteSavepointsAfter(
  notebookId: string,
  afterTurnIndex: number
): Promise<void> {
  await apiRequest(`/notebooks/${notebookId}/savepoints`, {
    method: 'DELETE',
    body: { afterTurnIndex }
  });
}
