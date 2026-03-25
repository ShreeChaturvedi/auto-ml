import type { DomainAdapter, SuggestionPill } from '@/types/agentic';
import { streamWorkflowTurn } from '@/lib/api/llm';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { useDataStore } from '@/stores/dataStore';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { AvailableTable } from '@/types/preprocessing';
import { useNotebookStore } from '@/stores/notebookStore';
import type { WorkflowState } from '@/types/workflow';
import { getControllerSummaryFromWorkflowState } from './controllerSummaryParser';

export function createPreprocessingAdapter(
  projectId: string,
  selectedDatasetId: string | null,
  tables: AvailableTable[],
  sessionKey: string
): DomainAdapter {
  function clearStaleWorkflowSession() {
    useWorkflowSessionStore.getState().clearSession(sessionKey);
    usePreprocessingStore.getState().clearRun();
  }

  const toolHandlers = {
    onCall: (call: ToolCall) => usePreprocessingStore.getState().processToolCall(call),
    onResult: (call: ToolCall, result: ToolResult) => usePreprocessingStore.getState().processToolResult(call, result)
  };

  const semanticTools = [
    'propose_transformation_step',
    'materialize_step_code',
    'execute_transformation_step',
    'validate_step_result',
    'commit_transformation_step',
    'detect_step_divergence',
    'reconcile_diverged_step',
    // also capture run tracking tools if desired
    'set_active_dataset',
    'checkpoint_dataset'
  ];

  const toolRegistry: DomainAdapter['toolRegistry'] = {};
  for (const tool of semanticTools) {
    toolRegistry[tool] = toolHandlers;
  }

  function syncWorkflowState(state: WorkflowState) {
    useWorkflowSessionStore.getState().updateSession(sessionKey, state);
    usePreprocessingStore.getState().setRunId(state.runId);
    const controller = getControllerSummaryFromWorkflowState(state);
    if (!controller) {
      return;
    }
    usePreprocessingStore.getState().setControllerSummary(controller);
  }

  return {
    buildRequest: async (prompt, _toolCalls, _toolResults, onEvent, signal, options) => {
      const selectedTable = tables.find((table) => table.datasetId === selectedDatasetId);
      if (!selectedDatasetId || !selectedTable) {
        throw new Error('Please select a valid dataset for this project before running preprocessing.');
      }
      const session = useWorkflowSessionStore.getState().getSession(sessionKey);
      await streamWorkflowTurn(
        {
          projectId,
          phase: 'preprocessing',
          datasetId: selectedTable.datasetId,
          runId: session?.runId ?? usePreprocessingStore.getState().runId ?? undefined,
          threadId: session?.threadId ?? undefined,
          notebookId: useNotebookStore.getState().activeNotebookId ?? undefined,
          prompt,
          model: options.model,
          reasoningEffort: options.reasoningEffort
        },
        onEvent,
        signal
      );
    },
    prepareToolCalls: (toolCalls) => toolCalls.map((call) => {
      if (call.tool !== 'run_cell') {
        return call;
      }

      const mode = usePreprocessingStore.getState().consumeRunCellMode();
      const args = call.args ?? {};
      const metadata = (
        args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
          ? args.metadata
          : {}
      ) as Record<string, unknown>;
      const preprocessing = (
        metadata.preprocessing && typeof metadata.preprocessing === 'object' && !Array.isArray(metadata.preprocessing)
          ? metadata.preprocessing
          : {}
      ) as Record<string, unknown>;

      return {
        ...call,
        args: {
          ...args,
          metadata: {
            ...metadata,
            preprocessing: {
              ...preprocessing,
              datasetContinuityMode: mode
            }
          }
        }
      };
    }),
    onStreamError: (message: string) => {
      if (/^Run\s+.+\s+not found\./i.test(message.trim())) {
        clearStaleWorkflowSession();
      }
      usePreprocessingStore.getState().markInterruptedSteps(message);
    },
    onStop: (reason: string) => {
      usePreprocessingStore.getState().markInterruptedSteps(reason);
    },
    onControllerUpdate: (summary) => {
      usePreprocessingStore.getState().setControllerSummary(summary);
    },
    onWorkflowStateUpdate: syncWorkflowState,
    onRevert: () => {
      usePreprocessingStore.getState().clearRun();
      useWorkflowSessionStore.getState().clearSession(sessionKey);
    },
    preserveToolHistoryBetweenPrompts: true,
    toolRegistry,

    toolUiRegistry: {},

    suggestionProvider: () => {
      const selectedTable = tables.find((table) => table.datasetId === selectedDatasetId);
      const sourceName = selectedTable?.filename.replace(/\.[^/.]+$/, '') ?? 'this dataset';

      const file = useDataStore.getState().files.find(
        (f) => f.projectId === projectId && f.metadata?.datasetId === selectedDatasetId
      );
      const profile = file?.metadata?.datasetProfile;

      const pills: SuggestionPill[] = [];

      if (profile) {
        const highNullCols = Object.entries(profile.nullCounts)
          .filter(([, count]) => count > 0)
          .sort(([, a], [, b]) => b - a);

        if (highNullCols.length > 0) {
          const topCols = highNullCols.slice(0, 3).map(([name]) => name).join(', ');
          pills.push({
            id: 'impute-nulls',
            label: `Handle nulls in ${topCols}`,
            prompt: `Columns ${topCols} have missing values in ${sourceName}. Propose a safe imputation strategy with validation checks.`
          });
        }

        const stringCols = Object.entries(profile.dtypes)
          .filter(([, dtype]) => dtype === 'string')
          .map(([name]) => name);
        if (stringCols.length > 0) {
          const topStr = stringCols.slice(0, 3).join(', ');
          pills.push({
            id: 'encode-strings',
            label: `Encode ${topStr}`,
            prompt: `Columns ${topStr} are categorical strings in ${sourceName}. Add an encoding step and handle unknown categories.`
          });
        }

        const numericCols = Object.entries(profile.dtypes)
          .filter(([, dtype]) => dtype === 'integer' || dtype === 'float')
          .map(([name]) => name);
        if (numericCols.length > 0) {
          pills.push({
            id: 'scale-numerics',
            label: `Scale ${numericCols.length} numeric columns`,
            prompt: `Scale the ${numericCols.length} numeric columns in ${sourceName} with rationale and validation before commit.`
          });
        }
      }

      if (pills.length === 0) {
        pills.push(
          {
            id: 'missingness',
            label: 'Handle missing values',
            prompt: `Profile missing values in ${sourceName} and propose a safe imputation step with validation checks.`
          },
          {
            id: 'categorical',
            label: 'Encode categoricals',
            prompt: `Add a categorical encoding step for ${sourceName} and make sure unknown categories are handled.`
          },
          {
            id: 'scaling',
            label: 'Scale numerics',
            prompt: `Create a numeric scaling transformation with rationale and validation before commit.`
          }
        );
      }

      pills.push({
        id: 'lineage',
        label: 'Checkpoint dataset',
        prompt: 'Add a checkpoint after committed steps and summarize replay compatibility risks.'
      });

      return pills;
    }
  };
}
