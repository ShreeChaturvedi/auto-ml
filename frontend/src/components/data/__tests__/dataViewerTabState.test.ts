import { describe, expect, it } from 'vitest';

import {
  buildDatasetSchema,
  resolveDataViewerSelection,
} from '../dataViewerTabState';

describe('dataViewerTabState', () => {
  it('keeps the current selection when the active tab still belongs to the project', () => {
    expect(
      resolveDataViewerSelection({
        hasActiveArtifact: false,
        hasActiveFile: true,
        openFileTabsForProject: ['file-1'],
        queryArtifactIds: ['artifact-1'],
        firstDataFileId: 'file-1',
      }),
    ).toEqual({ kind: 'keep-active' });
  });

  it('prefers an already-open project file tab before artifacts', () => {
    expect(
      resolveDataViewerSelection({
        hasActiveArtifact: false,
        hasActiveFile: false,
        openFileTabsForProject: ['file-2', 'file-1'],
        queryArtifactIds: ['artifact-1'],
        firstDataFileId: 'file-3',
      }),
    ).toEqual({
      id: 'file-2',
      kind: 'activate',
      type: 'file',
    });
  });

  it('falls back to the first artifact before auto-opening a file', () => {
    expect(
      resolveDataViewerSelection({
        hasActiveArtifact: false,
        hasActiveFile: false,
        openFileTabsForProject: [],
        queryArtifactIds: ['artifact-1', 'artifact-2'],
        firstDataFileId: 'file-3',
      }),
    ).toEqual({
      id: 'artifact-1',
      kind: 'activate',
      type: 'artifact',
    });
  });

  it('requests auto-opening the first data file when nothing else is available', () => {
    expect(
      resolveDataViewerSelection({
        hasActiveArtifact: false,
        hasActiveFile: false,
        openFileTabsForProject: [],
        queryArtifactIds: [],
        firstDataFileId: 'file-7',
      }),
    ).toEqual({
      id: 'file-7',
      kind: 'open-file',
    });
  });

  it('builds dataset schema rows from the first file dtype map', () => {
    expect(
      buildDatasetSchema([
        {
          metadata: {
            datasetProfile: {
              dtypes: {
                age: 'integer',
                city: 'string',
              },
            },
          },
        },
      ]),
    ).toEqual([
      { column: 'age', dtype: 'integer' },
      { column: 'city', dtype: 'string' },
    ]);
  });

  it('returns undefined when the first file has no dtype metadata', () => {
    expect(buildDatasetSchema([{ metadata: {} }, {}])).toBeUndefined();
  });
});
