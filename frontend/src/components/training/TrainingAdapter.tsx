import type { DomainAdapter, ToolHandlers } from '@/types/agentic';
import { streamWorkflowTurn } from '@/lib/api/llm';
import type { UploadedFile } from '@/types/file';
import { useModelStore } from '@/stores/modelStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import type { ContextualTip } from '@/components/ui/contextual-tip-bar';
import { COMMON_CHAT_TIPS } from '@/components/ui/common-chat-tips';
import { Target, TrendingUp, Layers, AlertTriangle, FileText, Bug, GitCompare } from 'lucide-react';
import type { ChatMessage } from '@/types/llmUi';
import type { NotebookCell } from '@/types/notebook';
import type { ToolCall, ToolResult } from '@/types/llmUi';

export interface TrainingAdapterConfig {
  projectId: string;
  datasetId: string | undefined;
  targetColumn: string | undefined;
  featureSummary: string | undefined;
  datasetFiles: UploadedFile[];
  documentFiles: UploadedFile[];
  sessionKey: string;
  /**
   * Lazily resolve the training notebook id at request-build time. Passed as
   * a getter (rather than a static value) so the adapter identity stays
   * stable across notebook resolution updates — otherwise every sync-hook
   * setState would replace the adapter memo and cascade into useAgenticLoop
   * state resets mid-conversation.
   *
   * Optional for backward compatibility with callers that have not yet wired
   * useTrainingNotebookSync; those callers still fall back to the global
   * activeNotebookId selector below.
   */
  getNotebookId?: () => string | null | undefined;
}

function buildTrainingTips(
  config: TrainingAdapterConfig,
  messages: ChatMessage[],
): ContextualTip[] {
  const { datasetFiles, documentFiles } = config;
  const tips: ContextualTip[] = [];

  const datasetFile = datasetFiles.find((f) => f.metadata?.datasetId === config.datasetId);
  const isDerivedDataset = Boolean(datasetFile?.metadata?.derivedFrom)
    || /^feature(?:[_-]|$)/i.test(datasetFile?.name ?? '');
  const profile = datasetFile?.metadata?.datasetProfile;
  const targetDtype = config.targetColumn && profile
    ? profile.dtypes[config.targetColumn]
    : undefined;
  const isClassification = targetDtype === 'string' || targetDtype === 'boolean';
  const isRegression = targetDtype === 'integer' || targetDtype === 'float';

  if (config.targetColumn && isClassification) {
    tips.push({ id: 'tip-target-class', icon: Target, content: 'Classification target — consider F1 alongside accuracy' });
  } else if (config.targetColumn && isRegression) {
    tips.push({ id: 'tip-target-reg', icon: TrendingUp, content: 'Regression target — consider MAE and R²' });
  }

  if (config.featureSummary) {
    const countMatch = config.featureSummary.match(/^(\d+)\s+enabled\s+feature/);
    const featureCount = countMatch ? parseInt(countMatch[1], 10) : 1;
    tips.push({ id: 'tip-features', icon: Layers, content: `${featureCount} engineered feature${featureCount === 1 ? '' : 's'} in your pipeline` });
  } else if (isDerivedDataset) {
    tips.push({ id: 'tip-derived-dataset', icon: Layers, content: 'Using a derived dataset — features may already be materialized in the table' });
  } else {
    tips.push({ id: 'tip-no-features', icon: AlertTriangle, content: 'No feature pipeline — model trains on raw columns' });
  }

  if (profile && profile.nRows < 1000) {
    tips.push({ id: 'tip-small-data', icon: AlertTriangle, content: 'Small dataset — cross-validation is critical' });
  }

  if (documentFiles.length > 0) {
    tips.push({ id: 'tip-docs', icon: FileText, content: `${documentFiles.length} context documents available` });
  }

  if (messages.findLast((m) => m.type === 'error')) {
    tips.push({ id: 'tip-error', icon: Bug, content: "Try 'debug the error' for step-by-step help" });
  }

  tips.push(
    ...COMMON_CHAT_TIPS,
    { id: 'tip-compare', icon: GitCompare, content: "Say 'compare models' after training alternatives" },
  );

  return tips;
}

function buildTrainingToolRegistry(): Record<string, ToolHandlers> {
  const store = () => useModelStore.getState();
  const notebookStore = () => useNotebookStore.getState();

  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;

  const extractNotebookCell = (value: unknown): NotebookCell | null => {
    const record = asRecord(value);
    if (!record) {
      return null;
    }

    if (typeof record.cellId === 'string' && typeof record.notebookId === 'string') {
      return record as unknown as NotebookCell;
    }

    const nestedCell = asRecord(record.cell);
    if (nestedCell && typeof nestedCell.cellId === 'string' && typeof nestedCell.notebookId === 'string') {
      return nestedCell as unknown as NotebookCell;
    }

    return null;
  };

  const syncNotebookToolResult = async (call: ToolCall, result: ToolResult): Promise<void> => {
    const state = notebookStore();
    const cell = extractNotebookCell(result.output);
    const callCellId = typeof call.args?.cellId === 'string' ? call.args.cellId : undefined;

    switch (call.tool) {
      case 'write_cell':
      case 'insert_cell':
      case 'edit_cell': {
        if (cell) {
          state.updateCellLocally(cell);
        } else if (callCellId) {
          await state.loadCell(callCellId);
          return;
        }
        await state.loadCells();
        break;
      }
      case 'delete_cell': {
        if (callCellId) {
          state.removeCellLocally(callCellId);
        }
        await state.loadCells();
        break;
      }
      case 'reorder_cells':
        await state.loadCells();
        break;
      case 'run_cell': {
        if (cell) {
          state.updateCellLocally(cell);
        } else if (callCellId) {
          await state.loadCell(callCellId);
          return;
        }
        await state.loadCells();
        break;
      }
      default:
        break;
    }
  };

  return {
    write_cell: {
      onResult: (call, result) => {
        void syncNotebookToolResult(call, result);
      }
    },
    edit_cell: {
      onResult: (call, result) => {
        void syncNotebookToolResult(call, result);
      }
    },
    insert_cell: {
      onResult: (call, result) => {
        void syncNotebookToolResult(call, result);
      }
    },
    delete_cell: {
      onResult: (call, result) => {
        void syncNotebookToolResult(call, result);
      }
    },
    reorder_cells: {
      onResult: (call, result) => {
        void syncNotebookToolResult(call, result);
      }
    },
    run_cell: {
      onResult: (call, result) => {
        void syncNotebookToolResult(call, result);
      }
    },
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
      const workflowSessionStore = useWorkflowSessionStore.getState();
      const session = workflowSessionStore.sessions[config.sessionKey];
      const resumableStatuses = new Set(['running', 'paused']);
      const canResumeSession = Boolean(
        session?.runId
        && session?.threadId
        && session.state?.status
        && resumableStatuses.has(session.state.status)
      );
      if (session && !canResumeSession) {
        workflowSessionStore.clearSession(config.sessionKey);
      }
      // Prefer the caller-supplied getter (wired to useTrainingNotebookSync).
      // Fall back to the global active notebook for backward compatibility;
      // TrainingPanel always provides getNotebookId in practice.
      const resolvedNotebookId =
        config.getNotebookId?.() ?? useNotebookStore.getState().activeNotebookId ?? undefined;
      await streamWorkflowTurn(
        {
          projectId: config.projectId,
          phase: 'training',
          datasetId: config.datasetId,
          runId: canResumeSession ? session?.runId : undefined,
          threadId: canResumeSession ? session?.threadId : undefined,
          notebookId: resolvedNotebookId ?? undefined,
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
    tipsProvider: (messages) => buildTrainingTips(config, messages)
  };
}
