import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'applied'
  | 'failed'
  | 'diverged';

export interface ValidationMetrics {
  rowCountBefore?: number;
  rowCountAfter?: number;
  nullCountBefore?: number;
  nullCountAfter?: number;
  schemaDrift?: boolean;
  notes?: string;
}

export interface DatasetColumnSnapshot {
  name: string;
  dtype: string;
}

export interface DatasetSchemaSnapshot {
  datasetId: string;
  columns: DatasetColumnSnapshot[];
  capturedAt: string;
}

export interface StepState {
  stepId: string;
  title: string;
  rationale?: string;
  intentType: string;
  status: StepStatus;
  approvalDecision?: 'pending' | 'approved' | 'rejected';
  decisionReason?: string;
  toolCallId?: string;
  linkedFromStepId?: string;
  code?: string;
  codeHash?: string;
  version: number;
  cellIds: string[];
  validation?: ValidationMetrics;
  requiresApproval: boolean;
  lastExecuteSucceeded: boolean;
  lastValidateSucceeded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreprocessingCellBinding {
  runId: string;
  stepId: string;
  toolCallId?: string;
  version: number;
  codeHash?: string;
  updatedAt: string;
}

export interface CheckpointState {
  checkpointId: string;
  label: string;
  datasetId: string;
  stepIds: string[];
  createdAt: string;
  replayUntilEventSequence: number;
}

export type PreprocessingRunEventType =
  | 'active_dataset_set'
  | 'step_proposed'
  | 'step_code_materialized'
  | 'step_executed'
  | 'step_validated'
  | 'step_committed'
  | 'step_diverged'
  | 'step_reconciled'
  | 'checkpoint_created'
  | 'checkpoint_restored'
  | 'replay_compatibility_checked';

export interface PreprocessingRunEvent {
  eventId: string;
  runId: string;
  sequence: number;
  type: PreprocessingRunEventType;
  createdAt: string;
  stepId?: string;
  checkpointId?: string;
  datasetId?: string;
  payload?: Record<string, unknown>;
}

export interface PreprocessingRunState {
  runId: string;
  projectId: string;
  activeDatasetId?: string;
  derivedDatasetIds: string[];
  langGraphRuntime?: 'langgraph';
  langGraphState?: Record<string, unknown>;
  steps: Record<string, StepState>;
  checkpoints: CheckpointState[];
  events: PreprocessingRunEvent[];
  createdAt: string;
  updatedAt: string;
}

interface StoredPreprocessingRuns {
  runs: PreprocessingRunState[];
}

export interface PreprocessingRunRepository {
  getById(runId: string): Promise<PreprocessingRunState | undefined>;
  listByProjectId(projectId: string): Promise<PreprocessingRunState[]>;
  getOrCreate(projectId: string, explicitRunId?: string): Promise<PreprocessingRunState>;
  save(run: PreprocessingRunState): Promise<void>;
}

function ensureDirectory(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyStore(): StoredPreprocessingRuns {
  return { runs: [] };
}

class FilePreprocessingRunRepository implements PreprocessingRunRepository {
  constructor(private readonly filePath: string) {
    ensureDirectory(filePath);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, JSON.stringify(emptyStore(), null, 2), 'utf8');
    }
  }

  private readAll(): StoredPreprocessingRuns {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) {
        return emptyStore();
      }

      const parsed = JSON.parse(raw) as Partial<StoredPreprocessingRuns>;
      if (!parsed || !Array.isArray(parsed.runs)) {
        return emptyStore();
      }

      return { runs: parsed.runs };
    } catch (error) {
      console.error('[preprocessingRunRepository] Failed to read run state file', error);
      return emptyStore();
    }
  }

  private writeAll(store: StoredPreprocessingRuns): void {
    ensureDirectory(this.filePath);
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), 'utf8');
  }

  async getById(runId: string): Promise<PreprocessingRunState | undefined> {
    return this.readAll().runs.find((run) => run.runId === runId);
  }

  async listByProjectId(projectId: string): Promise<PreprocessingRunState[]> {
    return this.readAll()
      .runs
      .filter((run) => run.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getOrCreate(projectId: string, explicitRunId?: string): Promise<PreprocessingRunState> {
    const store = this.readAll();
    if (explicitRunId) {
      const existing = store.runs.find((run) => run.runId === explicitRunId);
      if (existing) {
        return existing;
      }
    }

    const runId = explicitRunId ?? `prep-${randomUUID()}`;
    const timestamp = nowIso();
    const created: PreprocessingRunState = {
      runId,
      projectId,
      derivedDatasetIds: [],
      steps: {},
      checkpoints: [],
      events: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    store.runs.push(created);
    this.writeAll(store);
    return created;
  }

  async save(run: PreprocessingRunState): Promise<void> {
    const store = this.readAll();
    const index = store.runs.findIndex((candidate) => candidate.runId === run.runId);
    const next: PreprocessingRunState = {
      ...run,
      updatedAt: nowIso()
    };

    if (index === -1) {
      store.runs.push(next);
    } else {
      store.runs[index] = next;
    }

    this.writeAll(store);
  }
}

export function createFilePreprocessingRunRepository(filePath: string): PreprocessingRunRepository {
  return new FilePreprocessingRunRepository(filePath);
}
