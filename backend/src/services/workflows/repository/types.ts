import type {
  WorkflowApprovalRecord,
  WorkflowArtifactRecord,
  WorkflowEventRecord,
  WorkflowHandoffRecord,
  WorkflowNotebookBindingRecord,
  WorkflowRunSnapshot,
  WorkflowRunState
} from '../types.js';

export interface WorkflowRepository {
  createRun(input: Omit<WorkflowRunState, 'createdAt' | 'updatedAt' | 'revision'>): Promise<WorkflowRunState>;
  getRun(runId: string): Promise<WorkflowRunSnapshot | undefined>;
  listRuns(projectId: string, phase?: WorkflowRunState['phase']): Promise<WorkflowRunState[]>;
  findActiveRun(projectId: string, phase: string): Promise<WorkflowRunState | undefined>;
  findRunsByDataset(datasetId: string): Promise<WorkflowRunState[]>;
  saveRun(run: WorkflowRunState): Promise<WorkflowRunState>;
  appendEvent(runId: string, eventType: string, payload: Record<string, unknown>): Promise<WorkflowEventRecord>;
  upsertArtifact(input: Omit<WorkflowArtifactRecord, 'createdAt' | 'updatedAt'>): Promise<WorkflowArtifactRecord>;
  upsertApproval(input: Omit<WorkflowApprovalRecord, 'requestedAt'> & { requestedAt?: string }): Promise<WorkflowApprovalRecord>;
  upsertHandoff(input: Omit<WorkflowHandoffRecord, 'createdAt' | 'updatedAt'>): Promise<WorkflowHandoffRecord>;
  upsertNotebookBinding(input: Omit<WorkflowNotebookBindingRecord, 'createdAt' | 'updatedAt'>): Promise<WorkflowNotebookBindingRecord>;
}
