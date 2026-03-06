/**
 * Types for the natural-language query generation workflow.
 *
 * `NlGenerationResult` is the canonical shape passed between NlQueryWorkflow,
 * QueryPanel, and DataViewerTab.  It bundles everything the parent needs to
 * create a query artifact without making a second network request when the
 * user approves an unedited SQL result.
 */

import type {
  QueryResultPayload,
  NlProviderInfo,
  NlQueryExplanation,
  NlQueryStreamEvent,
  NlModelWorkKind,
  NlModelWorkStreamEvent,
  NlStreamPhaseEvent,
  NlStreamPhaseId
} from '@/lib/api/query';

export interface NlGenerationResult {
  /** Server-generated SQL for the NL query. */
  sql: string;
  /** Human-readable explanation of why this SQL was generated. */
  rationale: string;
  /** Structured explanation metadata (including confidence mode/tier and assumptions). */
  explanation: NlQueryExplanation;
  /** Unique query ID returned by the server (used for deduplication / caching). */
  queryId: string;
  /** Provider/model metadata used for the generation. */
  provider: NlProviderInfo;
  /** Whether the result was served from the server-side cache. */
  cached: boolean;
  /** Optional execution error from the initial generated SQL dry-run. */
  queryExecutionError?: string | null;
  /**
   * The full query result that was returned alongside the generated SQL.
   * If the user approves WITHOUT editing, this result can be used directly
   * to create the artifact without a second round-trip.
   */
  queryResult: QueryResultPayload | null;
}

export type {
  NlProviderInfo,
  NlModelWorkKind,
  NlModelWorkStreamEvent,
  NlQueryStreamEvent,
  NlStreamPhaseEvent,
  NlStreamPhaseId
};

export type NlWorkPhaseStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface NlWorkPhaseState {
  phaseId: NlStreamPhaseId;
  label: string;
  status: NlWorkPhaseStatus;
  lastSummary?: string;
  events: NlStreamPhaseEvent[];
}

export type NlModelWorkBlockStatus = 'streaming' | 'completed' | 'failed';

export interface NlModelWorkBlockState {
  blockId: string;
  kind: NlModelWorkKind;
  title: string;
  phaseId?: NlStreamPhaseId;
  status: NlModelWorkBlockStatus;
  content: string;
  startedAt: string;
  updatedAt: string;
  details?: Record<string, unknown>;
}

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
          status: 'completed',
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
      return { ...entry, status: 'streaming' };
    }
    if (entry.status === 'streaming') {
      return { ...entry, status: 'completed' };
    }
    return entry;
  });
}

export function finalizeNlModelWorkBlocks(previous: NlModelWorkBlockState[]): NlModelWorkBlockState[] {
  return previous.map((entry) => (
    entry.status === 'streaming'
      ? { ...entry, status: 'completed' }
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
