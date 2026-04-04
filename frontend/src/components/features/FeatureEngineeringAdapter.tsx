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
  notebookId?: string;
  notebookName?: string;
  notebookMetadata?: NotebookPhaseMetadata;
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

function resolveFeatureStepStatus(call: ToolCall, result: ToolResult): string {
  if (result.error) {
    return 'error';
  }

  const output = result.output as Record<string, unknown> | undefined;
  switch (call.tool) {
    case 'propose_feature':
      return 'proposed';
    case 'materialize_feature_code':
      return 'code_ready';
    case 'execute_feature':
      return output?.status === 'failed' || output?.succeeded === false ? 'failed' : 'executed';
    case 'validate_feature':
      return 'validated';
    case 'register_feature':
      return output?.status === 'rejected' ? 'rejected' : 'registered';
    default:
      return typeof output?.status === 'string' ? output.status : 'ok';
  }
}

function buildFeatureToolRegistry(projectId: string): DomainAdapter['toolRegistry'] {
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
        const existingFeature = store.features.find((feature) => feature.id === featureId);
        const existingStep = store.featureSteps[featureId];

        // Preserve prior step.code when the current tool call doesn't include
        // it. `register_feature` in particular has no `code` arg in its schema,
        // so a naive `code: call.args?.code` would overwrite the code that
        // `materialize_feature_code` persisted earlier — which then kills it
        // in localStorage on page reload. (Flagged by harsh critic review.)
        const toolCode = call.args?.code as string | undefined;
        const preservedCode = toolCode ?? existingStep?.code;

        store.setFeatureStep(featureId, {
          stepId: featureId,
          name: featureName,
          method,
          status: resolveFeatureStepStatus(call, result),
          error: result.error,
          code: preservedCode,
          metrics: output?.validation as Record<string, unknown> | undefined
        });

        // Bridge registered features into the FeatureSpec array for readiness report
        if (call.tool === 'register_feature' && !result.error) {
          const rejected = (output?.status as string) === 'rejected';
          if (!rejected) {
            const sourceColumns = (output?.sourceColumns ?? call.args?.sourceColumns) as string[] | undefined;
            // Prefer existingFeature's columns (set from the suggestion card
            // toggle path with correct sourceColumn + secondaryColumn from the
            // propose_feature output). Fall back to sourceColumns[0]/[1] only
            // for features that bypassed the suggestion card entirely.
            const secondaryColumn = existingFeature?.secondaryColumn ?? sourceColumns?.[1];
            store.upsertFeature({
              id: featureId,
              projectId: (output?.projectId as string) ?? existingFeature?.projectId ?? projectId,
              sourceColumn: existingFeature?.sourceColumn ?? sourceColumns?.[0] ?? existingStep?.name ?? '',
              ...(secondaryColumn ? { secondaryColumn } : {}),
              featureName: existingFeature?.featureName ?? existingStep?.name ?? featureName,
              description: (call.args?.rationale ?? output?.rationale ?? existingFeature?.description ?? '') as string,
              method: (existingFeature?.method ?? existingStep?.method ?? method ?? 'custom') as FeatureMethod,
              category: (existingFeature?.category ?? 'numeric_transform') as FeatureCategory,
              params: existingFeature?.params ?? {},
              enabled: true,
              createdAt: existingFeature?.createdAt ?? new Date().toISOString(),
              // Copy LLM-authored code from the step so the apply pipeline
              // can use it verbatim instead of regenerating from the method
              // template. The code was persisted earlier by materialize_feature_code.
              code: preservedCode ?? existingFeature?.code
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
  const runId = artifact.payload && typeof artifact.payload === 'object' && !Array.isArray(artifact.payload)
    ? (artifact.payload as Record<string, unknown>).featureRunId as string | undefined
    : undefined;
  if (runId) {
    useFeatureStore.getState().setFeatureRunId(runId);
  }
}

export function createFeatureEngineeringAdapter(
  config: FeatureEngineeringAdapterConfig
): DomainAdapter {
  const toolRegistry = buildFeatureToolRegistry(config.projectId);

  return {
    buildRequest: async (rawPrompt, _toolCalls, _toolResults, onEvent, signal, options) => {
      if (!config.datasetId) {
        throw new Error('Select a dataset before generating a feature plan.');
      }

      // Enrich the prompt with enabled features so the LLM knows what to implement
      const featureStore = useFeatureStore.getState();
      const enabledFeatures = featureStore.features.filter(
        (f) => f.projectId === config.projectId && f.enabled
      );
      let prompt = rawPrompt;
      if (enabledFeatures.length > 0 && /\b(implement|apply|build|execute|run|make)\b/i.test(rawPrompt)) {
        const featureIds = enabledFeatures.map((f) => f.id).join(', ');
        const featureList = enabledFeatures
          .map((f) => `${f.featureName} (${f.method} on ${f.sourceColumn})`)
          .join('; ');
        prompt = `${rawPrompt}\n\nSelected feature IDs to implement: ${featureIds}\nEnabled features to implement: ${featureList}`;
      }

      const session = useWorkflowSessionStore.getState().getSession(config.sessionKey);
      const notebookStore = useNotebookStore.getState();

      // Feature engineering uses a notebook scoped to the active draft
      // pipeline. Never adopt a preprocessing notebook or an arbitrary FE
      // notebook from another draft.
      let notebookId = config.notebookId?.trim() || undefined;
      if (notebookId && notebookStore.activeNotebookId !== notebookId) {
        await notebookStore.setActiveNotebook(notebookId);
        if (useNotebookStore.getState().activeNotebookId !== notebookId) {
          notebookId = undefined;
        }
      }

      if (!notebookId) {
        const activeNotebook = notebookStore.notebooks.find(
          (entry) => entry.notebookId === notebookStore.activeNotebookId
        );
        const activeMetadata = activeNotebook?.metadata as Record<string, unknown> | undefined;
        const expectedTabId = config.notebookMetadata && typeof config.notebookMetadata === 'object'
          ? (config.notebookMetadata as Record<string, unknown>).tabId
          : undefined;
        if (
          activeNotebook
          && activeMetadata?.phase === 'feature-engineering'
          && (!expectedTabId || activeMetadata?.tabId === expectedTabId)
        ) {
          notebookId = activeNotebook.notebookId;
        }
      }

      if (!notebookId) {
        const createdNotebook = await notebookStore.createNotebook(
          config.notebookName ?? 'Feature Engineering Notebook',
          config.notebookMetadata ?? { phase: 'feature-engineering' }
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
    },
    onWorkflowArtifactUpdate: (artifact) => {
      syncFeatureRunIdFromArtifact(artifact);
    },
    onRevert: () => {
      useFeatureStore.getState().clearDraft();
      useWorkflowSessionStore.getState().clearSession(config.sessionKey);
    },
    preserveToolHistoryBetweenPrompts: true,
    toolRegistry,
    toolUiRegistry: {},
    tipsProvider: (messages) => buildFeatureTips(config, messages)
  };
}
