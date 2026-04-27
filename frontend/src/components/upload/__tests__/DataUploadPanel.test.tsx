import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataUploadPanel } from '../DataUploadPanel';

const {
  dataStoreState,
  fetchProjectSuggestionsMock,
  hydrateFromBackendMock,
  suggestionStoreState,
  useDataStoreMock,
  useNlSuggestionStoreMock,
} = vi.hoisted(() => {
  const hydrateMock = vi.fn().mockResolvedValue(undefined);
  const suggestionsMock = vi.fn().mockResolvedValue(undefined);

  const storeState = {
    files: [] as Array<unknown>,
    addFile: vi.fn(),
    addPreview: vi.fn(),
    setFileMetadata: vi.fn(),
    deleteFile: vi.fn(),
    removeFile: vi.fn(),
    markDeleted: vi.fn(),
    hydrateFromBackend: hydrateMock,
  };

  const nlStoreState = {
    fetchProjectSuggestions: suggestionsMock,
  };

  const dataStore = Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    {
      getState: () => storeState,
    }
  );

  const nlSuggestionStore = Object.assign(
    (selector: (state: typeof nlStoreState) => unknown) => selector(nlStoreState),
    {
      getState: () => nlStoreState,
    }
  );

  return {
    dataStoreState: storeState,
    fetchProjectSuggestionsMock: suggestionsMock,
    hydrateFromBackendMock: hydrateMock,
    suggestionStoreState: nlStoreState,
    useDataStoreMock: dataStore,
    useNlSuggestionStoreMock: nlSuggestionStore,
  };
});

vi.mock('@/stores/dataStore', () => ({
  useDataStore: useDataStoreMock,
}));

vi.mock('@/stores/nlSuggestionStore', () => ({
  useNlSuggestionStore: useNlSuggestionStoreMock,
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock('../FileRow', () => ({
  FileRow: () => null,
}));

vi.mock('../FileBulkActionBar', () => ({
  FileBulkActionBar: () => null,
}));

describe('DataUploadPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataStoreState.files = [];
    suggestionStoreState.fetchProjectSuggestions = fetchProjectSuggestionsMock;
    dataStoreState.hydrateFromBackend = hydrateFromBackendMock;
  });

  it('advertises TSV and JSONL dataset aliases in the upload input', () => {
    const { container } = render(<DataUploadPanel projectId="project-1" />);

    const input = container.querySelector<HTMLInputElement>('#data-upload-input');
    expect(input).toBeTruthy();
    expect(input?.accept).toContain('.tsv');
    expect(input?.accept).toContain('.jsonl');
    expect(input?.accept).toContain('.ndjson');
    expect(
      screen.getByText(/supports csv, tsv, json, jsonl, ndjson, and xlsx for data/i)
    ).toBeInTheDocument();
  });
});
