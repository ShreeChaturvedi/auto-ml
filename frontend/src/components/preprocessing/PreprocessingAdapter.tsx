import type { DomainAdapter } from '@/types/agentic';
import { streamPreprocessingPlan } from '@/lib/api/llm';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { AvailableTable } from '@/types/preprocessing';

export function createPreprocessingAdapter(
  projectId: string,
  selectedDatasetId: string | null,
  tables: AvailableTable[]
): DomainAdapter {
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
    // also capture run tracking tools if desired
    'set_active_dataset',
    'checkpoint_dataset'
  ];

  const toolRegistry: DomainAdapter['toolRegistry'] = {};
  for (const tool of semanticTools) {
    toolRegistry[tool] = toolHandlers;
  }

  return {
    buildRequest: async (prompt, toolCalls, toolResults, onEvent, signal, options) => {
      if (!selectedDatasetId) return;
      await streamPreprocessingPlan(
        {
          projectId,
          datasetId: selectedDatasetId,
          prompt,
          toolCalls,
          toolResults,
          model: options.model,
          enableThinking: options.enableThinking,
          thinkingLevel: options.thinkingLevel
        },
        onEvent,
        signal
      );
    },
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
