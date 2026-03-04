import type { DomainAdapter, SuggestionPill } from '@/types/agentic';
import { streamFeaturePlan } from '@/lib/api/llm';
import type { UploadedFile } from '@/types/file';
import type { ChatMessage } from '@/types/llmUi';

export interface FeatureEngineeringAdapterConfig {
  projectId: string;
  datasetId: string | undefined;
  targetColumn: string | undefined;
  datasetFiles: UploadedFile[];
  documentFiles: UploadedFile[];
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

export function createFeatureEngineeringAdapter(
  config: FeatureEngineeringAdapterConfig
): DomainAdapter {
  return {
    buildRequest: async (prompt, toolCalls, toolResults, onEvent, signal, options) => {
      if (!config.datasetId) {
        throw new Error('Select a dataset before generating a feature plan.');
      }

      await streamFeaturePlan(
        {
          projectId: config.projectId,
          datasetId: config.datasetId,
          targetColumn: config.targetColumn,
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
    toolRegistry: {},
    toolUiRegistry: {},
    suggestionProvider: (messages, isGenerating) => buildFeatureSuggestions(config, messages, isGenerating)
  };
}
