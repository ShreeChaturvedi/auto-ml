import { useEffect, useState } from 'react';

import {
  listLlmModels,
  type LlmModelCatalogEntry,
  type LlmModelCatalogResponse
} from '@/lib/api/llm';
import {
  DEFAULT_ASSISTANT_MODEL,
  DEFAULT_REASONING_EFFORT,
  type AssistantModelOption
} from '@/components/llm/modelOptions';

let cachedCatalog: LlmModelCatalogResponse | null = null;
let pendingCatalogRequest: Promise<LlmModelCatalogResponse> | null = null;

function toAssistantModelOption(entry: LlmModelCatalogEntry): AssistantModelOption {
  return {
    value: entry.id,
    label: entry.label,
    kind: entry.kind,
    description: entry.description ?? entry.tip ?? '',
    supportedReasoningEfforts: entry.reasoningEfforts,
    defaultReasoningEffort: entry.defaultReasoningEffort,
    featured: entry.featured
  };
}

function normalizeCatalog(catalog: LlmModelCatalogResponse) {
  const featuredEntries = catalog.featuredModels
    ?? catalog.featured
    ?? catalog.models.filter((entry) => entry.featured);
  const defaultEntry = catalog.models.find((entry) => entry.id === catalog.defaultModel)
    ?? featuredEntries[0]
    ?? catalog.models[0];

  return {
    catalog,
    featuredModelOptions: featuredEntries.map(toAssistantModelOption),
    allModelOptions: catalog.models.map(toAssistantModelOption),
    defaultModel: catalog.defaultModel,
    defaultReasoningEffort: catalog.defaultReasoningEffort
      ?? defaultEntry?.defaultReasoningEffort
      ?? DEFAULT_REASONING_EFFORT
  };
}

async function loadCatalog(): Promise<LlmModelCatalogResponse> {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  if (!pendingCatalogRequest) {
    pendingCatalogRequest = listLlmModels().then((response) => {
      cachedCatalog = response;
      return response;
    }).finally(() => {
      pendingCatalogRequest = null;
    });
  }

  return pendingCatalogRequest;
}

function emptyCatalogState() {
  return {
    catalog: null as LlmModelCatalogResponse | null,
    featuredModelOptions: [] as AssistantModelOption[],
    allModelOptions: [] as AssistantModelOption[],
    defaultModel: DEFAULT_ASSISTANT_MODEL,
    defaultReasoningEffort: DEFAULT_REASONING_EFFORT
  };
}

export function resetLlmModelCatalogCacheForTests() {
  cachedCatalog = null;
  pendingCatalogRequest = null;
}

export function useLlmModelCatalog() {
  const [state, setState] = useState(() => {
    if (!cachedCatalog) {
      return {
        ...emptyCatalogState(),
        isLoading: true,
        error: null as Error | null
      };
    }

    return {
      ...normalizeCatalog(cachedCatalog),
      isLoading: false,
      error: null as Error | null
    };
  });

  useEffect(() => {
    if (cachedCatalog) {
      return;
    }

    let cancelled = false;

    void loadCatalog()
      .then((catalog) => {
        if (cancelled) {
          return;
        }

        setState({
          ...normalizeCatalog(catalog),
          isLoading: false,
          error: null
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setState((current) => ({
          ...current,
          isLoading: false,
          error: error instanceof Error ? error : new Error('Failed to load model catalog.')
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
