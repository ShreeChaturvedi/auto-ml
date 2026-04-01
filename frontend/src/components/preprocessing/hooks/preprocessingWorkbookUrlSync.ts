import type { WorkbookEntry } from '@/types/workbook';

interface WorkbookWithId {
  id: string;
}

interface ResolveRequestedWorkbookActionOptions {
  tabsReady: boolean;
  activeTabId: string | undefined;
  requestedTabId: string | undefined;
  syncedWorkbookId: string | null;
  tabs: WorkbookWithId[];
  registry: WorkbookEntry[];
}

export type RequestedWorkbookAction =
  | { type: 'noop' }
  | { type: 'clear-synced' }
  | { type: 'sync-active'; tabId: string }
  | { type: 'switch'; tabId: string }
  | { type: 'adopt'; tabId: string; name: string };

export function resolveRequestedWorkbookAction({
  tabsReady,
  activeTabId,
  requestedTabId,
  syncedWorkbookId,
  tabs,
  registry
}: ResolveRequestedWorkbookActionOptions): RequestedWorkbookAction {
  if (!tabsReady || !activeTabId) {
    return { type: 'noop' };
  }

  if (!requestedTabId) {
    return { type: 'sync-active', tabId: activeTabId };
  }

  if (requestedTabId === activeTabId) {
    return syncedWorkbookId === requestedTabId
      ? { type: 'clear-synced' }
      : { type: 'noop' };
  }

  if (syncedWorkbookId === activeTabId) {
    return { type: 'sync-active', tabId: activeTabId };
  }

  if (tabs.some((tab) => tab.id === requestedTabId)) {
    return { type: 'switch', tabId: requestedTabId };
  }

  const entry = registry.find((workbook) => workbook.id === requestedTabId);
  if (entry) {
    return { type: 'adopt', tabId: entry.id, name: entry.name };
  }

  return { type: 'sync-active', tabId: activeTabId };
}
