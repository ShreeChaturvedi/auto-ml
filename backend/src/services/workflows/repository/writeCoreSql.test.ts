import { describe, expect, it } from 'vitest';

import { buildArtifactUpsertSql } from './writeCoreSql.js';

describe('writeCoreSql', () => {
  it('generates canonical artifact upsert with correct values', () => {
    const statement = buildArtifactUpsertSql({
      artifactId: 'artifact-1',
      runId: 'run-1',
      artifactType: 'summary',
      label: 'preprocessing-summary',
      payload: { message: 'done' }
    }, '2026-03-13T00:00:00.000Z');

    expect(statement.text).toContain('INSERT INTO workflow_artifacts');
    expect(statement.text).toContain('artifact_type');
    expect(statement.values[0]).toBe('artifact-1');
    expect(statement.values[1]).toBe('run-1');
    expect(statement.values[2]).toBe('summary');
    expect(statement.values[3]).toBe('preprocessing-summary');
    expect(statement.values[4]).toBe('{"message":"done"}');
    expect(statement.values[5]).toBe('2026-03-13T00:00:00.000Z');
    expect(statement.values[6]).toBe('2026-03-13T00:00:00.000Z');
  });
});
