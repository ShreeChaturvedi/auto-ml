import type { DomainAdapter, SuggestionPill, ToolHandlers } from '@/types/agentic';
import { streamWorkflowTurn } from '@/lib/api/llm';
import type { UploadedFile } from '@/types/file';
import type { ChatMessage } from '@/types/llmUi';
import { useModelStore } from '@/stores/modelStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';

export interface TrainingAdapterConfig {
  projectId: string;
  datasetId: string | undefined;
  targetColumn: string | undefined;
  featureSummary: string | undefined;
  datasetFiles: UploadedFile[];
  documentFiles: UploadedFile[];
  sessionKey: string;
}

function dedupeTrainingSuggestions(suggestions: SuggestionPill[]): SuggestionPill[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestion.prompt.toLowerCase().trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildTrainingSuggestions(
  config: TrainingAdapterConfig,
  messages: ChatMessage[],
  isGenerating: boolean
): SuggestionPill[] {
  const { datasetFiles, documentFiles } = config;
  
  if (isGenerating) {
    return [];
  }

  const hasUserMessages = messages.some((message) => message.type === 'user');
  const latestUserMessage = [...messages].reverse().find((message) => message.type === 'user');
  const latestError = [...messages].reverse().find((message) => message.type === 'error');
  const latestAssistantText = [...messages].reverse().find((message) => message.type === 'assistant_text');

  const suggestions: SuggestionPill[] = [];

  if (!hasUserMessages) {
    if (datasetFiles.length > 0) {
      // Infer task type from target column dtype
      const datasetFile = datasetFiles.find((f) => f.metadata?.datasetId === config.datasetId);
      const profile = datasetFile?.metadata?.datasetProfile;
      const targetDtype = config.targetColumn && profile
        ? profile.dtypes[config.targetColumn]
        : undefined;
      const isClassification = targetDtype === 'string' || targetDtype === 'boolean';
      const isRegression = targetDtype === 'integer' || targetDtype === 'float';

      if (isClassification) {
        suggestions.push({
          id: 'train-initial-baseline',
          label: 'Classification baseline',
          prompt: `Train a classification baseline on target "${config.targetColumn}" with cross-validation and appropriate metrics.`
        });
      } else if (isRegression) {
        suggestions.push({
          id: 'train-initial-baseline',
          label: 'Regression baseline',
          prompt: `Train a regression baseline on target "${config.targetColumn}" with cross-validation and error metrics.`
        });
      } else {
        suggestions.push({
          id: 'train-initial-baseline',
          label: 'Baseline model',
          prompt: 'Suggest a strong baseline training plan for this dataset with sensible defaults.'
        });
      }

      suggestions.push({
        id: 'train-initial-target',
        label: 'Pick target + metric',
        prompt: 'Help me choose the right target column and evaluation metrics for this project.'
      });
    }

    if (documentFiles.length > 0) {
      suggestions.push({
        id: 'train-initial-docs',
        label: 'Use docs in training',
        prompt: 'Use the uploaded documents to suggest useful feature hypotheses and validation checks.'
      });
    }

    suggestions.push({
      id: 'train-initial-sanity',
      label: 'Data sanity checks',
      prompt: 'Before modeling, propose a concise data sanity-check checklist for this training workflow.'
    });

    return dedupeTrainingSuggestions(suggestions).slice(0, 6);
  }

  if (latestError?.type === 'error') {
    suggestions.push(
      {
        id: 'train-error-debug',
        label: 'Debug latest error',
        prompt: 'Debug the latest training error step by step and suggest the minimum safe fix.'
      },
      {
        id: 'train-error-robust',
        label: 'Harden pipeline',
        prompt: 'Refactor this training flow to be more robust to schema and data edge cases.'
      }
    );
  }

  if (latestUserMessage?.type === 'user') {
    const text = latestUserMessage.content.toLowerCase();
    if (text.includes('overfit') || text.includes('generaliz')) {
      suggestions.push({
        id: 'train-overfit',
        label: 'Reduce overfitting',
        prompt: 'Propose targeted changes to reduce overfitting while keeping accuracy strong.'
      });
    }
    if (text.includes('speed') || text.includes('slow')) {
      suggestions.push({
        id: 'train-speed',
        label: 'Faster training',
        prompt: 'Optimize this training workflow for speed and explain the performance trade-offs.'
      });
    }
  }

  if (latestAssistantText?.type === 'assistant_text') {
    suggestions.push({
      id: 'train-summary',
      label: 'Summarize next steps',
      prompt: 'Summarize the next 5 concrete training steps from our current context.'
    });
  }

  if (datasetFiles.length > 0) {
    suggestions.push({
      id: 'train-validation',
      label: 'Validation strategy',
      prompt: 'Refine the validation strategy with leakage checks, folds, and metric thresholds.'
    });
  }

  suggestions.push({
    id: 'train-compare',
    label: 'Compare models',
    prompt: 'Recommend two additional model families to compare and explain why they are good fits.'
  });

  return dedupeTrainingSuggestions(suggestions).slice(0, 7);
}

function buildTrainingToolRegistry(): Record<string, ToolHandlers> {
  const store = () => useModelStore.getState();

  return {
    configure_experiment: {
      onCall: (call) => {
        const args = call.args as Record<string, unknown> | undefined;
        store().setCurrentStage('configure_experiment');
        if (args?.experimentName) {
          // Placeholder — the experiment will be created when the result arrives
        }
      },
      onResult: (_call, result) => {
        const output = result.output as Record<string, unknown> | undefined;
        if (output?.experimentId) {
          store().updateTrainingRun(output.experimentId as string, {
            experimentId: output.experimentId as string,
            experimentName: (output.experimentName as string) ?? 'Untitled',
            modelType: (output.modelType as string) ?? 'unknown',
            status: 'configured'
          });
        }
      }
    },
    propose_training_plan: {
      onCall: () => {
        store().setCurrentStage('propose_model');
      },
      onResult: (_call, result) => {
        const output = result.output as Record<string, unknown> | undefined;
        if (output?.experimentId) {
          store().updateTrainingRun(output.experimentId as string, {
            status: 'proposed'
          });
        }
      }
    },
    execute_training: {
      onCall: () => {
        store().setCurrentStage('execute_training');
      },
      onResult: (_call, result) => {
        const output = result.output as Record<string, unknown> | undefined;
        if (output?.experimentId) {
          store().updateTrainingRun(output.experimentId as string, {
            status: output.status === 'failed' ? 'failed' : 'training'
          });
        }
      }
    },
    evaluate_results: {
      onCall: () => {
        store().setCurrentStage('evaluate_results');
      },
      onResult: (_call, result) => {
        const output = result.output as Record<string, unknown> | undefined;
        if (output?.experimentId) {
          store().updateTrainingRun(output.experimentId as string, {
            status: 'evaluated',
            metrics: (output.metrics as Record<string, unknown>) ?? {}
          });
        }
      }
    },
    register_model: {
      onCall: () => {
        store().setCurrentStage('register_model');
      },
      onResult: (_call, result) => {
        const output = result.output as Record<string, unknown> | undefined;
        if (output?.experimentId) {
          store().updateTrainingRun(output.experimentId as string, {
            status: 'registered',
            metrics: (output.metrics as Record<string, unknown>) ?? {}
          });
        }
      }
    },
    compare_models: {
      onCall: () => {
        store().setCurrentStage('summarize');
      },
      onResult: () => {
        // Comparison results are presented directly in the chat — no store update needed
      }
    }
  };
}

export function createTrainingAdapter(config: TrainingAdapterConfig): DomainAdapter {
  return {
    buildRequest: async (prompt, _toolCalls, _toolResults, onEvent, signal, options) => {
      if (!config.datasetId) return;
      const session = useWorkflowSessionStore.getState().sessions[config.sessionKey];
      await streamWorkflowTurn(
        {
          projectId: config.projectId,
          phase: 'training',
          datasetId: config.datasetId,
          runId: session?.runId,
          threadId: session?.threadId,
          notebookId: useNotebookStore.getState().activeNotebookId ?? undefined,
          targetColumn: config.targetColumn,
          prompt,
          featureSummary: config.featureSummary,
          reasoningEffort: options.reasoningEffort,
          model: options.model
        },
        onEvent,
        signal
      );
    },
    onWorkflowStateUpdate: (state) => {
      useWorkflowSessionStore.getState().updateSession(config.sessionKey, state);
    },
    onRevert: () => {
      useModelStore.getState().clearTrainingRun();
      useWorkflowSessionStore.getState().clearSession(config.sessionKey);
    },
    toolRegistry: buildTrainingToolRegistry(),
    toolUiRegistry: {},
    suggestionProvider: (messages, isGenerating) => buildTrainingSuggestions(config, messages, isGenerating)
  };
}
