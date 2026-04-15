import type { DomainAdapter } from '@/types/agentic';
import type { ContextualTip } from '@/components/ui/contextual-tip-bar';
import { COMMON_CHAT_TIPS } from '@/components/ui/common-chat-tips';
import { AlertTriangle, Tags, BarChart2, Calendar, Bug } from 'lucide-react';
import { toast } from 'sonner';
import { streamWorkflowTurn } from '@/lib/api/llm';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import { useDataStore } from '@/stores/dataStore';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { AvailableTable } from '@/types/preprocessing';
import type { WorkflowState } from '@/types/workflow';
import { isWorkflowThreadId } from '@/lib/workflowThread';
import { getControllerSummaryFromWorkflowState } from './controllerSummaryParser';

export function createPreprocessingAdapter(
  projectId: string,
  selectedDatasetId: string | null,
  tables: AvailableTable[],
  sessionKey: string,
  notebookId?: string | null
): DomainAdapter {
  function clearStaleWorkflowSession() {
    useWorkflowSessionStore.getState().clearSession(sessionKey);
    usePreprocessingStore.getState().clearRun();
  }

  function resolveWorkflowSession() {
    const session = useWorkflowSessionStore.getState().getSession(sessionKey);
    if (!session?.runId) {
      return session;
    }
    if (!isWorkflowThreadId(session.runId)) {
      return session;
    }

    clearStaleWorkflowSession();
    return undefined;
  }

  function resolveToolFailureMessage(result: ToolResult): string | null {
    if (typeof result.error === 'string' && result.error.trim()) {
      return result.error.trim();
    }
    const output = result.output;
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      return null;
    }
    const message = (output as Record<string, unknown>).message;
    return typeof message === 'string' && message.trim() ? message.trim() : null;
  }

  const toolHandlers = {
    onCall: (call: ToolCall) => usePreprocessingStore.getState().processToolCall(call),
    onResult: (call: ToolCall, result: ToolResult) => {
      const failureMessage = resolveToolFailureMessage(result);
      if (/^Run\s+.+\s+not found\./i.test(failureMessage ?? '')) {
        clearStaleWorkflowSession();
      }
      usePreprocessingStore.getState().processToolResult(call, result);
      if (call.tool === 'commit_transformation_step' && projectId) {
        const output = result.output as Record<string, unknown> | undefined;
        const derivedDatasetId = typeof output?.derivedDatasetId === 'string'
          ? output.derivedDatasetId
          : undefined;
        void (async () => {
          await useDataStore.getState().hydrateFromBackend(projectId, { force: true });
          const createdFile = derivedDatasetId
            ? useDataStore.getState().files.find(
              (file) => file.projectId === projectId && file.metadata?.datasetId === derivedDatasetId
            )
            : undefined;
          toast.success(createdFile?.name ? `Created ${createdFile.name}` : 'Processed dataset created');
        })();

        // Extract derivedDatasetId from the tool result so we can auto-select
        // the processed file in the dropdown after the tables reload.
        void usePreprocessingStore.getState().loadTables(projectId).then(() => {
          if (derivedDatasetId) {
            const { tables } = usePreprocessingStore.getState();
            if (tables.some((t) => t.datasetId === derivedDatasetId)) {
              usePreprocessingStore.getState().selectDataset(derivedDatasetId, {
                preserveRunState: true
              });
            }
          }
        });
      }
    }
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
    const controller = getControllerSummaryFromWorkflowState(state);
    if (controller?.runId && !isWorkflowThreadId(controller.runId)) {
      usePreprocessingStore.getState().setRunId(controller.runId);
    }
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
      const session = resolveWorkflowSession();
      await streamWorkflowTurn(
        {
          projectId,
          phase: 'preprocessing',
          datasetId: selectedTable.datasetId,
          runId: session?.runId ?? undefined,
          threadId: session?.threadId ?? undefined,
          notebookId: notebookId?.trim() || undefined,
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

    tipsProvider: (messages) => {
      const file = useDataStore.getState().files.find(
        (f) => f.projectId === projectId && f.metadata?.datasetId === selectedDatasetId
      );
      const profile = file?.metadata?.datasetProfile;

      const tips: ContextualTip[] = [];

      if (profile) {
        const highNullCols = Object.entries(profile.nullCounts)
          .filter(([, count]) => count > 0)
          .sort(([, a], [, b]) => b - a);

        if (highNullCols.length > 0) {
          tips.push({ id: 'tip-nulls', icon: AlertTriangle, content: `${highNullCols.length} columns have missing values` });
        }

        const stringCols = Object.entries(profile.dtypes)
          .filter(([, dtype]) => dtype === 'string')
          .map(([name]) => name);
        if (stringCols.length > 0) {
          tips.push({ id: 'tip-categoricals', icon: Tags, content: `${stringCols.length} categorical columns may need encoding` });
        }

        const numericCols = Object.entries(profile.dtypes)
          .filter(([, dtype]) => dtype === 'integer' || dtype === 'float');
        if (numericCols.length > 0) {
          tips.push({ id: 'tip-numerics', icon: BarChart2, content: `${numericCols.length} numeric columns available for scaling` });
        }

        const dateCols = Object.entries(profile.dtypes).filter(([, dtype]) => dtype === 'date');
        if (dateCols.length > 0) {
          tips.push({ id: 'tip-dates', icon: Calendar, content: 'Date columns detected — temporal features may help' });
        }
      }

      if (messages.findLast((m) => m.type === 'error')) {
        tips.push({ id: 'tip-error', icon: Bug, content: "Try 'diagnose the error' for step-by-step help" });
      }

      tips.push(...COMMON_CHAT_TIPS);

      return tips;
    }
  };
}
