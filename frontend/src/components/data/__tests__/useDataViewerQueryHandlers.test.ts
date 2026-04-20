import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDataViewerQueryHandlers } from '../hooks/useDataViewerQueryHandlers';
import { executeNlQuery, executeSqlQuery } from '@/lib/api/query';
import type { NlQueryResponsePayload } from '@/lib/api/query';
import type { Project } from '@/types/project';

const mockState = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockState.toastErrorMock,
    warning: mockState.toastWarningMock,
  },
}));

vi.mock('@/lib/api/query', () => ({
  executeNlQuery: vi.fn(),
  executeSqlQuery: vi.fn(),
  streamNlQuery: vi.fn(),
}));

const project = {
  id: 'project-1',
  title: 'Project 1',
  description: '',
  icon: 'Folder',
  color: 'blue' as const,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-01T00:00:00.000Z'),
  currentPhase: 'upload' as const,
  unlockedPhases: ['upload'],
  completedPhases: [],
  metadata: {},
} satisfies Project;

const explanation = {
  intentSummary: 'Summarize employee rows',
  selectedTables: ['employees'],
  joinPlan: [],
  filters: [],
  aggregations: [],
  assumptions: [],
  validationNotes: [],
  confidence: 0.9,
  warningLevel: 'none' as const,
  confidenceMode: 'model' as const,
  reliabilityTier: 'high' as const,
};

const queryPayload = {
  queryId: 'query-1',
  sql: 'SELECT * FROM employees',
  columns: [{ name: 'employee_id', dataType: 'integer' }],
  rows: [{ employee_id: 1 }],
  rowCount: 1,
  executionMs: 25,
  cached: false,
};

describe('useDataViewerQueryHandlers', () => {
  beforeEach(() => {
    mockState.toastErrorMock.mockReset();
    mockState.toastWarningMock.mockReset();
    vi.mocked(executeNlQuery).mockReset();
    vi.mocked(executeSqlQuery).mockReset();
  });

  it('normalizes missing NL query payloads to null', async () => {
    const nlPayload: NlQueryResponsePayload = {
      sql: 'SELECT * FROM employees',
      rationale: 'Inspect the employee table.',
      explanation,
      queryId: 'nl-1',
      query: null,
      provider: { id: 'provider-1', label: 'Provider 1', model: 'model-1' },
      cached: false,
      queryExecutionError: 'relation "employees" not ready',
    };
    vi.mocked(executeNlQuery).mockResolvedValue({ nl: nlPayload });

    const { result } = renderHook(() =>
      useDataViewerQueryHandlers({
        activeProject: project,
        createArtifact: vi.fn(),
        setActiveFileTab: vi.fn(),
        tableNames: ['employees'],
      }),
    );

    let generationResult: Awaited<ReturnType<typeof result.current.handleNlGenerate>> | undefined;
    await act(async () => {
      generationResult = await result.current.handleNlGenerate('show employees');
    });

    expect(generationResult).toEqual(
      expect.objectContaining({
        queryResult: null,
      }),
    );
    expect(mockState.toastWarningMock).toHaveBeenCalledWith(
      'Generated SQL needs review',
      expect.objectContaining({
        description: 'Initial execution hit a database error: relation "employees" not ready',
      }),
    );
  });

  it('creates and activates an artifact after SQL execution succeeds', async () => {
    vi.mocked(executeSqlQuery).mockResolvedValue({
      query: queryPayload,
    });

    const createArtifact = vi.fn(() => 'artifact-1');
    const setActiveFileTab = vi.fn();
    const { result } = renderHook(() =>
      useDataViewerQueryHandlers({
        activeProject: project,
        createArtifact,
        setActiveFileTab,
        tableNames: ['employees'],
      }),
    );

    await act(async () => {
      await result.current.handleExecuteQuery('SELECT * FROM employees', 'sql');
    });

    expect(createArtifact).toHaveBeenCalledWith(
      'SELECT * FROM employees',
      'sql',
      expect.objectContaining({
        fileId: 'query-result',
        headers: ['employee_id'],
        rows: [{ employee_id: 1 }],
      }),
      'project-1',
      expect.objectContaining({
        cached: false,
        executionMs: 25,
      }),
    );
    expect(setActiveFileTab).toHaveBeenCalledWith('artifact-1', 'artifact');
  });

  it('reuses the generated query result when approving unchanged SQL', async () => {
    const createArtifact = vi.fn(() => 'artifact-2');
    const setActiveFileTab = vi.fn();
    const { result } = renderHook(() =>
      useDataViewerQueryHandlers({
        activeProject: project,
        createArtifact,
        setActiveFileTab,
        tableNames: ['employees'],
      }),
    );

    await act(async () => {
      await result.current.handleNlApprove(
        {
          sql: 'SELECT * FROM employees',
          rationale: 'Inspect the employee table.',
          explanation,
          queryId: 'nl-2',
          provider: { id: 'provider-1', label: 'Provider 1', model: 'model-1' },
          cached: false,
          queryExecutionError: null,
          queryResult: queryPayload,
        },
        'SELECT * FROM employees',
      );
    });

    expect(executeSqlQuery).not.toHaveBeenCalled();
    expect(createArtifact).toHaveBeenCalledWith(
      'SELECT * FROM employees',
      'english',
      expect.objectContaining({
        fileId: 'query-result',
        headers: ['employee_id'],
      }),
      'project-1',
      expect.objectContaining({
        generatedSql: 'SELECT * FROM employees',
        rationale: 'Inspect the employee table.',
        explanation,
      }),
    );
    expect(setActiveFileTab).toHaveBeenCalledWith('artifact-2', 'artifact');
  });
});
