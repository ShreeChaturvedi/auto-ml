import { describe, expect, it } from 'vitest';

import {
  extractWorkflowPrepSegmentsFromSegments,
  extractWorkflowPrepSegmentsFromToolCalls,
  normalizeWorkflowPrepSegments,
} from '../workflowPrepSegments.js';

describe('normalizeWorkflowPrepSegments', () => {
  it('drops non-string entries and empty strings', () => {
    expect(
      normalizeWorkflowPrepSegments(['a', '', null, undefined, 'b', 42])
    ).toEqual(['a', 'b']);
  });

  it('rewrites legacy Series.view("int64") into .astype("int64")', () => {
    expect(
      normalizeWorkflowPrepSegments(['df["d"] = df["d"].view("int64")'])
    ).toEqual(['df["d"] = df["d"].astype("int64")']);
  });
});

describe('extractWorkflowPrepSegmentsFromSegments', () => {
  it('stops at the first segment containing a .fit( / __TRAIN_COMPLETE__ / joblib.dump / predict pattern', () => {
    const segments = [
      { content: 'import pandas as pd' },
      { content: 'X_train, X_test, y_train, y_test = split(df)' },
      { content: 'model.fit(X_train, y_train)' }, // STOP — excluded
      { content: 'joblib.dump(model, "model.joblib")' },
    ];
    expect(extractWorkflowPrepSegmentsFromSegments(segments)).toEqual([
      'import pandas as pd',
      'X_train, X_test, y_train, y_test = split(df)',
    ]);
  });
});

describe('extractWorkflowPrepSegmentsFromToolCalls — live-content strategy (Gap #1)', () => {
  const experimentId = 'exp-live';

  it('uses args.content per write_cell call, not the frozen plan', () => {
    // LLM wrote Dataset Prep initially with a naive read_csv, then
    // re-wrote it with a robust variant. The frozen segments array in
    // metadata still points at the NAIVE plan, but args.content reflects
    // the LIVE notebook state. Gap #1: we must use args.content so the
    // evaluator replays the corrected code.
    const toolCalls = [
      {
        tool: 'write_cell',
        args: {
          content: 'import pandas as pd',
          metadata: {
            trainingDraft: {
              experimentId,
              segments: [
                { content: 'import pandas as pd' },
                { content: 'df = pd.read_csv(path)' }, // naive (stale plan)
                { content: 'model.fit(X, y)' },
              ],
            },
          },
        },
      },
      {
        tool: 'write_cell',
        args: {
          content: 'df = pd.read_csv(path)', // initial naive attempt
          metadata: {
            trainingDraft: {
              experimentId,
              segments: [
                { content: 'import pandas as pd' },
                { content: 'df = pd.read_csv(path)' },
                { content: 'model.fit(X, y)' },
              ],
            },
          },
        },
        result: { output: { cellId: 'prep-cell' } },
      },
      {
        tool: 'write_cell',
        args: {
          cellId: 'prep-cell',
          content: "df = pd.read_csv(path, on_bad_lines='skip', engine='python')",
          metadata: { trainingDraft: { experimentId, segments: [] } },
        },
      },
      {
        tool: 'write_cell',
        args: {
          content: 'model.fit(X, y)', // STOP — fit pattern
          metadata: { trainingDraft: { experimentId, segments: [] } },
        },
      },
    ];

    expect(extractWorkflowPrepSegmentsFromToolCalls(toolCalls, experimentId)).toEqual([
      'import pandas as pd',
      "df = pd.read_csv(path, on_bad_lines='skip', engine='python')",
    ]);
  });

  it('filters by experimentId so concurrent experiments do not leak into each other', () => {
    const toolCalls = [
      {
        tool: 'write_cell',
        args: {
          content: 'wrong experiment body',
          metadata: { trainingDraft: { experimentId: 'other-exp', segments: [] } },
        },
      },
      {
        tool: 'write_cell',
        args: {
          content: 'right experiment body',
          metadata: { trainingDraft: { experimentId, segments: [] } },
        },
      },
    ];
    expect(extractWorkflowPrepSegmentsFromToolCalls(toolCalls, experimentId)).toEqual([
      'right experiment body',
    ]);
  });

  it('respects the cellIds filter when provided', () => {
    const toolCalls = [
      {
        tool: 'write_cell',
        args: {
          cellId: 'keep',
          content: 'keep me',
          metadata: { trainingDraft: { experimentId, segments: [] } },
        },
      },
      {
        tool: 'write_cell',
        args: {
          cellId: 'drop',
          content: 'drop me',
          metadata: { trainingDraft: { experimentId, segments: [] } },
        },
      },
    ];
    expect(
      extractWorkflowPrepSegmentsFromToolCalls(toolCalls, experimentId, ['keep'])
    ).toEqual(['keep me']);
  });

  it('falls back to frozen segments when no tool call carries args.content', () => {
    // Backward compatibility — older persisted history rows only carry the
    // metadata.trainingDraft.segments snapshot, not per-call args.content.
    const toolCalls = [
      {
        args: {
          metadata: {
            trainingDraft: {
              experimentId,
              segments: [
                { content: 'legacy import' },
                { content: 'legacy prep' },
                { content: 'pipeline.fit(X, y)' }, // STOP
              ],
            },
          },
        },
      },
    ];
    expect(extractWorkflowPrepSegmentsFromToolCalls(toolCalls, experimentId)).toEqual([
      'legacy import',
      'legacy prep',
    ]);
  });

  it('stops before the first live-content segment that crosses a STOP pattern', () => {
    const toolCalls = [
      {
        tool: 'write_cell',
        args: {
          content: 'import joblib',
          metadata: { trainingDraft: { experimentId, segments: [] } },
        },
      },
      {
        tool: 'write_cell',
        args: {
          content: 'df = load()',
          metadata: { trainingDraft: { experimentId, segments: [] } },
        },
      },
      {
        tool: 'write_cell',
        args: {
          content: 'clf.fit(X, y)', // STOP
          metadata: { trainingDraft: { experimentId, segments: [] } },
        },
      },
      {
        tool: 'write_cell',
        args: {
          content: 'joblib.dump(clf, "m.joblib")', // ignored — we already stopped
          metadata: { trainingDraft: { experimentId, segments: [] } },
        },
      },
    ];
    expect(extractWorkflowPrepSegmentsFromToolCalls(toolCalls, experimentId)).toEqual([
      'import joblib',
      'df = load()',
    ]);
  });

  it('returns an empty array when no matching experiment is present', () => {
    expect(extractWorkflowPrepSegmentsFromToolCalls([], experimentId)).toEqual([]);
    expect(extractWorkflowPrepSegmentsFromToolCalls(null, experimentId)).toEqual([]);
    expect(extractWorkflowPrepSegmentsFromToolCalls(undefined, experimentId)).toEqual([]);
  });
});
