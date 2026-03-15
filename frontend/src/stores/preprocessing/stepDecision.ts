import { apiRequest } from '@/lib/api/client';
import { asBoolean, asRecord, asString } from '@/lib/typeCoercion';
import type { TransformationEvent, TransformationStatus } from '@/types/preprocessing';

// ---------------------------------------------------------------------------
// commitStepDecision — shared helper used by both approveStep and rejectStep.
// Optimistically marks the step as 'running', calls the backend, and either
// hydrates the updated run or rolls back on failure.
// ---------------------------------------------------------------------------

interface PreprocessingStateData {
  timeline: TransformationEvent[];
  error: string | null;
}

export interface CommitStepDecisionArgs {
  projectId: string;
  stepId: string;
  runId: string;
  selectedDatasetId: string | null;
  approved: boolean;
  /** Only relevant when approved is false. */
  rejectionReason?: string;
  previousStatus: TransformationStatus;
  set: (
    partial:
      | Partial<PreprocessingStateData>
      | ((state: PreprocessingStateData) => Partial<PreprocessingStateData>)
  ) => void;
  hydrateRunById: (projectId: string, runId: string) => Promise<void>;
}

export async function commitStepDecision({
  projectId,
  stepId,
  runId,
  selectedDatasetId,
  approved,
  rejectionReason,
  previousStatus,
  set,
  hydrateRunById
}: CommitStepDecisionArgs): Promise<void> {
  const action = approved ? 'approve' : 'reject';

  // Optimistically mark the step as running.
  set((current) => ({
    timeline: current.timeline.map((candidate) =>
      candidate.stepId === stepId
        ? { ...candidate, status: 'running', error: undefined, updatedAt: Date.now() }
        : candidate
    ),
    error: null
  }));

  try {
    const result = await apiRequest<{ id: string; tool: string; output?: unknown; error?: string }>(
      '/preprocessing/step-decision',
      {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          runId,
          stepId,
          approved,
          ...(approved && selectedDatasetId ? { datasetId: selectedDatasetId } : {}),
          ...(!approved && rejectionReason ? { rejectionReason } : {})
        })
      }
    );
    const output = asRecord(result?.output);
    const isError = Boolean(result?.error) || asBoolean(output?.isError) === true;

    if (isError) {
      const message =
        result?.error ??
        asString(output?.message) ??
        asString(output?.reasonCode) ??
        `Failed to ${action} step ${stepId}.`;
      set((current) => ({
        timeline: current.timeline.map((candidate) =>
          candidate.stepId === stepId
            ? { ...candidate, status: previousStatus, error: message, updatedAt: Date.now() }
            : candidate
        ),
        error: message
      }));
      return;
    }

    const nextRunId = asString(output?.runId) ?? runId;
    await hydrateRunById(projectId, nextRunId);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Failed to ${action} step ${stepId}.`;
    set((current) => ({
      timeline: current.timeline.map((candidate) =>
        candidate.stepId === stepId
          ? { ...candidate, status: previousStatus, error: message, updatedAt: Date.now() }
          : candidate
      ),
      error: message
    }));
  }
}
