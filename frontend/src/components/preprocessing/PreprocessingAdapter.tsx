import type { DomainAdapter } from '@/types/agentic';
import { streamWorkflowTurn } from '@/lib/api/llm';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
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
      return [
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
        },
        {
          id: 'lineage',
          label: 'Checkpoint dataset',
          prompt: 'Add a checkpoint after committed steps and summarize replay compatibility risks.'
        }
      ];
    }
  };
}
