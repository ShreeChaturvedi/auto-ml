import type { RunnableConfig } from '@langchain/core/runnables';
import type { z } from 'zod';

import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import type { ToolResult } from '../../types/llm.js';
import { ToolCallSchema } from '../../types/llm.js';
import { buildFeatureCodeCellTitle, buildFeatureLoadCell } from '../featureEngineering/notebookCells.js';
import { executeToolCall } from '../llm/tools.js';
import { executeMcpTool } from '../mcp/mcpAdapter.js';

import { buildToolEvent } from './eventWriter.js';
import { MAX_IDENTICAL_TOOL_CALLS, MAX_SINGLE_TOOL_CALLS, MAX_WORKFLOW_ITERATIONS, type WorkflowGraphState } from './graphState.js';
import type { PhaseConfig } from './phaseConfig.js';
import { extractConfigurable } from './phases/types.js';
import { getApprovalPauseDetails } from './turnState.js';
import type { WorkflowPendingInputKind } from './types.js';

const MAX_TOOL_RESULT_CHARS = 50_000;
const MAX_TRAINING_CODE_CELL_LINES = 100;
const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

const FORBIDDEN_DEVICE_PATTERNS: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /device\s*=\s*['"](?:cuda|mps)(?::\d+)?['"]/i, hint: "device='cuda'/'mps' is not available — omit device or set device='cpu'." },
  { pattern: /(?<![A-Za-z_0-9])torch\.device\s*\(\s*['"](?:cuda|mps)(?::\d+)?['"]/i, hint: "torch.device('cuda'/'mps') is not available — use 'cpu' or omit device selection." },
  { pattern: /(?<![A-Za-z_0-9.])\.cuda\s*\(/, hint: ".cuda() is not available — remove it (the runtime is CPU-only)." },
  { pattern: /\.to\s*\(\s*['"](?:cuda|mps)(?::\d+)?['"]/i, hint: ".to('cuda'/'mps') is not available — remove it or pass 'cpu'." },
  { pattern: /accelerator\s*=\s*['"](?:gpu|cuda|mps|tpu)['"]/i, hint: "accelerator='gpu'/'cuda'/'mps'/'tpu' is not available — omit accelerator or set 'cpu'." },
  { pattern: /devices\s*=\s*['"]?(?:auto|gpu)['"]?/i, hint: "devices='auto'/'gpu' is not available — omit devices or set it to 1." },
];

function detectForbiddenDeviceUsage(content: string): string | null {
  for (const { pattern, hint } of FORBIDDEN_DEVICE_PATTERNS) {
    if (pattern.test(content)) {
      return hint;
    }
  }
  return null;
}

function extractTrainingDatasetFilename(content: string): string | undefined {
  const match = content.match(/resolve_dataset_path\(\s*["']([^"']+)["']/);
  return match?.[1];
}

function extractTrainingTargetColumn(content: string): string | undefined {
  const patterns = [
    /\btarget_col(?:umn)?\s*=\s*["']([^"']+)["']/i,
    /\bTARGET_COL(?:UMN)?\s*=\s*["']([^"']+)["']/i,
    /\b(?:y|target|labels?)\s*=\s*[A-Za-z_][A-Za-z0-9_]*\[\s*["']([^"']+)["']\s*\]/i
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

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

function getToolOutputRecord(result: ToolResult | null | undefined): Record<string, unknown> | null {
  if (!result?.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
    return null;
  }
  return result.output as Record<string, unknown>;
}

function getLatestTrainingRunCellTimeout(
  phase: WorkflowGraphState['turn']['phase'],
  results: ToolResult[]
): ToolResult | null {
  if (phase !== 'training') {
    return null;
  }

  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result.tool !== 'run_cell') {
      continue;
    }
    if (typeof result.error === 'string' && /request timed out/i.test(result.error)) {
      return result;
    }
    const output = getToolOutputRecord(result);
    if ((output?.status as string | undefined)?.toLowerCase() === 'timeout') {
      return result;
    }
  }

  return null;
}

function getLatestTrainingPackageInstallFailure(
  phase: WorkflowGraphState['turn']['phase'],
  results: ToolResult[],
): ToolResult | null {
  if (phase !== 'training') {
    return null;
  }

  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result.tool !== 'install_package') {
      continue;
    }
    if (typeof result.error === 'string' && result.error.trim()) {
      return result;
    }
    const output = getToolOutputRecord(result);
    if (output?.success === false) {
      return result;
    }
  }

  return null;
}

async function executeWorkflowToolCall(
  state: WorkflowGraphState,
  call: z.infer<typeof ToolCallSchema>,
  phaseConfig: PhaseConfig | undefined
): Promise<ToolResult> {
  const trainingExecutionStages = new Set(['generate_code', 'write_code', 'execute_training', 'evaluate_results', 'register_model']);
  const isTrainingExecutionStage = state.turn.phase === 'training'
    && trainingExecutionStages.has(state.run.currentNode);
  if (isTrainingExecutionStage && (call.tool === 'list_cells' || call.tool === 'read_cell')) {
    return {
      id: call.id,
      tool: call.tool,
      error: `Tool "${call.tool}" is not allowed during training execution. Use the known cell ids from recent tool results and continue with code/edit/run instead.`
    };
  }

  if (isTrainingExecutionStage && (call.tool === 'write_cell' || call.tool === 'insert_cell' || call.tool === 'edit_cell')) {
    const requestedCellType = typeof call.args?.cellType === 'string'
      ? call.args.cellType
      : 'code';
    if ((call.tool === 'write_cell' || call.tool === 'insert_cell') && requestedCellType === 'markdown') {
      return {
        id: call.id,
        tool: call.tool,
        error: 'Markdown cells are not allowed during training execution. Write executable code cells only.'
      };
    }

    const content = call.tool === 'edit_cell'
      ? (typeof call.args?.newContent === 'string' ? call.args.newContent : '')
      : (typeof call.args?.content === 'string' ? call.args.content : '');
    const lineCount = content ? content.split(/\r?\n/).length : 0;
    if (lineCount > MAX_TRAINING_CODE_CELL_LINES) {
      return {
        id: call.id,
        tool: call.tool,
        error: `Training code cell is too large (${lineCount} lines). Split training into smaller code cells by step: imports/config, dataset prep, model fit/evaluation, artifact save.`
      };
    }

    const forbiddenDeviceHint = content ? detectForbiddenDeviceUsage(content) : null;
    if (forbiddenDeviceHint) {
      return {
        id: call.id,
        tool: call.tool,
        error: `Training code uses GPU/MPS device acceleration which is not available in the Linux CPU-only runtime. ${forbiddenDeviceHint}`
      };
    }

    if (state.turn.datasetId && content.includes('resolve_dataset_path(')) {
      const selectedDataset = await datasetRepository.getById(state.turn.datasetId);
      const requestedDatasetFilename = extractTrainingDatasetFilename(content);
      if (
        selectedDataset
        && requestedDatasetFilename
        && requestedDatasetFilename !== selectedDataset.filename
      ) {
        return {
          id: call.id,
          tool: call.tool,
          error: `Training code references dataset "${requestedDatasetFilename}", but the selected dataset for this turn is "${selectedDataset.filename}". Use the selected dataset in resolve_dataset_path().`
        };
      }
    }

    if (state.turn.targetColumn) {
      const requestedTargetColumn = extractTrainingTargetColumn(content);
      if (requestedTargetColumn && requestedTargetColumn !== state.turn.targetColumn) {
        return {
          id: call.id,
          tool: call.tool,
          error: `Training code references target column "${requestedTargetColumn}", but the selected target column for this turn is "${state.turn.targetColumn}". Use the selected target column.`
        };
      }
    }
  }

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
        rationale: call.rationale,
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
  if (call.tool === 'install_package' || call.tool === 'uninstall_package' || call.tool === 'list_packages') {
    return executeToolCall(state.turn.projectId, {
      id: call.id,
      tool: call.tool,
      args: enrichedArgs,
      rationale: call.rationale
    });
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

function getToolCallMetadataRecord(call: z.infer<typeof ToolCallSchema> | null | undefined): Record<string, unknown> | null {
  if (!call?.args?.metadata || typeof call.args.metadata !== 'object' || Array.isArray(call.args.metadata)) {
    return null;
  }
  return call.args.metadata as Record<string, unknown>;
}

function didRunCellSucceed(result: ToolResult | null | undefined): boolean {
  if (!result || result.tool !== 'run_cell' || result.error) {
    return false;
  }

  const output = getToolOutputRecord(result);
  const status = typeof output?.status === 'string' ? output.status.toLowerCase() : undefined;
  return status === undefined || status === 'success' || status === 'ok';
}

function hasSuccessfulFeatureLifecycleLoadInCurrentTurn(
  state: WorkflowGraphState,
  executedCalls: z.infer<typeof ToolCallSchema>[],
  executedResults: ToolResult[]
): boolean {
  const currentTurnCalls = [
    ...state.toolCallHistory.slice(state.turnStartToolCallCount),
    ...executedCalls
  ];
  const currentTurnResults = [
    ...state.toolResultHistory.slice(state.turnStartToolCallCount),
    ...executedResults
  ];

  const pairCount = Math.min(currentTurnCalls.length, currentTurnResults.length);
  for (let index = pairCount - 1; index >= 0; index -= 1) {
    const call = currentTurnCalls[index];
    const result = currentTurnResults[index];
    if (call?.tool !== 'run_cell' || !didRunCellSucceed(result)) {
      continue;
    }

    const metadata = getToolCallMetadataRecord(call);
    if (
      metadata?.role === 'feature-lifecycle-load'
      && (!state.turn.datasetId || metadata.datasetId === state.turn.datasetId)
    ) {
      return true;
    }
  }

  return false;
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
        if (dataset && !hasSuccessfulFeatureLifecycleLoadInCurrentTurn(state, executedCalls, executedResults)) {
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

async function buildTrainingNotebookFollowUp(
  state: WorkflowGraphState,
  executedCalls: z.infer<typeof ToolCallSchema>[],
  executedResults: ToolResult[]
): Promise<z.infer<typeof ToolCallSchema>[] | null> {
  if (state.turn.phase !== 'training') {
    return null;
  }

  const latestCall = executedCalls.at(-1);
  const latestResult = executedResults.at(-1);
  if (!latestCall || !latestResult) {
    return null;
  }

  const latestCallMetadata = latestCall.args?.metadata;
  const metadataRecord = latestCallMetadata && typeof latestCallMetadata === 'object' && !Array.isArray(latestCallMetadata)
    ? latestCallMetadata as Record<string, unknown>
    : null;
  const declaredCellType = typeof latestCall.args?.cellType === 'string'
    ? latestCall.args.cellType
    : 'code';
  const isRunnableWrite = latestCall.tool === 'write_cell'
    && declaredCellType !== 'markdown'
    && latestResult.error == null;
  const isEditCell = latestCall.tool === 'edit_cell'
    && latestResult.error == null;

  if (!isRunnableWrite && !isEditCell) {
    return null;
  }

  const cellId = isEditCell
    ? (typeof latestCall.args?.cellId === 'string' ? latestCall.args.cellId : undefined)
    : extractLatestCellId([latestResult]);
  if (!cellId) {
    return null;
  }

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-auto-run-training-${cellId}`,
    tool: 'run_cell',
    args: {
      cellId,
      ...(metadataRecord ? { metadata: metadataRecord } : {})
    },
    rationale: isEditCell
      ? 'Re-execute the edited training cell before continuing the training workflow.'
      : 'Execute the training code cell immediately after writing it so the workflow can continue to execute_training.'
  });
  return parsed.success ? [parsed.data] : null;
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

  const timedOutTrainingRunCell = getLatestTrainingRunCellTimeout(state.turn.phase, nextResults);
  if (timedOutTrainingRunCell) {
    const timeoutOutput = getToolOutputRecord(timedOutTrainingRunCell);
    const timeoutMs = typeof timeoutOutput?.executionMs === 'number'
      ? timeoutOutput.executionMs
      : undefined;
    const timeoutMessage = typeof timedOutTrainingRunCell.error === 'string' && timedOutTrainingRunCell.error.trim().length > 0
      ? timedOutTrainingRunCell.error
      : typeof timeoutOutput?.error === 'string' && timeoutOutput.error.trim().length > 0
        ? timeoutOutput.error
      : `Training cell execution timed out${timeoutMs ? ` after ${timeoutMs}ms` : ''}.`;
    return {
      toolCallHistory: state.pendingToolCalls,
      toolResultHistory: nextResults,
      pendingToolCalls: [],
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      latestMessage: '',
      iteration: state.iteration + 1,
      pendingInputKind: null,
      pauseReason: null,
      nextStep: 'fail',
      errorMessage: `${timeoutMessage} The kernel was interrupted to clear the stuck execution. Retry the training run or simplify the timed-out cell.`,
      errorCode: 'TRAINING_RUN_CELL_TIMEOUT'
    };
  }

  const failedTrainingPackageInstall = getLatestTrainingPackageInstallFailure(state.turn.phase, nextResults);
  if (failedTrainingPackageInstall) {
    const failureOutput = getToolOutputRecord(failedTrainingPackageInstall);
    const failureMessage = typeof failedTrainingPackageInstall.error === 'string' && failedTrainingPackageInstall.error.trim().length > 0
      ? failedTrainingPackageInstall.error
      : typeof failureOutput?.message === 'string' && failureOutput.message.trim().length > 0
        ? failureOutput.message
        : 'Training dependency installation failed.';
    return {
      toolCallHistory: state.pendingToolCalls,
      toolResultHistory: nextResults,
      pendingToolCalls: [],
      askUserPayload: null,
      planExitPayload: null,
      uiPayload: null,
      latestMessage: '',
      iteration: state.iteration + 1,
      pendingInputKind: null,
      pauseReason: null,
      nextStep: 'fail',
      errorMessage: `${failureMessage} Training stopped because the required model library could not be installed in the runtime.`,
      errorCode: 'TRAINING_PACKAGE_INSTALL_FAILED'
    };
  }

  const featureFollowUpCalls = await buildFeatureNotebookFollowUp(
    state,
    state.pendingToolCalls,
    nextResults
  );
  const trainingFollowUpCalls = featureFollowUpCalls && featureFollowUpCalls.length > 0
    ? null
    : await buildTrainingNotebookFollowUp(
      state,
      state.pendingToolCalls,
      nextResults
    );
  const notebookFollowUpCalls = featureFollowUpCalls && featureFollowUpCalls.length > 0
    ? featureFollowUpCalls
    : trainingFollowUpCalls && trainingFollowUpCalls.length > 0
      ? trainingFollowUpCalls
      : null;
  if (notebookFollowUpCalls && notebookFollowUpCalls.length > 0) {
    return {
      toolCallHistory: state.pendingToolCalls,
      toolResultHistory: nextResults,
      pendingToolCalls: notebookFollowUpCalls,
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

    // Re-running the same cell after edits is a normal notebook workflow,
    // especially for training/debugging loops. Do not treat identical
    // run_cell(cellId=...) calls as inherently stuck.
    if (call.tool !== 'run_cell') {
      const argsKey = `${call.tool}::${JSON.stringify(call.args ?? {})}`;
      identicalCallCounts.set(argsKey, (identicalCallCounts.get(argsKey) ?? 0) + 1);
    }
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
