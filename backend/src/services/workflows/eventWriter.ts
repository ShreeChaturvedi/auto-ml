import type { Response } from 'express';

import type {
  WorkflowArtifactUpdatedEvent,
  WorkflowErrorEvent,
  WorkflowPauseEvent,
  WorkflowRunState,
  WorkflowStateEvent,
  WorkflowToolExecutedEvent
} from './types.js';

export function writeWorkflowEvent(res: Response, payload: unknown): void {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`${JSON.stringify(payload)}\n`);
  }
}

function deriveWorkflowMode(
  state: WorkflowRunState,
  phaseContext?: Record<string, unknown>
): WorkflowStateEvent['state']['mode'] {
  if (state.status === 'completed') {
    return 'completed';
  }
  if (state.status.startsWith('failed')) {
    return 'failed';
  }
  if (state.pendingInputKind || state.status === 'paused') {
    return 'await_input';
  }

  const controller = phaseContext?.controller;
  if (controller && typeof controller === 'object' && !Array.isArray(controller)) {
    const currentNode = (controller as Record<string, unknown>).currentNode;
    if (typeof currentNode === 'string') {
      if (currentNode === 'answer') {
        return 'answer';
      }
      if (currentNode === 'summarize') {
        return 'summarize';
      }
    }
  }

  return 'action';
}

export function buildWorkflowStateEvent(
  state: WorkflowRunState,
  phaseContext?: Record<string, unknown>
): WorkflowStateEvent {
  return {
    type: 'workflow_state',
    state: {
      ...state,
      mode: deriveWorkflowMode(state, phaseContext),
      phaseContext
    }
  };
}

export function buildWorkflowErrorEvent(
  message: string,
  retryable: boolean,
  code?: string,
  state?: WorkflowStateEvent['state']
): WorkflowErrorEvent {
  return {
    type: 'workflow_error',
    message,
    retryable,
    code,
    state
  };
}

export function buildWorkflowPauseEvent(
  reason: string,
  pendingInputKind?: WorkflowRunState['pendingInputKind'],
  message?: string,
  ui?: Record<string, unknown> | null,
  state?: WorkflowStateEvent['state']
): WorkflowPauseEvent {
  return {
    type: 'workflow_pause',
    reason,
    pendingInputKind,
    message,
    ui,
    state
  };
}

export function buildArtifactEvent(
  artifactType: 'ui' | 'plan' | 'summary',
  artifact: Record<string, unknown>,
  state?: WorkflowStateEvent['state']
): WorkflowArtifactUpdatedEvent {
  return {
    type: 'artifact_updated',
    artifact: {
      kind: artifactType,
      ...artifact
    },
    state
  };
}

export function buildToolEvent(
  call: WorkflowToolExecutedEvent['call'],
  result: WorkflowToolExecutedEvent['result'],
  state?: WorkflowStateEvent['state']
): WorkflowToolExecutedEvent {
  return {
    type: 'tool_executed',
    call,
    result,
    state
  };
}
