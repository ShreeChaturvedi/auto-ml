import { randomUUID } from 'node:crypto';

import type {
  WorkflowApprovalRecord,
  WorkflowArtifactRecord,
  WorkflowEventRecord,
  WorkflowHandoffRecord,
  WorkflowNotebookBindingRecord,
  WorkflowRunSnapshot,
  WorkflowRunState
} from '../types.js';

import { nowIso } from './shared.js';
import type { WorkflowRepository } from './types.js';

type Store = {
  runs: Map<string, WorkflowRunState>;
  events: Map<string, WorkflowEventRecord[]>;
  artifacts: Map<string, WorkflowArtifactRecord[]>;
  approvals: Map<string, WorkflowApprovalRecord[]>;
  handoffs: Map<string, WorkflowHandoffRecord[]>;
  notebookBindings: Map<string, WorkflowNotebookBindingRecord[]>;
};

const store: Store = {
  runs: new Map(),
  events: new Map(),
  artifacts: new Map(),
  approvals: new Map(),
  handoffs: new Map(),
  notebookBindings: new Map()
};

export class InMemoryWorkflowRepository implements WorkflowRepository {
  async createRun(input: Omit<WorkflowRunState, 'createdAt' | 'updatedAt' | 'revision'>): Promise<WorkflowRunState> {
    const timestamp = nowIso();
    const run: WorkflowRunState = {
      ...input,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    store.runs.set(run.runId, run);
    store.events.set(run.runId, []);
    store.artifacts.set(run.runId, []);
    store.approvals.set(run.runId, []);
    store.notebookBindings.set(run.runId, []);
    return run;
  }

  async getRun(runId: string): Promise<WorkflowRunSnapshot | undefined> {
    const run = store.runs.get(runId);
    if (!run) {
      return undefined;
    }
    return {
      run,
      events: store.events.get(runId) ?? [],
      artifacts: store.artifacts.get(runId) ?? [],
      approvals: store.approvals.get(runId) ?? [],
      handoffs: [...store.handoffs.values()].flat().filter((entry) => entry.sourceArtifactId === runId || entry.targetArtifactId === runId),
      notebookBindings: store.notebookBindings.get(runId) ?? []
    };
  }

  async listRuns(projectId: string, phase?: WorkflowRunState['phase']): Promise<WorkflowRunState[]> {
    return [...store.runs.values()]
      .filter((run) => run.projectId === projectId && (!phase || run.phase === phase))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveRun(run: WorkflowRunState): Promise<WorkflowRunState> {
    const next = {
      ...run,
      revision: run.revision + 1,
      updatedAt: nowIso()
    };
    store.runs.set(run.runId, next);
    return next;
  }

  async appendEvent(runId: string, eventType: string, payload: Record<string, unknown>): Promise<WorkflowEventRecord> {
    const existing = store.events.get(runId) ?? [];
    const event: WorkflowEventRecord = {
      eventId: randomUUID(),
      runId,
      sequence: existing.length + 1,
      eventType,
      payload,
      createdAt: nowIso()
    };
    existing.push(event);
    store.events.set(runId, existing);
    return event;
  }

  async upsertArtifact(input: Omit<WorkflowArtifactRecord, 'createdAt' | 'updatedAt'>): Promise<WorkflowArtifactRecord> {
    const existing = store.artifacts.get(input.runId) ?? [];
    const timestamp = nowIso();
    const artifact: WorkflowArtifactRecord = {
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const index = existing.findIndex((entry) => entry.artifactId === input.artifactId);
    if (index >= 0) {
      artifact.createdAt = existing[index].createdAt;
      existing[index] = { ...artifact, updatedAt: timestamp };
    } else {
      existing.push(artifact);
    }
    store.artifacts.set(input.runId, existing);
    return existing[index >= 0 ? index : existing.length - 1];
  }

  async upsertApproval(input: Omit<WorkflowApprovalRecord, 'requestedAt'> & { requestedAt?: string }): Promise<WorkflowApprovalRecord> {
    const existing = store.approvals.get(input.runId) ?? [];
    const approval: WorkflowApprovalRecord = {
      ...input,
      requestedAt: input.requestedAt ?? nowIso()
    };
    const index = existing.findIndex((entry) => entry.approvalId === input.approvalId);
    if (index >= 0) {
      existing[index] = approval;
    } else {
      existing.push(approval);
    }
    store.approvals.set(input.runId, existing);
    return approval;
  }

  async upsertHandoff(input: Omit<WorkflowHandoffRecord, 'createdAt' | 'updatedAt'>): Promise<WorkflowHandoffRecord> {
    const bucket = store.handoffs.get(input.projectId) ?? [];
    const timestamp = nowIso();
    const handoff: WorkflowHandoffRecord = {
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const index = bucket.findIndex((entry) => entry.handoffId === input.handoffId);
    if (index >= 0) {
      handoff.createdAt = bucket[index].createdAt;
      bucket[index] = handoff;
    } else {
      bucket.push(handoff);
    }
    store.handoffs.set(input.projectId, bucket);
    return handoff;
  }

  async upsertNotebookBinding(input: Omit<WorkflowNotebookBindingRecord, 'createdAt' | 'updatedAt'>): Promise<WorkflowNotebookBindingRecord> {
    const bucket = store.notebookBindings.get(input.runId) ?? [];
    const timestamp = nowIso();
    const binding: WorkflowNotebookBindingRecord = {
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const index = bucket.findIndex((entry) => entry.bindingId === input.bindingId);
    if (index >= 0) {
      binding.createdAt = bucket[index].createdAt;
      bucket[index] = binding;
    } else {
      bucket.push(binding);
    }
    store.notebookBindings.set(input.runId, bucket);
    return binding;
  }

  async findRunsByDataset(datasetId: string): Promise<WorkflowRunState[]> {
    return [...store.runs.values()]
      .filter((run) => run.activeDatasetId === datasetId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 20);
  }
}
