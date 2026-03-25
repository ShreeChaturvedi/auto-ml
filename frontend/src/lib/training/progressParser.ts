/**
 * progressParser — Parses structured training progress markers from cell output.
 *
 * The backend training contract instructs the LLM to emit structured print
 * statements during training. This parser extracts them into typed objects.
 */

export interface TrainingStartEvent {
  type: 'start';
  totalEpochs: number;
  modelType: string;
}

export interface TrainingProgressEvent {
  type: 'progress';
  epoch: number;
  totalEpochs: number;
  metrics: Record<string, number>;
}

export interface TrainingCompleteEvent {
  type: 'complete';
  finalMetrics: Record<string, number>;
}

export type TrainingEvent = TrainingStartEvent | TrainingProgressEvent | TrainingCompleteEvent;

/**
 * Parse a single line of training output. Returns null if the line
 * doesn't match any known training progress marker.
 */
export function parseTrainingOutput(text: string): TrainingEvent | null {
  const trimmed = text.trim();

  if (trimmed.startsWith('__TRAIN_START__')) {
    const parts = trimmed.split('|');
    if (parts.length >= 3) {
      return {
        type: 'start',
        totalEpochs: parseInt(parts[1], 10) || 0,
        modelType: parts[2] || 'unknown',
      };
    }
  }

  if (trimmed.startsWith('__TRAIN_PROGRESS__')) {
    const parts = trimmed.split('|');
    if (parts.length >= 4) {
      let metrics: Record<string, number> = {};
      try {
        metrics = JSON.parse(parts[3]);
      } catch { /* ignore malformed JSON */ }
      return {
        type: 'progress',
        epoch: parseInt(parts[1], 10) || 0,
        totalEpochs: parseInt(parts[2], 10) || 0,
        metrics,
      };
    }
  }

  if (trimmed.startsWith('__TRAIN_COMPLETE__')) {
    const parts = trimmed.split('|');
    let finalMetrics: Record<string, number> = {};
    if (parts.length >= 2) {
      try {
        finalMetrics = JSON.parse(parts[1]);
      } catch { /* ignore malformed JSON */ }
    }
    return { type: 'complete', finalMetrics };
  }

  return null;
}

/**
 * Scan a full stdout string for all training events.
 */
export function parseAllTrainingEvents(stdout: string): TrainingEvent[] {
  return stdout
    .split('\n')
    .map(parseTrainingOutput)
    .filter((e): e is TrainingEvent => e !== null);
}
