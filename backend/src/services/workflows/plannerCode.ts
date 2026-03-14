import { randomUUID } from 'node:crypto';

import { ToolCallSchema } from '../../types/llm.js';
import type { LlmClient, LlmRequest } from '../llm/llmClient.js';

import type { WorkflowGraphState } from './graphState.js';

function extractLatestStep(state: WorkflowGraphState): {
  stepId: string;
  title?: string;
  rationale?: string;
  intentType?: string;
} | null {
  for (let index = state.toolResultHistory.length - 1; index >= 0; index -= 1) {
    const output = state.toolResultHistory[index]?.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      continue;
    }
    const record = output as Record<string, unknown>;
    const step = record.step && typeof record.step === 'object' && !Array.isArray(record.step)
      ? record.step as Record<string, unknown>
      : null;
    const stepId = typeof record.stepId === 'string'
      ? record.stepId
      : typeof step?.stepId === 'string'
        ? step.stepId
        : null;
    if (!stepId) {
      continue;
    }
    return {
      stepId,
      title: typeof step?.title === 'string' ? step.title : undefined,
      rationale: typeof step?.rationale === 'string' ? step.rationale : undefined,
      intentType: typeof step?.intentType === 'string' ? step.intentType : undefined
    };
  }

  return null;
}

function extractDatasetSummary(state: WorkflowGraphState): string {
  for (let index = state.toolResultHistory.length - 1; index >= 0; index -= 1) {
    const output = state.toolResultHistory[index]?.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      continue;
    }
    const dataset = (output as Record<string, unknown>).dataset;
    if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) {
      continue;
    }
    const record = dataset as Record<string, unknown>;
    const filename = typeof record.filename === 'string' ? record.filename : 'dataset';
    const nRows = typeof record.nRows === 'number' ? record.nRows : 'unknown';
    const columns = Array.isArray(record.columns)
      ? record.columns
        .map((column) => {
          if (!column || typeof column !== 'object' || Array.isArray(column)) {
            return null;
          }
          const item = column as Record<string, unknown>;
          return typeof item.name === 'string' && typeof item.dtype === 'string'
            ? `${item.name} (${item.dtype})`
            : null;
        })
        .filter((value): value is string => Boolean(value))
      : [];
    return `Dataset: ${filename}\nRows: ${nRows}\nColumns: ${columns.join(', ') || '(unknown)'}`;
  }

  return 'Dataset summary: unavailable';
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:python)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function buildCodeAuthoringRequest(state: WorkflowGraphState, step: { stepId: string; title?: string; rationale?: string; intentType?: string }): LlmRequest {
  return {
    messages: [
      {
        role: 'system',
        content: [
          'You are authoring Python preprocessing code for a notebook workflow.',
          'Return only raw Python code. Do not wrap it in JSON or markdown fences.',
          'Write one coherent cell that inspects missingness and prepares a safe imputation transformation for the requested step.',
          'Keep the cell concise and complete. Prefer a compact implementation over exhaustive diagnostics.',
          'Avoid generating helper scaffolding or reports that are not required to execute the step safely.',
          'A pandas DataFrame named df and a dataset_path string will already be defined before your code runs.',
          'Do not search globals for dataframes and do not reload the dataset yourself.',
          'Operate on df directly, preserving dataset continuity, and leave the final transformed dataframe in df.',
          'Implement validation as collected diagnostics, flags, or summaries instead of brittle assert-based failures whenever possible.',
          'Only mutate columns whose missingness pattern and safe fill behavior are directly supported by the observed dataframe.',
          'If a proposed fill is not clearly safe at runtime, skip that column and record the reason in a validation summary variable.',
          'Do not assume fixed allowed values for categorical columns unless they are directly observed in df.',
          'Do not execute the code or narrate what you are doing.'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `User prompt: ${state.turn.prompt?.trim() || 'Continue preprocessing.'}`,
          `Preprocessing run ID: ${state.controllerSummary?.runId ?? '(unknown)'}`,
          `Step ID: ${step.stepId}`,
          step.title ? `Step title: ${step.title}` : null,
          step.intentType ? `Step intent: ${step.intentType}` : null,
          step.rationale ? `Step rationale: ${step.rationale}` : null,
          extractDatasetSummary(state)
        ].filter((value): value is string => Boolean(value)).join('\n\n')
      }
    ],
    maxOutputTokens: 2600,
    reasoningEffort: 'low'
  };
}

export async function planCodeMaterialization(
  client: LlmClient,
  state: WorkflowGraphState
): Promise<Partial<WorkflowGraphState>> {
  const step = extractLatestStep(state);
  const preprocessingRunId = state.controllerSummary?.runId;
  if (!step || !preprocessingRunId) {
    return {
      nextStep: 'fail',
      errorCode: 'WORKFLOW_CODE_CONTEXT_MISSING',
      errorMessage: 'Code generation could not resolve the active preprocessing step context.'
    };
  }

  const rawCode = await client.complete(buildCodeAuthoringRequest(state, step));
  const code = stripCodeFences(rawCode);
  if (!code) {
    return {
      nextStep: 'fail',
      errorCode: 'WORKFLOW_CODE_EMPTY',
      errorMessage: 'Code generation returned no executable code.'
    };
  }

  const parsed = ToolCallSchema.safeParse({
    id: `wf-call-${randomUUID()}`,
    tool: 'materialize_step_code',
    args: {
      runId: preprocessingRunId,
      stepId: step.stepId,
      code
    },
    rationale: `Materialize executable code for preprocessing step ${step.stepId}.`
  });

  if (!parsed.success) {
    return {
      nextStep: 'fail',
      errorCode: 'WORKFLOW_CODE_TOOL_INVALID',
      errorMessage: 'Code generation produced an invalid materialize_step_code payload.'
    };
  }

  return {
    pendingToolCalls: [parsed.data],
    latestMessage: '',
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    nextStep: 'execute_tools',
    errorMessage: null,
    errorCode: null
  };
}
