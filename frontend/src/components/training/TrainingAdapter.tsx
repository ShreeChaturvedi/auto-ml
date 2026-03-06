import type { DomainAdapter, SuggestionPill } from '@/types/agentic';
import { streamTrainingPlan } from '@/lib/api/llm';
import type { UploadedFile } from '@/types/file';
import type { ChatMessage } from '@/types/llmUi';

export interface TrainingAdapterConfig {
  projectId: string;
  datasetId: string | undefined;
  targetColumn: string | undefined;
  featureSummary: string | undefined;
  datasetFiles: UploadedFile[];
  documentFiles: UploadedFile[];
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
      suggestions.push(
        {
          id: 'train-initial-baseline',
          label: 'Baseline model',
          prompt: 'Suggest a strong baseline training plan for this dataset with sensible defaults.'
        },
        {
          id: 'train-initial-target',
          label: 'Pick target + metric',
          prompt: 'Help me choose the right target column and evaluation metrics for this project.'
        }
      );
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

export function createTrainingAdapter(config: TrainingAdapterConfig): DomainAdapter {
  return {
    buildRequest: async (prompt, toolCalls, toolResults, onEvent, signal, options) => {
      if (!config.datasetId) return;
      await streamTrainingPlan(
        {
          projectId: config.projectId,
          datasetId: config.datasetId,
          targetColumn: config.targetColumn,
          prompt,
          toolCalls,
          toolResults,
          featureSummary: config.featureSummary,
          enableThinking: options.enableThinking,
          thinkingLevel: options.thinkingLevel,
          model: options.model
        },
        onEvent,
        signal
      );
    },
    
    toolRegistry: {},
    toolUiRegistry: {},
    suggestionProvider: (messages, isGenerating) => buildTrainingSuggestions(config, messages, isGenerating)
  };
}
