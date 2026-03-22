import type { ChatMessage } from '@/types/llmUi';
import { asRecordOrNull } from '@/lib/typeCoercion';
import { isWorkflowThreadId } from '@/lib/workflowThread';

export function buildProcessingStorageKey(tabId: string): string {
  return `preprocessing-messages-v5-${tabId}`;
}

export function buildProcessingTabsStateKey(projectId: string): string {
  return `preprocessing-tabs-v1-${projectId}`;
}

// ---- Workbook-era key builders (same format, new prefix for clarity) ------

export const buildWorkbookStorageKey = buildProcessingStorageKey;

export function buildWorkbookTabsStateKey(projectId: string): string {
  return `preprocessing-workbooks-v1-${projectId}`;
}

/**
 * One-time localStorage migration: old preprocessing-tabs-v1 → preprocessing-workbooks-v1.
 * Returns the parsed state from whichever key exists (new key preferred).
 */
export function migrateWorkbookState(projectId: string): StoredPreprocessingTabsState | null {
  const newKey = buildWorkbookTabsStateKey(projectId);
  const existing = localStorage.getItem(newKey);
  if (existing) {
    return parseStoredPreprocessingTabsState(existing);
  }

  const oldKey = buildProcessingTabsStateKey(projectId);
  const legacy = localStorage.getItem(oldKey);
  if (!legacy) return null;

  const parsed = parseStoredPreprocessingTabsState(legacy);
  if (parsed) {
    // Migrate names: "Processing N" → "Workbook N"
    const migrated: StoredPreprocessingTabsState = {
      activeTabId: parsed.activeTabId,
      tabs: parsed.tabs.map((tab) => ({
        ...tab,
        name: tab.name.replace(/^Processing\s+/i, 'Workbook ')
      }))
    };
    localStorage.setItem(newKey, JSON.stringify(migrated));
    localStorage.removeItem(oldKey);
    return migrated;
  }

  return null;
}

export interface StoredPreprocessingTabState {
  id: string;
  name: string;
  storageVersion: number;
  notebookId: string | null;
  selectedDatasetId: string | null;
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
            const record = asRecordOrNull(tab);
            if (!record) {
              return null;
            }
            const id = typeof record.id === 'string' ? record.id : '';
            const name = typeof record.name === 'string' ? record.name : '';
            const storageVersion = typeof record.storageVersion === 'number'
              ? record.storageVersion
              : 0;
            const notebookId = typeof record.notebookId === 'string' && record.notebookId.trim()
              ? record.notebookId
              : null;
            const selectedDatasetId = typeof record.selectedDatasetId === 'string' && record.selectedDatasetId.trim()
              ? record.selectedDatasetId
              : null;
            if (!id.trim() || !name.trim()) {
              return null;
            }
            return { id, name, storageVersion, notebookId, selectedDatasetId };
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

function readStoredConversationMessages(rawMessages: string | null): ChatMessage[] {
  if (!rawMessages) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawMessages) as ChatMessage[] | { messages?: ChatMessage[] };
    return Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.messages)
        ? parsed.messages
        : [];
  } catch {
    return [];
  }
}

export function extractRawRunReferenceFromStoredMessages(rawMessages: string | null): string | null {
  const messages = readStoredConversationMessages(rawMessages);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type !== 'tool_call' || !message.result) {
      continue;
    }
    const output = asRecordOrNull(message.result.output);
    const runId = output && typeof output.runId === 'string' ? output.runId : undefined;
    if (runId && runId.trim()) {
      return runId;
    }
  }

  return null;
}

export function extractRunIdFromStoredMessages(rawMessages: string | null): string | null {
  const runReference = extractRawRunReferenceFromStoredMessages(rawMessages);
  if (!runReference || isWorkflowThreadId(runReference)) {
    return null;
  }

  return runReference;
}
