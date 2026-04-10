/**
 * notebookCrudService unit tests
 *
 * Covers kind-aware notebook behavior:
 *   - `ensureNotebook` must only ever resolve to a phase notebook, so the
 *     phase sync pipeline and LLM tools can never accidentally pick up a
 *     standalone exploration notebook.
 *   - `deleteProjectNotebook` enforces "at least one phase notebook per
 *     project" but has no minimum for standalone notebooks.
 *   - Project-mismatch is treated the same as not-found.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the repository barrel so we don't need a database.
vi.mock('../../repositories/notebookRepository.js', () => ({
  listNotebooksByProject: vi.fn(),
  createNotebook: vi.fn(),
  getNotebook: vi.fn(),
  updateNotebook: vi.fn(),
  deleteNotebook: vi.fn()
}));

import * as repo from '../../repositories/notebookRepository.js';
import type { Notebook } from '../../types/notebook.js';

import {
  ensureNotebook,
  listProjectNotebooks,
  deleteProjectNotebook
} from './notebookCrudService.js';

const listMock = vi.mocked(repo.listNotebooksByProject);
const createMock = vi.mocked(repo.createNotebook);
const getMock = vi.mocked(repo.getNotebook);
const deleteMock = vi.mocked(repo.deleteNotebook);

// ------------------------------------------------------------
// Test fixtures
// ------------------------------------------------------------

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-2222-2222-222222222222';

function makeNotebook(overrides: Partial<Notebook> = {}): Notebook {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    notebookId: overrides.notebookId ?? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    projectId: PROJECT_ID,
    name: 'Notebook',
    kind: 'phase',
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// ensureNotebook
// ============================================================

describe('ensureNotebook', () => {
  it('returns the existing phase notebook without creating a new one', async () => {
    const existing = makeNotebook({
      notebookId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      kind: 'phase'
    });
    listMock.mockResolvedValueOnce([existing]);

    const result = await ensureNotebook(PROJECT_ID);

    expect(listMock).toHaveBeenCalledWith(PROJECT_ID, { kind: 'phase' });
    expect(createMock).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('creates a default phase notebook when none exist', async () => {
    listMock.mockResolvedValueOnce([]);
    const created = makeNotebook({
      notebookId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      name: 'Notebook 1',
      kind: 'phase'
    });
    createMock.mockResolvedValueOnce(created);

    const result = await ensureNotebook(PROJECT_ID);

    expect(listMock).toHaveBeenCalledWith(PROJECT_ID, { kind: 'phase' });
    expect(createMock).toHaveBeenCalledWith(PROJECT_ID, {
      name: 'Notebook 1',
      kind: 'phase'
    });
    expect(result).toBe(created);
  });

  it('never returns a standalone notebook even if standalones exist', async () => {
    // Because ensureNotebook always filters by kind: 'phase', the repo mock
    // only sees that filter. A standalone notebook must therefore never be
    // visible in the result — the mock enforces this by returning [] for
    // phase queries regardless of what standalone notebooks might exist.
    listMock.mockImplementation(async (_projectId, options) => {
      if (options?.kind === 'phase') return [];
      return [
        makeNotebook({
          notebookId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          kind: 'standalone',
          name: 'User scratch'
        })
      ];
    });
    const created = makeNotebook({
      notebookId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      name: 'Notebook 1',
      kind: 'phase'
    });
    createMock.mockResolvedValueOnce(created);

    const result = await ensureNotebook(PROJECT_ID);

    // Only the { kind: 'phase' } query is issued — standalone notebooks are
    // never fetched or considered.
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledWith(PROJECT_ID, { kind: 'phase' });
    expect(result.kind).toBe('phase');
    expect(result).toBe(created);
  });
});

// ============================================================
// listProjectNotebooks
// ============================================================

describe('listProjectNotebooks', () => {
  it('forwards the kind filter option to the repository', async () => {
    const standalone = makeNotebook({
      notebookId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      kind: 'standalone'
    });
    listMock.mockResolvedValueOnce([standalone]);

    const result = await listProjectNotebooks(PROJECT_ID, { kind: 'standalone' });

    expect(listMock).toHaveBeenCalledWith(PROJECT_ID, { kind: 'standalone' });
    expect(result).toEqual([standalone]);
  });
});

// ============================================================
// deleteProjectNotebook
// ============================================================

describe('deleteProjectNotebook', () => {
  it('blocks deleting the last phase notebook', async () => {
    const onlyPhase = makeNotebook({
      notebookId: '10101010-1010-1010-1010-101010101010',
      kind: 'phase'
    });
    getMock.mockResolvedValueOnce(onlyPhase);
    listMock.mockResolvedValueOnce([onlyPhase]);

    await expect(
      deleteProjectNotebook(PROJECT_ID, onlyPhase.notebookId)
    ).rejects.toThrow('Cannot delete the last phase notebook');

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('allows deleting the last standalone notebook', async () => {
    const lastStandalone = makeNotebook({
      notebookId: '20202020-2020-2020-2020-202020202020',
      kind: 'standalone'
    });
    getMock.mockResolvedValueOnce(lastStandalone);
    // No standalones remain after deletion.
    listMock.mockResolvedValueOnce([]);
    deleteMock.mockResolvedValueOnce(true);

    const result = await deleteProjectNotebook(PROJECT_ID, lastStandalone.notebookId);

    expect(deleteMock).toHaveBeenCalledWith(lastStandalone.notebookId);
    expect(listMock).toHaveBeenCalledWith(PROJECT_ID, { kind: 'standalone' });
    expect(result).toEqual({
      deletedNotebookId: lastStandalone.notebookId,
      fallbackNotebookId: null
    });
  });

  it('returns a fallback when deleting a non-last phase notebook', async () => {
    const target = makeNotebook({
      notebookId: '30303030-3030-3030-3030-303030303030',
      kind: 'phase',
      name: 'Doomed'
    });
    const survivor = makeNotebook({
      notebookId: '40404040-4040-4040-4040-404040404040',
      kind: 'phase',
      name: 'Survivor'
    });
    getMock.mockResolvedValueOnce(target);
    listMock.mockResolvedValueOnce([target, survivor]);
    deleteMock.mockResolvedValueOnce(true);

    const result = await deleteProjectNotebook(PROJECT_ID, target.notebookId);

    expect(deleteMock).toHaveBeenCalledWith(target.notebookId);
    expect(result).toEqual({
      deletedNotebookId: target.notebookId,
      fallbackNotebookId: survivor.notebookId
    });
  });

  it('rejects when the notebook belongs to a different project', async () => {
    const foreign = makeNotebook({
      notebookId: '50505050-5050-5050-5050-505050505050',
      projectId: OTHER_PROJECT_ID,
      kind: 'phase'
    });
    getMock.mockResolvedValueOnce(foreign);

    await expect(
      deleteProjectNotebook(PROJECT_ID, foreign.notebookId)
    ).rejects.toThrow('Notebook not found');

    expect(listMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('rejects when the notebook does not exist at all', async () => {
    getMock.mockResolvedValueOnce(null);

    await expect(
      deleteProjectNotebook(PROJECT_ID, '60606060-6060-6060-6060-606060606060')
    ).rejects.toThrow('Notebook not found');

    expect(deleteMock).not.toHaveBeenCalled();
  });
});
