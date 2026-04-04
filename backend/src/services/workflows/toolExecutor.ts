import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';

import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import type { ToolResult } from '../../types/llm.js';
import { ToolCallSchema } from '../../types/llm.js';
import { buildFeatureCodeCellTitle, buildFeatureLoadCell } from '../featureEngineering/notebookCells.js';
import { executeMcpTool } from '../mcp/mcpAdapter.js';

import { buildToolEvent } from './eventWriter.js';
import { MAX_IDENTICAL_TOOL_CALLS, MAX_SINGLE_TOOL_CALLS, MAX_WORKFLOW_ITERATIONS, type WorkflowGraphState } from './graphState.js';
import type { PhaseConfig } from './phaseConfig.js';
import { extractConfigurable } from './phases/types.js';
import { getApprovalPauseDetails } from './turnState.js';
import type { WorkflowPendingInputKind } from './types.js';

const MAX_TOOL_RESULT_CHARS = 50_000;
const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

function truncateToolResult(result: ToolResult): ToolResult {
  if (result.output === undefined || result.output === null) return result;
  const json = JSON.stringify(result.output);
  if (json.length <= MAX_TOOL_RESULT_CHARS) return result;
  if (result.tool === 'run_cell' && result.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
    const output = result.output as Record<string, unknown>;
    const stdout = typeof output.stdout === 'string'
      ? output.stdout.slice(0, MAX_TOOL_RESULT_CHARS)
      : output.stdout;
    const stderr = typeof output.stderr === 'string'
      ? output.stderr.slice(0, MAX_TOOL_RESULT_CHARS)
      : output.stderr;
    return {
      ...result,
      output: {
        _truncated: true,
        _originalSize: json.length,
        status: typeof output.status === 'string' ? output.status : undefined,
        error: typeof output.error === 'string' ? output.error : undefined,
        executionMs: typeof output.executionMs === 'number' ? output.executionMs : undefined,
        cellId: typeof output.cellId === 'string' ? output.cellId : undefined,
        stdout,
        stderr
      }
    };
  }
  return {
    ...result,
    output: {
      _truncated: true,
      _originalSize: json.length,
      notice: `Result truncated from ${json.length} to ${MAX_TOOL_RESULT_CHARS} characters.`,
      data: json.slice(0, MAX_TOOL_RESULT_CHARS)
    }
  };
}

function getPauseDetails(results: ToolResult[]): {
  pendingInputKind: WorkflowPendingInputKind;
  pauseReason: string;
} | null {
  return getApprovalPauseDetails(results);
}

async function executeWorkflowToolCall(
  state: WorkflowGraphState,
  call: z.infer<typeof ToolCallSchema>,
  phaseConfig: PhaseConfig | undefined
): Promise<ToolResult> {
  const approvalSource = resolveApprovalSource(state, call.tool);
  const enrichedArgs: Record<string, unknown> = {
    ...(call.args ?? {}),
    ...(state.turn.datasetId && call.tool !== 'set_active_dataset' ? { datasetId: state.turn.datasetId } : {}),
    ...(state.turn.notebookId ? { notebookId: state.turn.notebookId } : {}),
    toolCallId: call.id,
    approvalSource
  };

  // Feature engineering lifecycle tools need a draft-scoped run identifier.
  // If the model omits one, bind them to the current workflow run instead of
  // falling back to the latest project-level feature run.
  if (phaseConfig?.phase === 'feature_engineering' && !('runId' in enrichedArgs)) {
    enrichedArgs.runId = state.run.runId;
  }

  // PhaseConfig dispatch for phase-specific tools
  if (phaseConfig?.isPhaseSpecificTool(call.tool)) {
    const phaseResult = await phaseConfig.executePhaseSpecificTool(
      call.tool,
      enrichedArgs,
      {
        projectId: state.turn.projectId,
        toolCallId: call.id,
        run: state.run,
        args: enrichedArgs,
        turn: state.turn
      }
    );
    return {
      id: call.id,
      tool: call.tool,
      output: phaseResult.output,
      error: phaseResult.error
    };
  }

  // MCP fallback for non-phase-specific tools (notebook, data tools).
  // Forward datasetId from the turn context so tools like list_project_files
  // can mark the active dataset (prevents the LLM from hallucinating columns
  // from sibling datasets in the same project).
  const result = await executeMcpTool(state.turn.projectId, call.tool, {
    ...(call.args ?? {}),
    ...(state.turn.datasetId && call.tool !== 'set_active_dataset' ? { datasetId: state.turn.datasetId } : {}),
    ...(state.turn.notebookId ? { notebookId: state.turn.notebookId } : {})
  });

  return {
    id: call.id,
    tool: call.tool,
    output: result.output,
    error: result.error
  };
}

function resolveApprovalSource(
  state: WorkflowGraphState,
  toolName: string
): 'agent' | 'user' {
  if (toolName !== 'commit_transformation_step') {
    return 'agent';
  }
  return state.run.pendingInputKind === 'approval' || state.controllerSummary?.pendingApproval === true
    ? 'user'
    : 'agent';
}

function extractLatestCellId(results: ToolResult[]): string | undefined {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const output = results[index]?.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      continue;
    }
    const record = output as Record<string, unknown>;
    if (typeof record.cellId === 'string') {
      return record.cellId;
    }
    const cell = record.cell;
    if (cell && typeof cell === 'object' && !Array.isArray(cell) && typeof (cell as Record<string, unknown>).cellId === 'string') {
      return (cell as Record<string, unknown>).cellId as string;
    }
  }
  return undefined;
}

function extractLatestRunCellContext(results: ToolResult[]): {
  status?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  executionMs?: number;
} | null {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result.tool !== 'run_cell') {
      continue;
    }
    const output = result.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      continue;
    }
    const record = output as Record<string, unknown>;
    return {
      status: typeof record.status === 'string' ? record.status : undefined,
      stdout: typeof record.stdout === 'string' ? record.stdout : undefined,
      stderr: typeof record.stderr === 'string' ? record.stderr : undefined,
      error: typeof record.error === 'string' ? record.error : result.error,
      executionMs: typeof record.executionMs === 'number' ? record.executionMs : undefined
    };
  }
  return null;
}

function extractLatestMaterializedFeatureId(results: ToolResult[]): string | undefined {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result.tool !== 'materialize_feature_code') {
      continue;
    }
    const output = result.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      continue;
    }
    const record = output as Record<string, unknown>;
    if (typeof record.featureId === 'string') {
      return record.featureId;
    }
  }
  return undefined;
}

async function buildFeatureNotebookFollowUp(
  state: WorkflowGraphState,
  executedCalls: z.infer<typeof ToolCallSchema>[],
  executedResults: ToolResult[]
): Promise<z.infer<typeof ToolCallSchema>[] | null> {
  if (state.turn.phase !== 'feature_engineering') {
    return null;
  }

  const currentTurnResults = [
    ...state.toolResultHistory.slice(state.turnStartToolCallCount),
    ...executedResults
  ];
  const latestFeatureId = extractLatestMaterializedFeatureId(currentTurnResults);
  if (!latestFeatureId) {
    return null;
  }

  const lastMaterializeIndex = (() => {
    for (let index = executedCalls.length - 1; index >= 0; index -= 1) {
      if (executedCalls[index]?.tool === 'materialize_feature_code') {
        return index;
      }
    }
    return -1;
  })();

  if (lastMaterializeIndex >= 0) {
    const materializeCall = executedCalls[lastMaterializeIndex];
    const materializeResult = executedResults[lastMaterializeIndex];
    const hasSuccessfulCodeWriteAfterMaterialize = executedCalls
      .slice(lastMaterializeIndex + 1)
      .some((call, offset) =>
        call.tool === 'write_cell'
        && call.args?.cellType === 'code'
        && executedResults[lastMaterializeIndex + 1 + offset]?.error == null
      );

    if (!hasSuccessfulCodeWriteAfterMaterialize && materializeResult?.error == null) {
      const code = typeof materializeCall.args?.code === 'string'
        ? materializeCall.args.code.trim()
        : '';
      const featureId = typeof materializeCall.args?.featureId === 'string'
        ? materializeCall.args.featureId
        : latestFeatureId;

      if (code && featureId) {
        let dataset;
        try {
          dataset = state.turn.datasetId
            ? await datasetRepository.getById(state.turn.datasetId)
            : undefined;
        } catch {
          dataset = undefined;
        }
        if (dataset) {
          const loadParsed = ToolCallSchema.safeParse({
            id: `wf-call-auto-load-feature-dataset-${featureId}`,
            tool: 'write_cell',
            args: {
              title: `Load ${dataset.filename}`,
              cellType: 'code',
              content: buildFeatureLoadCell(dataset),
              metadata: {
                phase: 'feature-engineering',
                role: 'feature-lifecycle-load',
                datasetId: dataset.datasetId,
                featureId
              }
            },
            rationale: `Load dataset ${dataset.filename} before executing feature ${featureId}.`
          });
          return loadParsed.success ? [loadParsed.data] : null;
        }

        const parsed = ToolCallSchema.safeParse({
          id: `wf-call-auto-write-feature-${featureId}`,
          tool: 'write_cell',
          args: {
            title: buildFeatureCodeCellTitle(featureId),
            cellType: 'code',
            content: code,
            metadata: {
              phase: 'feature-engineering',
              featureId,
              source: 'feature-lifecycle'
            }
          },
          rationale: `Write notebook code for feature ${featureId}.`
        });
        return parsed.success ? [parsed.data] : null;
      }
    }
  }

  const latestCall = executedCalls.at(-1);
  const latestResult = executedResults.at(-1);
  if (!latestCall || !latestResult) {
    return null;
  }

  const isWriteCodeCell = latestCall.tool === 'write_cell'
    && latestCall.args?.cellType === 'code'
    && latestResult.error == null;
  const isEditCell = latestCall.tool === 'edit_cell'
    && latestResult.error == null;

  if (isWriteCodeCell || isEditCell) {
    // For edit_cell, cellId comes from args; for write_cell, from the result output.
    const cellId = isEditCell
      ? (typeof latestCall.args?.cellId === 'string' ? latestCall.args.cellId : undefined)
      : extractLatestCellId([latestResult]);
    if (!cellId) {
      return null;
    }

    const latestCallMetadata = latestCall.args?.metadata;
    const metadataRecord = latestCallMetadata && typeof latestCallMetadata === 'object' && !Array.isArray(latestCallMetadata)
      ? latestCallMetadata as Record<string, unknown>
      : null;
    // For edit_cell, ensure featureId metadata is available for the downstream
    // run_cell -> execute_feature chain even if the LLM didn't pass metadata.
    const effectiveMetadata = metadataRecord ?? (isEditCell && latestFeatureId
      ? { phase: 'feature-engineering', featureId: latestFeatureId, source: 'feature-lifecycle' }
      : null);

    const parsed = ToolCallSchema.safeParse({
      id: `wf-call-auto-run-${cellId}`,
      tool: 'run_cell',
      args: {
        cellId,
        ...(effectiveMetadata ? { metadata: effectiveMetadata } : {})
      },
      rationale: isEditCell
        ? `Re-execute edited cell for feature ${latestFeatureId}.`
        : (metadataRecord?.role === 'feature-lifecycle-load'
          ? `Execute dataset load cell before feature ${latestFeatureId}.`
          : `Execute notebook cell for feature ${latestFeatureId}.`)
    });
    return parsed.success ? [parsed.data] : null;
  }

  if (latestCall.tool === 'run_cell') {
    const latestCallMetadata = latestCall.args?.metadata;
    const metadataRecord = latestCallMetadata && typeof latestCallMetadata === 'object' && !Array.isArray(latestCallMetadata)
      ? latestCallMetadata as Record<string, unknown>
      : null;
    const metadataRole = typeof metadataRecord?.role === 'string' ? metadataRecord.role : undefined;
    const featureId = typeof metadataRecord?.featureId === 'string' ? metadataRecord.featureId : latestFeatureId;
    const runCell = extractLatestRunCellContext([latestResult]);
    const cellId = extractLatestCellId([latestResult]) ?? extractLatestCellId(currentTurnResults);

    if (metadataRole === 'feature-lifecycle-load' && featureId) {
      const materializeCall = [...executedCalls]
        .reverse()
        .find((call) => call.tool === 'materialize_feature_code' && call.args?.featureId === featureId)
        ?? [...state.toolCallHistory.slice(state.turnStartToolCallCount)]
          .reverse()
          .find((call) => call.tool === 'materialize_feature_code' && call.args?.featureId === featureId);
      const code = typeof materializeCall?.args?.code === 'string'
        ? materializeCall.args.code.trim()
        : '';
      if (!code) {
        return null;
      }
      const parsed = ToolCallSchema.safeParse({
        id: `wf-call-auto-write-feature-${featureId}`,
        tool: 'write_cell',
        args: {
          title: buildFeatureCodeCellTitle(featureId),
          cellType: 'code',
          content: code,
          metadata: {
            phase: 'feature-engineering',
            featureId,
            source: 'feature-lifecycle'
          }
        },
        rationale: `Write notebook code for feature ${featureId}.`
      });
      return parsed.success ? [parsed.data] : null;
    }

    if (!featureId) {
      return null;
    }

    const parsed = ToolCallSchema.safeParse({
      id: `wf-call-auto-execute-feature-${featureId}`,
      tool: 'execute_feature',
      args: {
        featureId,
        ...(cellId ? { cellId } : {}),
        succeeded: runCell?.status === 'success',
        stdout: runCell?.stdout ?? '',
        stderr: runCell?.stderr ?? runCell?.error ?? '',
        executionMs: runCell?.executionMs,
        executionSource: 'notebook'
      },
      rationale: `Record notebook execution results for feature ${featureId}.`
    });
    return parsed.success ? [parsed.data] : null;
  }

  return null;
}

export async function executeToolsNode(
  state: WorkflowGraphState,
  config?: RunnableConfig
): Promise<Partial<WorkflowGraphState>> {
  const { sink, phaseConfig } = extractConfigurable(config);

  const nextResults: ToolResult[] = [];
  for (const call of state.pendingToolCalls) {
    const rawResult = await executeWorkflowToolCall(state, call, phaseConfig);
    const result = truncateToolResult(rawResult);
    nextResults.push(result);

    const toolEvent = buildToolEvent(
      call,
      {
        id: result.id,
        tool: result.tool,
        output: result.output,
        error: result.error
      },
      {
        ...state.run,
        currentNode: state.run.currentNode
      }
    );

    if (sink) {
      sink.emit(toolEvent);
    }
  }

  const featureFollowUpCalls = await buildFeatureNotebookFollowUp(
    state,
    state.pendingToolCalls,
    nextResults
  );
  if (featureFollowUpCalls && featureFollowUpCalls.length > 0) {
    return {
      toolCallHistory: state.pendingToolCalls,
      toolResultHistory: nextResults,
      pendingToolCalls: featureFollowUpCalls,
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      latestMessage: '',
      iteration: state.iteration + 1,
      pendingInputKind: null,
      pauseReason: null,
      nextStep: 'execute_tools',
      errorMessage: null,
      errorCode: null
    };
  }

  // Detect per-tool repetition using two complementary heuristics:
  //
  // 1. **Identical-call detection** (MAX_IDENTICAL_TOOL_CALLS):  If the same
  //    tool is called with the *exact same* serialized arguments N times, the
  //    model is truly stuck — not iterating toward a fix.
  //
  // 2. **Raw-count detection** (MAX_SINGLE_TOOL_CALLS / phase override):
  //    Even with different arguments, a single tool invoked too many times
  //    indicates the workflow is not progressing through its lifecycle.
  //
  // The per-phase override (`phaseConfig.maxSingleToolCalls`) lets phases
  // like preprocessing and feature engineering raise the raw-count ceiling
  // without affecting tighter phases like training.

  // Only count calls from THIS turn — skip calls carried over from previous
  // turns (stored before turnStartToolCallCount) so multi-turn workflows
  // don't accumulate toward the limit.
  const allToolCalls = [
    ...state.toolCallHistory.slice(state.turnStartToolCallCount),
    ...state.pendingToolCalls
  ];

  // Per-tool total counts
  const toolCallCounts = new Map<string, number>();
  // Per-(tool + serialized args) counts for identical-call detection
  const identicalCallCounts = new Map<string, number>();

  for (const call of allToolCalls) {
    toolCallCounts.set(call.tool, (toolCallCounts.get(call.tool) ?? 0) + 1);

    const argsKey = `${call.tool}::${JSON.stringify(call.args ?? {})}`;
    identicalCallCounts.set(argsKey, (identicalCallCounts.get(argsKey) ?? 0) + 1);
  }

  // Check for identical (stuck) loops first — these are always a bug.
  let stuckTool: string | undefined;
  let stuckCount = 0;
  for (const [key, count] of identicalCallCounts) {
    if (count > MAX_IDENTICAL_TOOL_CALLS) {
      stuckTool = key.split('::')[0];
      stuckCount = count;
      break;
    }
  }

  // Check raw-count limit (respecting per-phase override).
  const effectiveLimit = phaseConfig?.maxSingleToolCalls ?? MAX_SINGLE_TOOL_CALLS;
  let repeatedTool: string | undefined;
  if (!stuckTool) {
    for (const [tool, count] of toolCallCounts) {
      if (count > effectiveLimit) {
        repeatedTool = tool;
        break;
      }
    }
  }

  const pauseDetails = getPauseDetails(nextResults);
  const hasExceededIterations = state.iteration + 1 >= MAX_WORKFLOW_ITERATIONS;
  const hasStuckLoop = stuckTool !== undefined;

  // Raw-count repetition is only a warning — the model may legitimately call
  // the same tool many times with different arguments during complex workflows
  // (e.g. multi-feature proposals, iterative code fixes).  Only truly stuck
  // loops (identical args) and the iteration ceiling cause hard failures.
  if (repeatedTool) {
    const logger = await import('../../logging/logger.js');
    logger.appLogger.warn(
      `[toolExecutor] Tool "${repeatedTool}" called ${toolCallCounts.get(repeatedTool)!} times in this turn (soft limit: ${effectiveLimit}) — allowing workflow to continue`
    );
  }

  const isFailing = hasExceededIterations || hasStuckLoop;
  const errorMessage = hasStuckLoop
    ? `Workflow stuck \u2014 the model called "${stuckTool}" ${stuckCount} times with identical arguments. Try rephrasing your request.`
    : hasExceededIterations
      ? 'Workflow exceeded the maximum number of model/tool iterations for one turn.'
      : null;
  const errorCode = hasStuckLoop
    ? 'TOOL_CALL_LIMIT_EXCEEDED'
    : hasExceededIterations
      ? 'MAX_ITERATIONS_EXCEEDED'
      : null;

  return {
    toolCallHistory: state.pendingToolCalls,
    toolResultHistory: nextResults,
    pendingToolCalls: [],
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    latestMessage: '',
    iteration: state.iteration + 1,
    pendingInputKind: pauseDetails?.pendingInputKind ?? null,
    pauseReason: pauseDetails?.pauseReason ?? null,
    nextStep: pauseDetails
      ? 'pause'
      : isFailing
        ? 'fail'
        : 'prepare',
    errorMessage,
    errorCode
  };
}
