/**
 * timelineOps - Timeline mutation helpers extracted from preprocessingStore
 *
 * Pure functions that compute the next state slice for timeline-related
 * store actions (editStepCode, markInterruptedSteps, processToolCall,
 * processToolResult).
 */

import { asRecord, asString } from '@/lib/typeCoercion';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type {
  StepCellBinding,
  TransformationEvent,
  TransformationStatus
} from '@/types/preprocessing';
import {
  buildEventFromToolCall,
  buildEventFromToolResult,
  getRunIdFromToolResult,
  hashText,
  upsertTimelineEvent
} from './eventBuilders';

// ---------------------------------------------------------------------------
// editStepCode
// ---------------------------------------------------------------------------

export function applyEditStepCode(
  timeline: TransformationEvent[],
  stepBindings: Record<string, StepCellBinding>,
  stepId: string,
  code: string
): { timeline: TransformationEvent[]; stepBindings: Record<string, StepCellBinding> } {
  const codeHash = hashText(code);
  return {
    timeline: timeline.map((event) =>
      event.stepId === stepId
        ? {
            ...event,
            code,
            codeHash,
            status: 'pending' as TransformationStatus,
            updatedAt: Date.now()
          }
        : event
    ),
    stepBindings: {
      ...stepBindings,
      [stepId]: {
        ...(stepBindings[stepId] ?? {
          stepId,
          cellIds: [],
          lastSyncedAt: Date.now()
        }),
        codeHash,
        lastSyncedAt: Date.now()
      }
    }
  };
}

// ---------------------------------------------------------------------------
// markInterruptedSteps
// ---------------------------------------------------------------------------

export function applyMarkInterrupted(
  timeline: TransformationEvent[],
  reason: string
): { timeline: TransformationEvent[]; error: string } {
  const message = reason.trim() || 'Preprocessing run was interrupted before completion.';
  const nextTimeline = timeline.map((event) => {
    if (event.status !== 'pending' && event.status !== 'running') {
      return event;
    }
    return {
      ...event,
      status: 'failed' as TransformationStatus,
      error: event.error ?? `Interrupted before completion: ${message}`,
      updatedAt: Date.now()
    };
  });

  return { timeline: nextTimeline, error: message };
}

// ---------------------------------------------------------------------------
// processToolCall
// ---------------------------------------------------------------------------

export function applyProcessToolCall(
  timeline: TransformationEvent[],
  call: ToolCall,
  fallbackRunId: string | null
): { timeline: TransformationEvent[] } | null {
  const event = buildEventFromToolCall(call, fallbackRunId);
  if (!event) return null;
  return { timeline: upsertTimelineEvent(timeline, event) };
}

// ---------------------------------------------------------------------------
// processToolResult
// ---------------------------------------------------------------------------

interface ProcessToolResultState {
  runId: string | null;
  latestCheckpointId: string | null;
  timeline: TransformationEvent[];
  stepBindings: Record<string, StepCellBinding>;
}

export function applyProcessToolResult(
  state: ProcessToolResultState,
  call: ToolCall,
  result: ToolResult,
  fallbackRunId: string | null
): Partial<ProcessToolResultState> | null {
  const event = buildEventFromToolResult(call, result, fallbackRunId);
  if (!event) return null;

  let nextRunId = state.runId;
  const resultRunId = getRunIdFromToolResult(result);
  if (resultRunId) nextRunId = resultRunId;

  const timeline = upsertTimelineEvent(state.timeline, event);
  const bindings = { ...state.stepBindings };

  const previousBinding = bindings[event.stepId];
  bindings[event.stepId] = {
    stepId: event.stepId,
    cellIds: [...new Set([...(previousBinding?.cellIds ?? []), ...event.cellIds])],
    codeHash: event.codeHash ?? previousBinding?.codeHash,
    version: event.version ?? previousBinding?.version,
    lastSyncedAt: Date.now()
  };

  const output = asRecord(result.output);
  const checkpointId = asString(output.checkpointId);

  return {
    runId: nextRunId,
    latestCheckpointId: checkpointId ?? state.latestCheckpointId,
    timeline,
    stepBindings: bindings
  };
}
