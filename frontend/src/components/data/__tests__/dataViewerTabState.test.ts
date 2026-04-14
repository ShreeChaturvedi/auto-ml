import { describe, expect, it } from 'vitest';

import type { OpenTab } from '@/types/dataViewer';
import type { Notebook } from '@/types/notebook';
import type { QueryArtifact, UploadedFile } from '@/types/file';

import {
  buildDatasetSchema,
  resolveDataViewerSelection,
  type ResolveDataViewerSelectionInput,
} from '../dataViewerTabState';

type PartialFile = Pick<UploadedFile, 'id'>;
type PartialArtifact = Pick<QueryArtifact, 'id'>;
type PartialNotebook = Pick<Notebook, 'notebookId'>;

function baseInput(overrides: Partial<ResolveDataViewerSelectionInput> = {}): ResolveDataViewerSelectionInput {
  return {
    openTabs: [] as OpenTab[],
    files: [] as PartialFile[],
    queryArtifacts: [] as PartialArtifact[],
    standaloneNotebooks: [] as PartialNotebook[],
    persistedActiveId: null,
    persistedActiveType: null,
    firstDataFileId: null,
    ...overrides,
  };
}

describe('dataViewerTabState', () => {
  describe('resolveDataViewerSelection', () => {
    it('keeps the current selection when the persisted active file still exists', () => {
      expect(
        resolveDataViewerSelection(
          baseInput({
            openTabs: [{ id: 'file-1', type: 'file' }],
            files: [{ id: 'file-1' }],
            queryArtifacts: [{ id: 'artifact-1' } as PartialArtifact],
            persistedActiveId: 'file-1',
            persistedActiveType: 'file',
            firstDataFileId: 'file-1',
          }),
        ),
      ).toEqual({ kind: 'keep-active' });
    });

    it('restores a persisted notebook tab when the standalone notebook still exists', () => {
      expect(
        resolveDataViewerSelection(
          baseInput({
            openTabs: [
              { id: 'file-1', type: 'file' },
              { id: 'nb-42', type: 'notebook' },
            ],
            files: [{ id: 'file-1' }],
            standaloneNotebooks: [{ notebookId: 'nb-42' } as PartialNotebook],
            persistedActiveId: 'nb-42',
            persistedActiveType: 'notebook',
            firstDataFileId: 'file-1',
          }),
        ),
      ).toEqual({ kind: 'keep-active' });
    });

    it('does not override a persisted notebook tab with a file tab on rehydrate', () => {
      // Regression: previously the auto-select effect only looked at file
      // tabs, so a persisted notebook selection was clobbered back to a
      // file on every reload.
      const result = resolveDataViewerSelection(
        baseInput({
          openTabs: [
            { id: 'file-a', type: 'file' },
            { id: 'file-b', type: 'file' },
            { id: 'nb-1', type: 'notebook' },
          ],
          files: [{ id: 'file-a' }, { id: 'file-b' }],
          standaloneNotebooks: [{ notebookId: 'nb-1' } as PartialNotebook],
          persistedActiveId: 'nb-1',
          persistedActiveType: 'notebook',
          firstDataFileId: 'file-a',
        }),
      );
      expect(result).toEqual({ kind: 'keep-active' });
    });

    it('keeps an active notebook selection while standalone notebooks are still hydrating', () => {
      const result = resolveDataViewerSelection(
        baseInput({
          openTabs: [
            { id: 'file-a', type: 'file' },
            { id: 'nb-pending', type: 'notebook' },
          ],
          files: [{ id: 'file-a' }],
          standaloneNotebooks: [],
          notebooksHydrated: false,
          persistedActiveId: 'nb-pending',
          persistedActiveType: 'notebook',
          firstDataFileId: 'file-a',
        }),
      );
      expect(result).toEqual({ kind: 'keep-active' });
    });

    it('falls back to the first open file when a persisted notebook no longer exists', () => {
      expect(
        resolveDataViewerSelection(
          baseInput({
            openTabs: [
              { id: 'file-a', type: 'file' },
              { id: 'nb-gone', type: 'notebook' },
            ],
            files: [{ id: 'file-a' }],
            standaloneNotebooks: [],
            notebooksHydrated: true,
            persistedActiveId: 'nb-gone',
            persistedActiveType: 'notebook',
            firstDataFileId: 'file-a',
          }),
        ),
      ).toEqual({ kind: 'activate', id: 'file-a', type: 'file' });
    });

    it('returns none when a persisted notebook no longer exists and nothing else is available', () => {
      expect(
        resolveDataViewerSelection(
          baseInput({
            openTabs: [{ id: 'nb-gone', type: 'notebook' }],
            notebooksHydrated: true,
            persistedActiveId: 'nb-gone',
            persistedActiveType: 'notebook',
          }),
        ),
      ).toEqual({ kind: 'none' });
    });

    it('prefers an already-open project file tab before artifacts', () => {
      expect(
        resolveDataViewerSelection(
          baseInput({
            openTabs: [
              { id: 'file-2', type: 'file' },
              { id: 'file-1', type: 'file' },
            ],
            files: [{ id: 'file-1' }, { id: 'file-2' }],
            queryArtifacts: [{ id: 'artifact-1' } as PartialArtifact],
            firstDataFileId: 'file-3',
          }),
        ),
      ).toEqual({ id: 'file-2', kind: 'activate', type: 'file' });
    });

    it('skips open file tabs that belong to other projects', () => {
      expect(
        resolveDataViewerSelection(
          baseInput({
            openTabs: [
              { id: 'file-other', type: 'file' },
              { id: 'file-mine', type: 'file' },
            ],
            files: [{ id: 'file-mine' }],
            firstDataFileId: 'file-mine',
          }),
        ),
      ).toEqual({ id: 'file-mine', kind: 'activate', type: 'file' });
    });

    it('activates an already-open notebook tab before auto-opening a file', () => {
      expect(
        resolveDataViewerSelection(
          baseInput({
            openTabs: [{ id: 'nb-7', type: 'notebook' }],
            standaloneNotebooks: [{ notebookId: 'nb-7' } as PartialNotebook],
            firstDataFileId: 'file-x',
          }),
        ),
      ).toEqual({ id: 'nb-7', kind: 'activate', type: 'notebook' });
    });

    it('falls back to the first artifact when no open tab matches', () => {
      expect(
        resolveDataViewerSelection(
          baseInput({
            queryArtifacts: [
              { id: 'artifact-1' } as PartialArtifact,
              { id: 'artifact-2' } as PartialArtifact,
            ],
            firstDataFileId: 'file-3',
          }),
        ),
      ).toEqual({ id: 'artifact-1', kind: 'activate', type: 'artifact' });
    });

    it('requests auto-opening the first data file when nothing else is available', () => {
      expect(
        resolveDataViewerSelection(
          baseInput({
            firstDataFileId: 'file-7',
          }),
        ),
      ).toEqual({ id: 'file-7', kind: 'open-file' });
    });

    it('returns none when nothing exists at all', () => {
      expect(resolveDataViewerSelection(baseInput())).toEqual({ kind: 'none' });
    });
  });

  describe('buildDatasetSchema', () => {
    it('builds dataset schema rows from the first file dtype map', () => {
      expect(
        buildDatasetSchema([
          {
            metadata: {
              datasetProfile: {
                nRows: 1,
                nCols: 2,
                dtypes: {
                  age: 'integer',
                  city: 'string',
                },
                nullCounts: { age: 0, city: 0 },
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
});
