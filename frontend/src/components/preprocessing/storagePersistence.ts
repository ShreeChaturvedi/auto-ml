import type { ChatMessage } from '@/types/llmUi';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function buildProcessingStorageKey(tabId: string): string {
  return `preprocessing-messages-v5-${tabId}`;
}

export function buildProcessingTabsStateKey(projectId: string): string {
  return `preprocessing-tabs-v1-${projectId}`;
}

export interface StoredPreprocessingTabState {
  id: string;
  name: string;
  storageVersion: number;
}

export interface StoredPreprocessingTabsState {
  activeTabId: string;
  tabs: StoredPreprocessingTabState[];
}

export function parseStoredPreprocessingTabsState(
  rawState: string | null
): StoredPreprocessingTabsState | null {
  if (!rawState) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawState) as Record<string, unknown>;
    const activeTabId = typeof parsed.activeTabId === 'string' ? parsed.activeTabId : '';
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs
          .map((tab) => {
            const record = asRecord(tab);
            if (!record) {
              return null;
            }
            const id = typeof record.id === 'string' ? record.id : '';
            const name = typeof record.name === 'string' ? record.name : '';
            const storageVersion = typeof record.storageVersion === 'number'
              ? record.storageVersion
              : 0;
            if (!id.trim() || !name.trim()) {
              return null;
            }
            return { id, name, storageVersion };
          })
          .filter((tab): tab is StoredPreprocessingTabState => Boolean(tab))
      : [];

    if (!activeTabId.trim() || tabs.length === 0) {
      return null;
    }

    return { activeTabId, tabs };
  } catch {
    return null;
  }
}

export function discoverProcessingTabIds(projectId: string): string[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  const suffix = `-${projectId}`;
  const prefix = 'preprocessing-messages-v5-';
  const discovered = new Set<string>();

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(prefix) || !key.endsWith(suffix)) {
      continue;
    }
    const tabId = key.slice(prefix.length, key.length - suffix.length);
    if (tabId.trim()) {
      discovered.add(tabId);
    }
  }

  return [...discovered];
}

export function extractRunIdFromStoredMessages(rawMessages: string | null): string | null {
  if (!rawMessages) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawMessages) as ChatMessage[];
    for (let index = parsed.length - 1; index >= 0; index -= 1) {
      const message = parsed[index];
      if (message.type !== 'tool_call' || !message.result) {
        continue;
      }
      const output = asRecord(message.result.output);
      const runId = output && typeof output.runId === 'string' ? output.runId : undefined;
      if (runId && runId.trim()) {
        return runId;
      }
    }
  } catch {
    return null;
  }

  return null;
}
