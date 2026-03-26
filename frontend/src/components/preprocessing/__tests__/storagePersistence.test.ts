import { afterEach, describe, expect, it } from 'vitest';

import {
  buildProcessingStorageKey,
  buildProcessingTabsStateKey,
  discoverProcessingTabIds,
  extractRunIdFromStoredMessages,
  parseStoredPreprocessingTabsState
} from '../storagePersistence';
import { isWorkflowThreadId } from '@/lib/workflowThread';

afterEach(() => {
  localStorage.clear();
});

describe('preprocessing storage persistence helpers', () => {
  it('builds a stable key per tab id', () => {
    expect(buildProcessingStorageKey('processing-tab-1')).toBe('preprocessing-messages-v5-processing-tab-1');
    expect(buildProcessingStorageKey('processing-tab-1')).toBe('preprocessing-messages-v5-processing-tab-1');
    expect(buildProcessingTabsStateKey('project-123')).toBe('preprocessing-tabs-v1-project-123');
  });

  it('extracts latest run id from tool-call messages', () => {
    const storedMessages = JSON.stringify([
      { id: 'u1', type: 'user', content: 'hello', timestamp: Date.now() },
      {
        id: 't1',
        type: 'tool_call',
        call: { id: 'call-1', tool: 'set_active_dataset', args: {} },
        result: { id: 'call-1', tool: 'set_active_dataset', output: { runId: 'prep-old' } }
      },
      {
        id: 't2',
        type: 'tool_call',
        call: { id: 'call-2', tool: 'validate_step_result', args: {} },
        result: { id: 'call-2', tool: 'validate_step_result', output: { runId: 'prep-latest' } }
      }
    ]);

    expect(extractRunIdFromStoredMessages(storedMessages)).toBe('prep-latest');
  });

  it('extracts latest run id from v2 persisted conversation payloads', () => {
    const storedConversation = JSON.stringify({
      version: 2,
      messages: [
        { id: 'u1', type: 'user', content: 'hello', timestamp: Date.now() },
        {
          id: 't1',
          type: 'tool_call',
          call: { id: 'call-1', tool: 'set_active_dataset', args: {} },
          result: { id: 'call-1', tool: 'set_active_dataset', output: { runId: 'prep-old' } }
        },
        {
          id: 't2',
          type: 'tool_call',
          call: { id: 'call-2', tool: 'validate_step_result', args: {} },
          result: { id: 'call-2', tool: 'validate_step_result', output: { runId: 'prep-v2-latest' } }
        }
      ],
      savepoints: {}
    });

    expect(extractRunIdFromStoredMessages(storedConversation)).toBe('prep-v2-latest');
  });

  it('returns null for malformed json payload', () => {
    expect(extractRunIdFromStoredMessages('{oops')).toBeNull();
  });

  it('returns null when no tool-call result contains run id', () => {
    const storedMessages = JSON.stringify([
      { id: 'u1', type: 'user', content: 'hello', timestamp: Date.now() },
      {
        id: 't1',
        type: 'tool_call',
        call: { id: 'call-1', tool: 'set_active_dataset', args: {} },
        result: { id: 'call-1', tool: 'set_active_dataset', output: { datasetId: 'dataset-1' } }
      }
    ]);

    expect(extractRunIdFromStoredMessages(storedMessages)).toBeNull();
  });

  it('ignores workflow thread identifiers persisted as run references', () => {
    const storedConversation = JSON.stringify({
      version: 2,
      messages: [
        {
          id: 't1',
          type: 'tool_call',
          call: { id: 'call-1', tool: 'profile_active_dataset', args: {} },
          result: { id: 'call-1', tool: 'profile_active_dataset', output: { runId: 'thread-7b839c25-712e-415a-919e-2e637d1402bc' } }
        }
      ],
      savepoints: {}
    });

    expect(isWorkflowThreadId('thread-7b839c25-712e-415a-919e-2e637d1402bc')).toBe(true);
    expect(isWorkflowThreadId('workflow-thread-1')).toBe(true);
    expect(isWorkflowThreadId('prep-run-123')).toBe(false);
    expect(extractRunIdFromStoredMessages(storedConversation)).toBeNull();
  });

  it('parses persisted tabs metadata payload', () => {
    const parsed = parseStoredPreprocessingTabsState(JSON.stringify({
      activeTabId: 'proc-2',
      tabs: [
        { id: 'proc-1', name: 'Processing 1', storageVersion: 0, notebookId: null },
        { id: 'proc-2', name: 'Processing 2', storageVersion: 3, notebookId: 'nb-2' }
      ]
    }));

    expect(parsed).toEqual({
      activeTabId: 'proc-2',
      tabs: [
        { id: 'proc-1', name: 'Processing 1', storageVersion: 0, notebookId: null, selectedDatasetId: null },
        { id: 'proc-2', name: 'Processing 2', storageVersion: 3, notebookId: 'nb-2', selectedDatasetId: null }
      ]
    });
  });

  it('supports old tabs metadata payloads without notebook id', () => {
    const parsed = parseStoredPreprocessingTabsState(JSON.stringify({
      activeTabId: 'proc-1',
      tabs: [{ id: 'proc-1', name: 'Processing 1', storageVersion: 0 }]
    }));

    expect(parsed).toEqual({
      activeTabId: 'proc-1',
      tabs: [{ id: 'proc-1', name: 'Processing 1', storageVersion: 0, notebookId: null, selectedDatasetId: null }]
    });
  });

  it('returns null for invalid persisted tabs metadata payload', () => {
    expect(parseStoredPreprocessingTabsState(null)).toBeNull();
    expect(parseStoredPreprocessingTabsState('{invalid-json')).toBeNull();
    expect(parseStoredPreprocessingTabsState(JSON.stringify({
      activeTabId: '',
      tabs: [{ id: 'proc-1', name: 'Processing 1', storageVersion: 0 }]
    }))).toBeNull();
  });

  it('discovers tab ids from per-project message keys', () => {
    localStorage.setItem('preprocessing-messages-v5-proc-a-project-1', '[]');
    localStorage.setItem('preprocessing-messages-v5-proc-b-project-1', '[]');
    localStorage.setItem('preprocessing-messages-v5-proc-c-project-2', '[]');
    localStorage.setItem('some-other-key', '[]');

    const discovered = discoverProcessingTabIds('project-1');

    expect(discovered.sort()).toEqual(['proc-a', 'proc-b']);
  });
});
