import type { CellOutput, CellStatus } from '../../types/notebook.js';
import type { WorkflowPhase, WorkflowRunSnapshot } from '../workflows/types.js';
import { getWorkflowRepository } from '../workflows/repository/index.js';
import * as notebookService from './notebookService.js';
import * as notebookRepo from '../../repositories/notebookRepository.js';

type RecoverablePhase = 'preprocessing' | 'feature-engineering' | 'training';

type HistoricCellExecution = {
  executionStatus: CellStatus;
  executionDurationMs?: number;
  executionOrder?: number | null;
  output: CellOutput[];
};

type HistoricCellRecord = {
  originalCellId: string;
  notebookId: string;
  title?: string | null;
  content: string;
  cellType: 'code' | 'markdown';
  metadata: Record<string, unknown>;
  position: number;
  execution?: HistoricCellExecution;
};

export interface NotebookRecoveryCandidate {
  runId: string;
  sourceNotebookId: string;
  cellCount: number;
  phase: RecoverablePhase;
  updatedAt: string;
}

export interface NotebookRecoveryResult {
  status: 'noop' | 'recovered';
  reason?:
    | 'target_notebook_missing'
    | 'target_notebook_not_empty'
    | 'no_recoverable_run'
    | 'phase_mismatch';
  candidate?: NotebookRecoveryCandidate;
  restoredCellIds?: string[];
}

const PHASE_TO_WORKFLOW: Record<RecoverablePhase, WorkflowPhase> = {
  preprocessing: 'preprocessing',
  'feature-engineering': 'feature_engineering',
  training: 'training'
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asCellStatus(value: unknown): CellStatus {
  return value === 'success' || value === 'error' || value === 'running' ? value : 'idle';
}

function asCellOutputs(value: unknown): CellOutput[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const outputs: CellOutput[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const type = asString(record.type);
    const content = asString(record.content);
    if (!type || !content) {
      continue;
    }
    outputs.push({
      type: type as CellOutput['type'],
      content,
      data: asRecord(record.data) ?? undefined,
      mimeType: asString(record.mimeType)
    });
  }
  return outputs;
}

function extractHistoricCells(snapshot: WorkflowRunSnapshot, sourceNotebookId: string): HistoricCellRecord[] {
  const cellsByOriginalId = new Map<string, HistoricCellRecord>();
  const executionByOriginalId = new Map<string, HistoricCellExecution>();

  for (const event of snapshot.events) {
    if (event.eventType !== 'tool_executed') {
      continue;
    }

    const payload = asRecord(event.payload);
    const call = asRecord(payload?.call);
    const result = asRecord(payload?.result);
    const tool = asString(call?.tool);

    if (tool === 'write_cell') {
      const output = asRecord(result?.output);
      if (!output) {
        continue;
      }
      if (asString(output.notebookId) !== sourceNotebookId) {
        continue;
      }

      const originalCellId = asString(output.cellId);
      const content = asString(output.content);
      const notebookId = asString(output.notebookId);
      if (!originalCellId || !content || !notebookId) {
        continue;
      }

      cellsByOriginalId.set(originalCellId, {
        originalCellId,
        notebookId,
        title: asString(output.title) ?? null,
        content,
        cellType: asString(output.cellType) === 'markdown' ? 'markdown' : 'code',
        metadata: asRecord(output.metadata) ?? {},
        position: asNumber(output.position) ?? cellsByOriginalId.size
      });
      continue;
    }

    if (tool === 'run_cell') {
      const args = asRecord(call?.args);
      const output = asRecord(result?.output);
      const originalCellId = asString(args?.cellId);
      if (!originalCellId || !output) {
        continue;
      }
      executionByOriginalId.set(originalCellId, {
        executionStatus: asCellStatus(output.status),
        executionDurationMs: asNumber(output.executionMs),
        executionOrder: asNumber(output.executionOrder) ?? null,
        output: asCellOutputs(output.outputs)
      });
    }
  }

  const historicCells = [...cellsByOriginalId.values()].sort((left, right) => left.position - right.position);
  for (const cell of historicCells) {
    cell.execution = executionByOriginalId.get(cell.originalCellId);
  }
  return historicCells;
}

async function findRecoveryCandidate(
  projectId: string,
  phase: RecoverablePhase
): Promise<{ candidate: NotebookRecoveryCandidate; cells: HistoricCellRecord[] } | null> {
  const workflowRepo = getWorkflowRepository();
  const runs = await workflowRepo.listRuns(projectId, PHASE_TO_WORKFLOW[phase]);

  for (const run of runs) {
    if (run.status !== 'completed' || !run.activeNotebookId) {
      continue;
    }

    const sourceNotebook = await notebookService.getNotebook(run.activeNotebookId);
    if (sourceNotebook) {
      continue;
    }

    const snapshot = await workflowRepo.getRun(run.runId);
    if (!snapshot) {
      continue;
    }

    const cells = extractHistoricCells(snapshot, run.activeNotebookId);
    if (cells.length === 0) {
      continue;
    }

    return {
      candidate: {
        runId: run.runId,
        sourceNotebookId: run.activeNotebookId,
        cellCount: cells.length,
        phase,
        updatedAt: run.updatedAt
      },
      cells
    };
  }

  return null;
}

export async function getNotebookRecoveryCandidate(
  projectId: string,
  notebookId: string,
  phase: RecoverablePhase
): Promise<NotebookRecoveryResult> {
  const targetNotebook = await notebookService.getNotebook(notebookId);
  if (!targetNotebook || targetNotebook.projectId !== projectId) {
    return { status: 'noop', reason: 'target_notebook_missing' };
  }

  const targetCells = await notebookService.listCells(notebookId);
  if (targetCells.length > 0) {
    return { status: 'noop', reason: 'target_notebook_not_empty' };
  }

  const candidate = await findRecoveryCandidate(projectId, phase);
  if (!candidate) {
    return { status: 'noop', reason: 'no_recoverable_run' };
  }

  return {
    status: 'noop',
    candidate: candidate.candidate
  };
}

export async function recoverNotebookFromWorkflowHistory(
  projectId: string,
  notebookId: string,
  phase: RecoverablePhase
): Promise<NotebookRecoveryResult> {
  const targetNotebook = await notebookService.getNotebook(notebookId);
  if (!targetNotebook || targetNotebook.projectId !== projectId) {
    return { status: 'noop', reason: 'target_notebook_missing' };
  }

  const targetCells = await notebookService.listCells(notebookId);
  if (targetCells.length > 0) {
    return { status: 'noop', reason: 'target_notebook_not_empty' };
  }

  const recovery = await findRecoveryCandidate(projectId, phase);
  if (!recovery) {
    return { status: 'noop', reason: 'no_recoverable_run' };
  }

  const restoredCellIds: string[] = [];
  for (const cell of recovery.cells) {
    const created = await notebookRepo.createCell(notebookId, {
      content: cell.content,
      title: cell.title ?? undefined,
      cellType: cell.cellType,
      position: cell.position,
      metadata: {
        ...cell.metadata,
        recoveredFromRunId: recovery.candidate.runId,
        recoveredFromNotebookId: recovery.candidate.sourceNotebookId,
        recoveredAt: new Date().toISOString()
      }
    });

    if (cell.execution && cell.execution.executionStatus !== 'idle') {
      await notebookRepo.updateCell(created.cellId, {
        executionStatus: cell.execution.executionStatus,
        executionCount: 1,
        executionOrder: cell.execution.executionOrder ?? null,
        executionDurationMs: cell.execution.executionDurationMs,
        isDirty: false,
        output: cell.execution.output,
        outputRefs: []
      });
    }

    restoredCellIds.push(created.cellId);
  }

  notebookService.broadcast(notebookId, 'notebook:cells_reset', {
    notebookId,
    cells: await notebookRepo.getCellsByNotebook(notebookId)
  });

  return {
    status: 'recovered',
    candidate: recovery.candidate,
    restoredCellIds
  };
}
