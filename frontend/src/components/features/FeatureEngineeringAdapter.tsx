import type { DomainAdapter, ToolHandlers } from '@/types/agentic';
import { streamWorkflowTurn } from '@/lib/api/llm';
import { useFeatureStore } from '@/stores/featureStore';
import type { FeatureCategory, FeatureMethod } from '@/types/feature';
import type { UploadedFile } from '@/types/file';
import type { ColumnDataType } from '@/types/file';
import type { ChatMessage, ToolCall, ToolResult } from '@/types/llmUi';
import { useNotebookStore } from '@/stores/notebookStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import type { WorkflowArtifact } from '@/types/workflow';
import type { NotebookPhaseMetadata } from '@/types/notebook';
import type { ContextualTip } from '@/components/ui/contextual-tip-bar';
import { COMMON_CHAT_TIPS } from '@/components/ui/common-chat-tips';
import { Target, TrendingUp, Calendar, FileText, Bug, GitPullRequest } from 'lucide-react';

export interface FeatureEngineeringAdapterConfig {
  projectId: string;
  datasetId: string | undefined;
  targetColumn: string | undefined;
  datasetFiles: UploadedFile[];
  documentFiles: UploadedFile[];
  sessionKey: string;
  notebookName?: string;
  notebookMetadata?: NotebookPhaseMetadata;
  /** Pre-assigned notebook ID for this pipeline version. */
  versionNotebookId?: string;
  /** Callback to persist the notebook ID on the pipeline version. */
  onNotebookCreated?: (notebookId: string) => void;
}

function buildFeatureTips(
  config: FeatureEngineeringAdapterConfig,
  messages: ChatMessage[],
): ContextualTip[] {
  const tips: ContextualTip[] = [];

  const datasetFile = config.datasetFiles.find(
    (file) => file.metadata?.datasetId === config.datasetId
  );
  const profile = datasetFile?.metadata?.datasetProfile;

  if (config.targetColumn && profile) {
    const targetDtype: ColumnDataType | undefined = profile.dtypes[config.targetColumn];
    const isClassification = targetDtype === 'string' || targetDtype === 'boolean';

    if (isClassification) {
      tips.push({ id: 'tip-target-class', icon: Target, content: `Classification target: ${config.targetColumn} — class balance matters` });
    } else {
      tips.push({ id: 'tip-target-reg', icon: TrendingUp, content: `Regression target: ${config.targetColumn} — check for skewness` });
    }
  } else if (!config.targetColumn) {
    tips.push({ id: 'tip-no-target', icon: Target, content: 'Set a target column in Training for task-aware tips' });
  }

  if (profile) {
    const dateCols = Object.entries(profile.dtypes).filter(([, dtype]) => dtype === 'date');
    if (dateCols.length > 0) {
      tips.push({ id: 'tip-dates', icon: Calendar, content: 'Date columns available for temporal features' });
    }
  }

  if (config.documentFiles.length > 0) {
    tips.push({ id: 'tip-docs', icon: FileText, content: `${config.documentFiles.length} context documents available for domain guidance` });
  }

  if (messages.findLast((m) => m.type === 'error')) {
    tips.push({ id: 'tip-error', icon: Bug, content: "Try 'diagnose the error' for recovery" });
  }

  tips.push(
    ...COMMON_CHAT_TIPS,
    { id: 'tip-lifecycle', icon: GitPullRequest, content: 'Features go through propose → validate → register' },
  );

  return tips;
}

/** Semantic feature lifecycle tools whose calls/results update the feature store. */
const FEATURE_LIFECYCLE_SEMANTIC_TOOLS = [
  'propose_feature',
  'materialize_feature_code',
  'execute_feature',
  'validate_feature',
  'register_feature',
  'checkpoint_feature_pipeline'
] as const;

function buildFeatureToolRegistry(config: FeatureEngineeringAdapterConfig): DomainAdapter['toolRegistry'] {
  const toolHandlers: ToolHandlers = {
    onCall: (call: ToolCall) => {
      const store = useFeatureStore.getState();
      // Track current stage based on the tool being called
      store.setCurrentStage(call.tool);
    },
    onResult: (call: ToolCall, result: ToolResult) => {
      const store = useFeatureStore.getState();
      const output = result.output as Record<string, unknown> | undefined;
      const featureId = (output?.featureId ?? call.args?.featureId) as string | undefined;

      // Capture runId from tool output (backend now returns it)
      if (output?.runId && typeof output.runId === 'string') {
        store.setFeatureRunId(output.runId);
      }

      if (featureId) {
        const featureName = (output?.featureName ?? call.args?.featureName ?? featureId) as string;
        const method = (output?.method ?? call.args?.method ?? call.tool) as string;
        const sourceColumns = (output?.sourceColumns ?? call.args?.sourceColumns) as string[] | undefined;

        store.setFeatureStep(featureId, {
          stepId: featureId,
          name: featureName,
          method,
          status: result.error ? 'error' : (output?.status ?? 'ok') as string,
          error: result.error,
          code: call.args?.code as string | undefined,
          metrics: output?.validation as Record<string, unknown> | undefined
        });

        // Bridge lifecycle completion into the FeatureSpec array so the
        // readiness report and approval/apply buttons become available.
        // We assemble the spec from accumulated step data (propose → register).
        if (call.tool === 'register_feature' && !result.error) {
          const rejected = (output?.status as string) === 'rejected';
          if (!rejected) {
            // Look up accumulated data from earlier lifecycle steps
            const step = store.featureSteps[featureId];
            store.upsertFeature({
              id: featureId,
              projectId: config.projectId,
              sourceColumn: sourceColumns?.[0] ?? step?.name ?? '',
              featureName: step?.name ?? featureName,
              description: (call.args?.rationale ?? output?.rationale ?? step?.method ?? '') as string,
              method: (step?.method ?? method ?? 'custom') as FeatureMethod,
              category: 'numeric_transform' as FeatureCategory,
              params: {},
              enabled: true,
              createdAt: new Date().toISOString()
            });
          }
        }
      }
    }
  };

  const registry: DomainAdapter['toolRegistry'] = {};
  for (const tool of FEATURE_LIFECYCLE_SEMANTIC_TOOLS) {
    registry[tool] = toolHandlers;
  }
  return registry;
}

function syncFeatureRunIdFromArtifact(artifact: WorkflowArtifact) {
  // Only use the featureRunId field from the artifact payload — artifact.runId
  // is the workflow run ID, which is different from the feature pipeline run ID.
  if (!artifact.payload || typeof artifact.payload !== 'object' || Array.isArray(artifact.payload)) {
    return;
  }
  const payload = artifact.payload as Record<string, unknown>;
  const featureRunId = typeof payload.featureRunId === 'string'
    ? payload.featureRunId
    : undefined;
  if (featureRunId) {
    useFeatureStore.getState().setFeatureRunId(featureRunId);
  }
}

export function createFeatureEngineeringAdapter(
  config: FeatureEngineeringAdapterConfig
): DomainAdapter {
  const toolRegistry = buildFeatureToolRegistry(config);

  return {
    buildRequest: async (rawPrompt, _toolCalls, _toolResults, onEvent, signal, options) => {
      if (!config.datasetId) {
        throw new Error('Select a dataset before generating a feature plan.');
      }

      // Enrich the prompt with enabled feature context so the LLM knows which
      // features the user selected for implementation.
      const featureStore = useFeatureStore.getState();
      const enabledFeatures = featureStore.features.filter(
        (f) => f.projectId === config.projectId && f.enabled
      );
      let prompt = rawPrompt;
      if (enabledFeatures.length > 0 && /\b(implement|apply|build|create|execute|run|make)\b/i.test(rawPrompt)) {
        const featureList = enabledFeatures
          .map((f) => `${f.featureName} (${f.method} on ${f.sourceColumn})`)
          .join(', ');
        prompt = `${rawPrompt}\n\nEnabled features to implement: ${featureList}`;
      }

      const session = useWorkflowSessionStore.getState().getSession(config.sessionKey);
      const notebookStore = useNotebookStore.getState();

      // Prefer the version-specific notebook ID over the global active notebook.
      let notebookId = config.versionNotebookId ?? undefined;

      // Verify the version notebook still exists in the store.
      if (notebookId) {
        const exists = notebookStore.notebooks.some((entry) => entry.notebookId === notebookId);
        if (!exists) {
          // Notebook was deleted or missing — clear so we create a fresh one.
          notebookId = undefined;
        }
      }

      if (!notebookId) {
        const createdNotebook = await notebookStore.createNotebook(
          config.notebookName ?? 'Feature Engineering Notebook',
          config.notebookMetadata
        );
        notebookId = createdNotebook?.notebookId;
        if (notebookId) {
          config.onNotebookCreated?.(notebookId);
          await notebookStore.setActiveNotebook(notebookId);
        }
      }

      if (!notebookId) {
        throw new Error(
          'Feature engineering could not start because no notebook is available for execution.'
        );
      }

      await streamWorkflowTurn(
        {
          projectId: config.projectId,
          phase: 'feature_engineering',
          datasetId: config.datasetId,
          runId: session?.runId,
          threadId: session?.threadId,
          notebookId,
          targetColumn: config.targetColumn,
          prompt,
          model: options.model,
          reasoningEffort: options.reasoningEffort
        },
        onEvent,
        signal
      );
    },
    onWorkflowStateUpdate: (state) => {
      useWorkflowSessionStore.getState().updateSession(config.sessionKey, state);
      // Do NOT write state.runId (workflow run ID) as feature pipeline runId.
      // The real feature runId comes from tool results via the toolRegistry onResult handler.
    },
    onWorkflowArtifactUpdate: (artifact) => {
      syncFeatureRunIdFromArtifact(artifact);
    },
    onRevert: () => {
      useFeatureStore.getState().clearDraft();
      useWorkflowSessionStore.getState().clearSession(config.sessionKey);
    },
    toolRegistry,
    toolUiRegistry: {},
    tipsProvider: (messages) => buildFeatureTips(config, messages)
  };
}
