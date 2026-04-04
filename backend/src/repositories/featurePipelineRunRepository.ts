import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { appLogger } from '../logging/logger.js';
import { ensureDirectoryForFile } from '../utils/fs.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeatureStepStatus =
  | 'proposed'
  | 'code_ready'
  | 'executed'
  | 'failed'
  | 'validated'
  | 'registered'
  | 'rejected';

export interface FeatureExecutionResult {
  succeeded: boolean;
  stdout?: string;
  stderr?: string;
  executionMs?: number;
}

export interface FeatureValidation {
  nullRate?: number;
  correlationWithTarget?: number;
  leakageRisk?: string;
  distributionNotes?: string;
}

export interface FeatureStepRecord {
  featureId: string;
  name: string;
  method: string;
  rationale?: string;
  sourceColumns?: string[];
  impact?: string;
  code?: string;
  codeHash?: string;
  outputColumns?: string[];
  status: FeatureStepStatus;
  executionResult?: FeatureExecutionResult;
  validation?: FeatureValidation;
  registeredAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeaturePipelineRunState {
  runId: string;
  projectId: string;
  scopeNotebookId?: string;
  features: Record<string, FeatureStepRecord>;
  lastCheckpointId?: string;
  lastCheckpointLabel?: string;
  lastCheckpointAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeaturePipelineRunScope {
  notebookId?: string;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface FeaturePipelineRunRepository {
  getById(runId: string): Promise<FeaturePipelineRunState | undefined>;
  listByProjectId(projectId: string): Promise<FeaturePipelineRunState[]>;
  getOrCreate(
    projectId: string,
    explicitRunId?: string,
    scope?: FeaturePipelineRunScope
  ): Promise<FeaturePipelineRunState>;
  save(run: FeaturePipelineRunState): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

interface StoredFeatureRuns {
  runs: FeaturePipelineRunState[];
}

function emptyStore(): StoredFeatureRuns {
  return { runs: [] };
}

// ---------------------------------------------------------------------------
// File-backed implementation
// ---------------------------------------------------------------------------

class FileFeaturePipelineRunRepository implements FeaturePipelineRunRepository {
  constructor(private readonly filePath: string) {
    ensureDirectoryForFile(filePath);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, JSON.stringify(emptyStore(), null, 2), 'utf8');
    }
  }

  private readAll(): StoredFeatureRuns {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) {
        return emptyStore();
      }

      const parsed = JSON.parse(raw) as Partial<StoredFeatureRuns>;
      if (!parsed || !Array.isArray(parsed.runs)) {
        return emptyStore();
      }

      return { runs: parsed.runs };
    } catch (error) {
      appLogger.error('[featurePipelineRunRepository] Failed to read run state file', error);
      return emptyStore();
    }
  }

  private writeAll(store: StoredFeatureRuns): void {
    ensureDirectoryForFile(this.filePath);
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), 'utf8');
  }

  async getById(runId: string): Promise<FeaturePipelineRunState | undefined> {
    return this.readAll().runs.find((run) => run.runId === runId);
  }

  async listByProjectId(projectId: string): Promise<FeaturePipelineRunState[]> {
    return this.readAll()
      .runs
      .filter((run) => run.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getOrCreate(
    projectId: string,
    explicitRunId?: string,
    scope?: FeaturePipelineRunScope
  ): Promise<FeaturePipelineRunState> {
    const store = this.readAll();
    if (explicitRunId) {
      const existing = store.runs.find((run) => run.runId === explicitRunId);
      if (existing) {
        return existing;
      }
    }

    // Prefer a notebook-scoped run when notebook context is available.
    if (!explicitRunId && scope?.notebookId) {
      const scopedRuns = store.runs
        .filter((run) => run.projectId === projectId && run.scopeNotebookId === scope.notebookId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      if (scopedRuns.length > 0) {
        return scopedRuns[0];
      }
    }

    // Return latest existing run for this project only when no notebook scope
    // was provided.
    if (!explicitRunId && !scope?.notebookId) {
      const projectRuns = store.runs
        .filter((run) => run.projectId === projectId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      if (projectRuns.length > 0) {
        return projectRuns[0];
      }
    }

    const runId = explicitRunId ?? `feat-${randomUUID()}`;
    const timestamp = nowIso();
    const created: FeaturePipelineRunState = {
      runId,
      projectId,
      scopeNotebookId: scope?.notebookId,
      features: {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
    store.runs.push(created);
    this.writeAll(store);
    return created;
  }

  async save(run: FeaturePipelineRunState): Promise<void> {
    const store = this.readAll();
    const index = store.runs.findIndex((candidate) => candidate.runId === run.runId);
    const next: FeaturePipelineRunState = {
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFileFeaturePipelineRunRepository(filePath: string): FeaturePipelineRunRepository {
  return new FileFeaturePipelineRunRepository(filePath);
}
