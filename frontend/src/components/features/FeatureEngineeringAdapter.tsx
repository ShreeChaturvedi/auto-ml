import type { DomainAdapter, SuggestionPill, ToolHandlers } from '@/types/agentic';
import { streamWorkflowTurn } from '@/lib/api/llm';
import { useFeatureStore } from '@/stores/featureStore';
import type { UploadedFile } from '@/types/file';
import type { ChatMessage, ToolCall, ToolResult } from '@/types/llmUi';
import { useNotebookStore } from '@/stores/notebookStore';
import { useWorkflowSessionStore } from '@/stores/workflowSessionStore';
import type { WorkflowArtifact } from '@/types/workflow';
import type { NotebookPhaseMetadata } from '@/types/notebook';

export interface FeatureEngineeringAdapterConfig {
  projectId: string;
  datasetId: string | undefined;
  targetColumn: string | undefined;
  datasetFiles: UploadedFile[];
  documentFiles: UploadedFile[];
  sessionKey: string;
  notebookName?: string;
  notebookMetadata?: NotebookPhaseMetadata;
}

function dedupeSuggestions(suggestions: SuggestionPill[]): SuggestionPill[] {
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

function buildFeatureSuggestions(
  config: FeatureEngineeringAdapterConfig,
  messages: ChatMessage[],
  isGenerating: boolean
): SuggestionPill[] {
  if (isGenerating) {
    return [];
  }

  const hasUserMessages = messages.some((message) => message.type === 'user');
  const latestError = [...messages].reverse().find((message) => message.type === 'error');
  const latestUserMessage = [...messages].reverse().find((message) => message.type === 'user');

  const datasetName = config.datasetFiles.find((file) => file.metadata?.datasetId === config.datasetId)?.name;
  const sourceName = (datasetName ?? 'the selected dataset').replace(/\.[^/.]+$/, '');

  const suggestions: SuggestionPill[] = [];

  if (!hasUserMessages) {
    suggestions.push(
      {
        id: 'fe-initial-candidates',
        label: 'Suggest candidate features',
        prompt: `Propose high-impact feature candidates for ${sourceName} and explain why each helps.`
      },
      {
        id: 'fe-initial-leakage',
        label: 'Leakage-safe plan',
        prompt: `Create a leakage-safe feature engineering plan for ${sourceName} with validation checks.`
      }
    );

    if (config.targetColumn) {
      suggestions.push({
        id: 'fe-initial-target-aware',
        label: 'Target-aware features',
        prompt: `Recommend feature transformations for ${sourceName} given target column "${config.targetColumn}".`
      });
    }

    if (config.documentFiles.length > 0) {
      suggestions.push({
        id: 'fe-initial-rag',
        label: 'Use context docs',
        prompt: 'Use uploaded context documents to prioritize domain-relevant features.'
      });
    }

    return dedupeSuggestions(suggestions).slice(0, 6);
  }

  if (latestError?.type === 'error') {
    suggestions.push({
      id: 'fe-error-recover',
      label: 'Recover from error',
      prompt: 'Diagnose the latest feature engineering error and propose the minimal safe fix.'
    });
  }

  if (latestUserMessage?.type === 'user') {
    const text = latestUserMessage.content.toLowerCase();
    if (text.includes('overfit') || text.includes('leak')) {
      suggestions.push({
        id: 'fe-overfit-guard',
        label: 'Reduce leakage risk',
        prompt: 'Rework the feature plan to reduce target leakage and overfitting risk.'
      });
    }
    if (text.includes('interpret') || text.includes('explain')) {
      suggestions.push({
        id: 'fe-interpretability',
        label: 'Interpretable features',
        prompt: 'Suggest simpler, interpretable feature alternatives and expected trade-offs.'
      });
    }
  }

  suggestions.push(
    {
      id: 'fe-validate',
      label: 'Add validation checks',
      prompt: 'Add post-transform validation checks for row-count drift, null drift, and schema changes.'
    },
    {
      id: 'fe-ready',
      label: 'Prepare for training',
      prompt: 'Finalize a training-ready feature set and summarize readiness risks.'
    }
  );

  return dedupeSuggestions(suggestions).slice(0, 7);
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

function buildFeatureToolRegistry(): DomainAdapter['toolRegistry'] {
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
        store.setFeatureStep(featureId, {
          stepId: featureId,
          name: (output?.featureName ?? call.args?.featureName ?? featureId) as string,
          method: (output?.method ?? call.args?.method ?? call.tool) as string,
          status: result.error ? 'error' : (output?.status ?? 'ok') as string,
          error: result.error,
          code: call.args?.code as string | undefined,
          metrics: output?.validation as Record<string, unknown> | undefined
        });
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
  // Prefer the first-class runId; fall back to runId inside payload for older events.
  const runId = artifact.runId
    ?? (artifact.payload && typeof artifact.payload === 'object' && !Array.isArray(artifact.payload)
      ? (artifact.payload as Record<string, unknown>).runId as string | undefined
      : undefined);
  if (runId) {
    useFeatureStore.getState().setFeatureRunId(runId);
  }
}

export function createFeatureEngineeringAdapter(
  config: FeatureEngineeringAdapterConfig
): DomainAdapter {
  const toolRegistry = buildFeatureToolRegistry();

  return {
    buildRequest: async (prompt, _toolCalls, _toolResults, onEvent, signal, options) => {
      if (!config.datasetId) {
        throw new Error('Select a dataset before generating a feature plan.');
      }

      const session = useWorkflowSessionStore.getState().getSession(config.sessionKey);
      const notebookStore = useNotebookStore.getState();
      let notebookId = notebookStore.activeNotebookId ?? undefined;

      if (!notebookId) {
        const createdNotebook = await notebookStore.createNotebook(
          config.notebookName ?? 'Feature Engineering Notebook',
          config.notebookMetadata
        );
        notebookId = createdNotebook?.notebookId;
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
      if (state.runId) {
        useFeatureStore.getState().setFeatureRunId(state.runId);
      }
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
    suggestionProvider: (messages, isGenerating) => buildFeatureSuggestions(config, messages, isGenerating)
  };
}
