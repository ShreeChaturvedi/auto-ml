import { executeToolCalls } from '@/lib/api/llm';
import { asBoolean, asRecord, asString, asStringArray } from '@/lib/typeCoercion';
import type { AvailableTable, TransformationEvent } from '@/types/preprocessing';

import type { ReplayCompatibilityReport } from '../preprocessingStore';

import { extractReferencedColumns } from './eventBuilders';

// ---------------------------------------------------------------------------
// evaluateReplayCompatibility — performs a local pre-check then optionally
// calls the backend `restore_checkpoint` tool to get an authoritative answer.
// ---------------------------------------------------------------------------

interface ReplayCompatibilityInput {
  projectId: string;
  tables: AvailableTable[];
  selectedDatasetId: string | null;
  timeline: TransformationEvent[];
  runId: string | null;
  latestCheckpointId: string | null;
}

/**
 * Runs the local column-reference pre-check and (when possible) the
 * backend authoritative check.  Returns a `ReplayCompatibilityReport`.
 */
export async function evaluateReplayCompat(
  input: ReplayCompatibilityInput
): Promise<ReplayCompatibilityReport> {
  const { projectId, tables, selectedDatasetId, timeline, runId, latestCheckpointId } = input;

  const selectedTable = tables.find((table) => table.datasetId === selectedDatasetId);
  const availableColumns = new Set(selectedTable?.columns?.map((column) => column.name) ?? []);
  const localIssues: string[] = [];

  timeline.forEach((event) => {
    if (!event.code) {
      return;
    }
    const referencedColumns = extractReferencedColumns(event.code);
    const missingColumns = referencedColumns.filter((column) => !availableColumns.has(column));
    if (missingColumns.length > 0) {
      localIssues.push(`${event.title}: missing columns (${missingColumns.join(', ')})`);
    }
    if (event.validation?.schemaDrift) {
      localIssues.push(`${event.title}: schema drift detected in validation.`);
    }
  });

  if (runId && latestCheckpointId && selectedDatasetId) {
    try {
      const response = await executeToolCalls(projectId, [
        {
          id: `replay-check-${Date.now()}`,
          tool: 'restore_checkpoint',
          args: {
            runId,
            checkpointId: latestCheckpointId,
            operation: 'compatibility_check',
            replayDatasetId: selectedDatasetId
          }
        }
      ]);
      const result = response.results[0];
      const output = asRecord(result?.output);
      const compatibilityIssues = asStringArray(output?.compatibilityIssues).length
        ? asStringArray(output?.compatibilityIssues)
        : Array.isArray(output?.compatibilityIssues)
          ? (output.compatibilityIssues as Array<Record<string, unknown>>).map((issue) => {
              const issueStepId = asString(issue.stepId) ?? 'unknown-step';
              const column = asString(issue.column) ?? 'unknown-column';
              const issueType = asString(issue.issue) ?? 'incompatibility';
              return `${issueStepId}: ${issueType} on ${column}`;
            })
          : [];

      const backendIncompatible =
        Boolean(result?.error) ||
        asBoolean(output?.isError) === true ||
        asString(output?.reasonCode) === 'REPLAY_INCOMPATIBLE_DATASET';

      return {
        checkedAt: Date.now(),
        compatible: !backendIncompatible,
        issues: backendIncompatible ? compatibilityIssues : [],
        source: 'backend_authoritative',
        precheckIssues: localIssues,
        checkpointId: latestCheckpointId
      };
    } catch (error) {
      console.error('[preprocessingStore] Backend replay compatibility check failed:', error);
    }
  }

  return {
    checkedAt: Date.now(),
    compatible: localIssues.length === 0,
    issues: localIssues,
    source: 'local_precheck',
    precheckIssues: localIssues
  };
}
