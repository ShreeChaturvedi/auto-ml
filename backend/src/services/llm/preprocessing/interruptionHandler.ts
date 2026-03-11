import { randomUUID } from 'node:crypto';

import type { PreprocessingRunRepository } from '../../../repositories/preprocessingRunRepository.js';
import type { PreprocessingLangGraphRuntime } from '../langgraph/preprocessingRuntime.js';
import { appendEvent, nowIso } from '../preprocessingTools/helpers.js';

import { toPreprocessingGraphState } from './stateSync.js';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface PreprocessingRunInterruptionInput {
  projectId: string;
  runIds: string[];
  reason: string;
  source?: 'provider_error' | 'stream_aborted';
}

export interface PreprocessingRunInterruptionResult {
  attempted: number;
  updated: number;
  skipped: number;
}

export interface PreprocessingRunInterruptionDependencies {
  runRepository: PreprocessingRunRepository;
  runtime: PreprocessingLangGraphRuntime;
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createPreprocessingRunInterruptionMarker(deps: PreprocessingRunInterruptionDependencies) {
  return async function markPreprocessingRunsInterrupted(
    input: PreprocessingRunInterruptionInput
  ): Promise<PreprocessingRunInterruptionResult> {
    const runIds = [...new Set(input.runIds.map((runId) => runId.trim()).filter(Boolean))];
    if (runIds.length === 0) {
      return { attempted: 0, updated: 0, skipped: 0 };
    }

    const reason = input.reason.trim() || 'Preprocessing stream was interrupted before completion.';
    const source = input.source ?? 'provider_error';
    let updated = 0;
    let skipped = 0;

    for (const runId of runIds) {
      const run = await deps.runRepository.getById(runId);
      if (!run || run.projectId !== input.projectId) {
        skipped += 1;
        continue;
      }

      const interruptedStepIds: string[] = [];
      const timestamp = nowIso();
      for (const step of Object.values(run.steps)) {
        if (step.status !== 'pending' && step.status !== 'running') {
          continue;
        }
        interruptedStepIds.push(step.stepId);
        step.status = 'failed';
        step.decisionReason = reason;
        if (step.approvalDecision === 'pending') {
          step.approvalDecision = 'rejected';
        }
        step.updatedAt = timestamp;
      }

      let graphState = toPreprocessingGraphState(run.langGraphState);
      if (!graphState) {
        graphState = await deps.runtime.bootstrapRun({
          runId: run.runId,
          projectId: run.projectId,
          activeDatasetId: run.activeDatasetId
        });
      }
      run.langGraphRuntime = 'langgraph';
      run.langGraphState = {
        ...graphState,
        currentStage: 'completed',
        nextStage: 'completed',
        isCompleted: true,
        lastError: reason,
        updatedAt: timestamp
      } as unknown as Record<string, unknown>;

      appendEvent(run, {
        eventId: randomUUID(),
        runId: run.runId,
        type: 'run_interrupted',
        stepId: interruptedStepIds[interruptedStepIds.length - 1],
        datasetId: run.activeDatasetId,
        payload: {
          reason,
          source,
          interruptedStepIds
        }
      });

      await deps.runRepository.save(run);
      updated += 1;
    }

    return {
      attempted: runIds.length,
      updated,
      skipped
    };
  };
}
