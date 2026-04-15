import type { WorkbookEntry } from '@/types/workbook';

export const DEFAULT_TRAINING_WORKBOOK_ID = 'training-wb-1';

export interface StoredTrainingWorkbooksState {
  activeWorkbookId: string;
  workbooks: WorkbookEntry[];
}

function createDefaultTrainingWorkbooksState(): StoredTrainingWorkbooksState {
  return {
    activeWorkbookId: DEFAULT_TRAINING_WORKBOOK_ID,
    workbooks: [
      {
        id: DEFAULT_TRAINING_WORKBOOK_ID,
        name: 'Workbook 1',
        notebookId: null
      }
    ]
  };
}

export function buildTrainingWorkbooksStateKey(projectId: string): string {
  return `training-workbooks-v1-${projectId}`;
}

export function buildTrainingWorkbookMessageKey(workbookId: string, projectId: string): string {
  return `training-messages-v1-${workbookId}-${projectId}`;
}

function parseStoredTrainingWorkbooksState(raw: string | null): StoredTrainingWorkbooksState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredTrainingWorkbooksState;
    if (!parsed.activeWorkbookId || !Array.isArray(parsed.workbooks) || parsed.workbooks.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveActiveWorkbookId(
  workbooks: WorkbookEntry[],
  requestedWorkbookId: string | undefined,
  storedActiveWorkbookId: string
): string {
  if (requestedWorkbookId && workbooks.some((workbook) => workbook.id === requestedWorkbookId)) {
    return requestedWorkbookId;
  }

  if (workbooks.some((workbook) => workbook.id === storedActiveWorkbookId)) {
    return storedActiveWorkbookId;
  }

  return workbooks[0]?.id ?? DEFAULT_TRAINING_WORKBOOK_ID;
}

export function readStoredTrainingWorkbooksState(
  projectId: string | undefined,
  requestedWorkbookId?: string
): StoredTrainingWorkbooksState | null {
  if (!projectId) {
    return null;
  }

  const stateKey = buildTrainingWorkbooksStateKey(projectId);
  const storage = globalThis.localStorage;
  let state = parseStoredTrainingWorkbooksState(storage?.getItem(stateKey) ?? null);

  if (!state) {
    const legacyKey = `training-messages-${projectId}`;
    const legacyMessages = storage?.getItem(legacyKey) ?? null;

    state = createDefaultTrainingWorkbooksState();

    if (legacyMessages) {
      storage?.setItem(
        buildTrainingWorkbookMessageKey(DEFAULT_TRAINING_WORKBOOK_ID, projectId),
        legacyMessages
      );
      storage?.removeItem(legacyKey);
    }

    storage?.setItem(stateKey, JSON.stringify(state));
  }

  return {
    ...state,
    activeWorkbookId: resolveActiveWorkbookId(
      state.workbooks,
      requestedWorkbookId,
      state.activeWorkbookId
    )
  };
}

export function getStoredTrainingActiveWorkbookId(projectId: string): string | undefined {
  return readStoredTrainingWorkbooksState(projectId)?.activeWorkbookId;
}
