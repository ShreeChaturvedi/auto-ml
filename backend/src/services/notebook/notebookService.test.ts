/**
 * notebookService barrel re-export tests
 *
 * The root cause of the sidebar-missing-notebooks bug was that
 * `updateProjectNotebook` was implemented in notebookCrudService but
 * NOT re-exported from notebookService.ts. The PATCH /api/notebooks/:id
 * route imports from notebookService, so it threw
 * "TypeError: notebookService.updateProjectNotebook is not a function".
 *
 * These tests verify every function the route layer expects is actually
 * exported, and that updateProjectNotebook delegates correctly.
 */

import { describe, expect, it, vi } from 'vitest';

// Mock the repository layer so we don't need a database
vi.mock('../../repositories/notebookRepository.js', () => ({
  listNotebooksByProject: vi.fn(),
  createNotebook: vi.fn(),
  getNotebook: vi.fn(),
  updateNotebook: vi.fn(),
  deleteNotebook: vi.fn()
}));

import * as repo from '../../repositories/notebookRepository.js';

// Import the barrel — this is the exact import the route uses
import * as notebookService from './notebookService.js';

const updateNotebookMock = vi.mocked(repo.updateNotebook);

describe('notebookService barrel exports', () => {
  // ── Existence checks ────────────────────────────────────────
  // These will catch any future accidental removal of re-exports.

  const expectedExports = [
    'ensureNotebook',
    'listProjectNotebooks',
    'createProjectNotebook',
    'renameProjectNotebook',
    'updateProjectNotebook',
    'deleteProjectNotebook',
    'getNotebook',
    'getNotebookByProject',
    // WebSocket helpers from notebookService itself
    'setWebSocketBroadcast',
    'broadcast'
  ] as const;

  it.each(expectedExports)('exports %s as a function', (name) => {
    const exported = (notebookService as Record<string, unknown>)[name];
    expect(exported).toBeDefined();
    expect(typeof exported).toBe('function');
  });

  // ── updateProjectNotebook delegation ────────────────────────
  // This is the function whose missing re-export caused the 500.

  it('updateProjectNotebook delegates to repo.updateNotebook with correct args', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const fakeNotebook = {
      notebookId: 'nb-1',
      projectId: 'p-1',
      name: 'Updated',
      metadata: { phase: 'preprocessing', tabId: 't1' },
      createdAt,
      updatedAt: createdAt
    };
    updateNotebookMock.mockResolvedValueOnce(fakeNotebook);

    const result = await notebookService.updateProjectNotebook('nb-1', {
      metadata: { phase: 'preprocessing', tabId: 't1' }
    });

    expect(updateNotebookMock).toHaveBeenCalledWith('nb-1', {
      metadata: { phase: 'preprocessing', tabId: 't1' }
    });
    expect(result).toEqual(fakeNotebook);
  });

  it('updateProjectNotebook passes both name and metadata when provided', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const fakeNotebook = {
      notebookId: 'nb-2',
      projectId: 'p-1',
      name: 'Renamed',
      metadata: { phase: 'training' },
      createdAt,
      updatedAt: createdAt
    };
    updateNotebookMock.mockResolvedValueOnce(fakeNotebook);

    const result = await notebookService.updateProjectNotebook('nb-2', {
      name: 'Renamed',
      metadata: { phase: 'training' }
    });

    expect(updateNotebookMock).toHaveBeenCalledWith('nb-2', {
      name: 'Renamed',
      metadata: { phase: 'training' }
    });
    expect(result).toEqual(fakeNotebook);
  });

  it('updateProjectNotebook propagates repo errors', async () => {
    updateNotebookMock.mockRejectedValueOnce(new Error('Notebook not found'));

    await expect(
      notebookService.updateProjectNotebook('nonexistent', { name: 'X' })
    ).rejects.toThrow('Notebook not found');
  });
});
