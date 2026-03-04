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
  NlQueryExplanation,
  NlQueryStreamEvent,
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

export type { NlQueryStreamEvent, NlStreamPhaseEvent, NlStreamPhaseId };

export type NlWorkPhaseStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface NlWorkPhaseState {
  phaseId: NlStreamPhaseId;
  label: string;
  status: NlWorkPhaseStatus;
  lastSummary?: string;
  events: NlStreamPhaseEvent[];
}
