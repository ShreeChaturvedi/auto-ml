/**
 * Runtime state machine functions for the NL query phase/model-work pipeline.
 *
 * Types live in `@/types/nlQuery`; this module owns the mutable reduction logic
 * that drives NlQueryWorkflow and its sub-components.
 */

import type {
  NlModelWorkBlockState,
  NlModelWorkBlockStatus,
  NlModelWorkStreamEvent,
  NlStreamPhaseEvent,
  NlStreamPhaseId,
  NlWorkPhaseState,
  NlWorkPhaseStatus
} from '@/types/nlQuery';

export const NL_WORK_PIPELINE_DONE_SUMMARY = 'NL query pipeline finished.';

export const NL_WORK_PHASE_IDS: NlStreamPhaseId[] = [
  'schema_context',
  'planning',
  'sql_generation',
  'validation',
  'initial_execution',
  'repair',
  'done'
];

export const NL_WORK_PHASE_LABELS: Record<NlStreamPhaseId, string> = {
  schema_context: 'Schema context',
  planning: 'Planning',
  sql_generation: 'SQL generation',
  validation: 'Validation',
  initial_execution: 'Initial execution',
  repair: 'Repair',
  done: 'Done'
};

export function getNlWorkPhaseLabel(phaseId: NlStreamPhaseId): string {
  return NL_WORK_PHASE_LABELS[phaseId] ?? 'Done';
}

export function createInitialNlWorkPhases(): NlWorkPhaseState[] {
  return NL_WORK_PHASE_IDS.map((phaseId) => ({
    phaseId,
    label: getNlWorkPhaseLabel(phaseId),
    status: 'pending',
    events: []
  }));
}

function mapPhaseTypeToStatus(type: NlStreamPhaseEvent['type']): NlWorkPhaseStatus {
  if (type === 'phase_completed') return 'completed';
  if (type === 'phase_failed') return 'failed';
  return 'active';
}

export function applyNlWorkPhaseEvent(
  previous: NlWorkPhaseState[],
  event: NlStreamPhaseEvent
): NlWorkPhaseState[] {
  const targetStatus = mapPhaseTypeToStatus(event.type);
  const targetIndex = previous.findIndex((entry) => entry.phaseId === event.phaseId);
  if (targetIndex === -1) {
    return previous;
  }

  return previous.map((entry, index) => {
    if (entry.phaseId === event.phaseId) {
      return {
        ...entry,
        status: targetStatus,
        lastSummary: event.summary,
        events: [...entry.events, event]
      };
    }

    if (
      (targetStatus === 'active' || targetStatus === 'completed')
      && index < targetIndex
      && entry.status === 'pending'
    ) {
      return { ...entry, status: 'completed' };
    }

    if (targetStatus === 'active' && entry.status === 'active') {
      return { ...entry, status: 'completed' };
    }

    return entry;
  });
}

export function finalizeNlWorkPhasesWithoutStream(previous: NlWorkPhaseState[]): NlWorkPhaseState[] {
  if (previous.some((entry) => entry.events.length > 0)) {
    return previous;
  }

  return previous.map((entry) => {
    if (entry.phaseId === 'repair') {
      return entry;
    }
    if (entry.phaseId === 'done') {
      return {
        ...entry,
        status: 'completed',
        lastSummary: NL_WORK_PIPELINE_DONE_SUMMARY
      };
    }
    return {
      ...entry,
      status: 'completed'
    };
  });
}

export function completeNlWorkDonePhase(previous: NlWorkPhaseState[]): NlWorkPhaseState[] {
  const donePhase = previous.find((entry) => entry.phaseId === 'done');
  if (!donePhase || donePhase.status === 'completed' || donePhase.status === 'failed') {
    return previous;
  }

  return previous.map((entry) => (
    entry.phaseId === 'done'
      ? {
          ...entry,
          status: 'completed' as NlWorkPhaseStatus,
          lastSummary: entry.lastSummary ?? NL_WORK_PIPELINE_DONE_SUMMARY
        }
      : entry
  ));
}

export function markNlWorkPhasesFailed(previous: NlWorkPhaseState[], message: string): NlWorkPhaseState[] {
  const activeIndex = previous.findIndex((entry) => entry.status === 'active');
  if (activeIndex >= 0) {
    return previous.map((entry, index) => {
      if (index === activeIndex) {
        return { ...entry, status: 'failed', lastSummary: message };
      }
      if (entry.phaseId === 'done') {
        return { ...entry, status: 'failed', lastSummary: message };
      }
      return entry;
    });
  }

  return previous.map((entry) => {
    if (entry.phaseId === 'done') {
      return { ...entry, status: 'failed', lastSummary: message };
    }
    return entry;
  });
}

function upsertModelWorkBlock(
  previous: NlModelWorkBlockState[],
  event: NlModelWorkStreamEvent
): { blocks: NlModelWorkBlockState[]; index: number } {
  const targetIndex = previous.findIndex((entry) => entry.blockId === event.blockId);
  if (targetIndex === -1) {
    return {
      blocks: [
        ...previous,
        {
          blockId: event.blockId,
          kind: event.kind,
          title: event.title,
          phaseId: event.phaseId,
          status: event.type === 'model_work_block_completed' ? (event.status ?? 'completed') : 'streaming',
          content: event.type === 'model_work_delta' ? event.delta : '',
          startedAt: event.timestamp,
          updatedAt: event.timestamp,
          details: event.details
        }
      ],
      index: previous.length
    };
  }

  return {
    index: targetIndex,
    blocks: previous.map((entry, index) => {
      if (index !== targetIndex) {
        return entry;
      }

      return {
        ...entry,
        kind: event.kind,
        title: event.title,
        phaseId: event.phaseId ?? entry.phaseId,
        status: event.type === 'model_work_block_completed' ? (event.status ?? 'completed') : entry.status,
        content: event.type === 'model_work_delta' ? `${entry.content}${event.delta}` : entry.content,
        updatedAt: event.timestamp,
        details: event.details ?? entry.details
      };
    })
  };
}

export function applyNlModelWorkEvent(
  previous: NlModelWorkBlockState[],
  event: NlModelWorkStreamEvent
): NlModelWorkBlockState[] {
  const { blocks, index } = upsertModelWorkBlock(previous, event);
  if (event.type !== 'model_work_block_started') {
    return blocks;
  }

  return blocks.map((entry, entryIndex) => {
    if (entryIndex === index) {
      return { ...entry, status: 'streaming' as NlModelWorkBlockStatus };
    }
    if (entry.status === 'streaming') {
      return { ...entry, status: 'completed' as NlModelWorkBlockStatus };
    }
    return entry;
  });
}

export function finalizeNlModelWorkBlocks(previous: NlModelWorkBlockState[]): NlModelWorkBlockState[] {
  return previous.map((entry) => (
    entry.status === 'streaming'
      ? { ...entry, status: 'completed' as NlModelWorkBlockStatus }
      : entry
  ));
}

const FALLBACK_PHASE: NlWorkPhaseState = {
  phaseId: 'done',
  label: getNlWorkPhaseLabel('done'),
  status: 'pending',
  events: []
};

export function getPrimaryNlWorkPhase(phases: NlWorkPhaseState[]): NlWorkPhaseState {
  return phases.find((entry) => entry.status === 'active')
    ?? phases.find((entry) => entry.status === 'failed')
    ?? [...phases].reverse().find((entry) => entry.status === 'completed')
    ?? phases[0]
    ?? FALLBACK_PHASE;
}
