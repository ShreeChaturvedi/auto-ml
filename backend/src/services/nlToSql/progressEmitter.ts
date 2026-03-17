import { randomUUID } from 'node:crypto';

import type {
  NlModelWorkBlockCompletedEvent,
  NlModelWorkBlockStartedEvent,
  NlModelWorkDeltaEvent,
  NlModelWorkEvent,
  NlModelWorkKind,
  NlProgressEvent,
  NlProgressPhaseId,
  NlProviderInfo
} from './types.js';

export function emitNlProgress(
  onProgress: ((event: NlProgressEvent) => void) | undefined,
  event: Omit<NlProgressEvent, 'timestamp'>
) {
  if (!onProgress) {
    return;
  }

  onProgress({
    ...event,
    timestamp: new Date().toISOString()
  });
}

export function emitNlModelWork(
  onModelWork: ((event: NlModelWorkEvent) => void) | undefined,
  event:
    | Omit<NlModelWorkBlockStartedEvent, 'timestamp'>
    | Omit<NlModelWorkDeltaEvent, 'timestamp'>
    | Omit<NlModelWorkBlockCompletedEvent, 'timestamp'>
) {
  if (!onModelWork) {
    return;
  }

  onModelWork({
    ...event,
    timestamp: new Date().toISOString()
  });
}

export function createModelWorkBlock(params: {
  onModelWork?: (event: NlModelWorkEvent) => void;
  phaseId: NlProgressPhaseId;
  kind: NlModelWorkKind;
  title: string;
  details?: Record<string, unknown>;
  provider?: NlProviderInfo;
}) {
  let started = false;
  let completed = false;
  const blockId = randomUUID();

  const withProviderDetails = (details?: Record<string, unknown>) => ({
    ...(params.details ?? {}),
    ...(details ?? {}),
    provider: params.provider
  });

  return {
    blockId,
    start(details?: Record<string, unknown>) {
      if (started || completed) {
        return;
      }
      started = true;
      emitNlModelWork(params.onModelWork, {
        type: 'model_work_block_started',
        blockId,
        phaseId: params.phaseId,
        kind: params.kind,
        title: params.title,
        details: withProviderDetails(details)
      });
    },
    delta(content: string, details?: Record<string, unknown>) {
      if (completed || !content.trim()) {
        return;
      }
      if (!started) {
        this.start();
      }
      emitNlModelWork(params.onModelWork, {
        type: 'model_work_delta',
        blockId,
        phaseId: params.phaseId,
        kind: params.kind,
        title: params.title,
        delta: content,
        details: withProviderDetails(details)
      });
    },
    complete(details?: Record<string, unknown>, status: 'completed' | 'failed' = 'completed') {
      if (completed || !started) {
        return;
      }
      completed = true;
      emitNlModelWork(params.onModelWork, {
        type: 'model_work_block_completed',
        blockId,
        phaseId: params.phaseId,
        kind: params.kind,
        title: params.title,
        details: withProviderDetails(details),
        status
      });
    }
  };
}
