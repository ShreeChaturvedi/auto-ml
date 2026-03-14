import { describe, expect, it } from 'vitest';

import { buildArtifactUpsertSql } from './writeCoreSql.js';

describe('writeCoreSql', () => {
  it('maps unsupported legacy artifact kinds to generic while preserving source_key', () => {
    const statement = buildArtifactUpsertSql('legacy', {
      artifactId: 'artifact-1',
      runId: 'run-1',
      artifactType: 'summary',
      label: 'preprocessing-summary',
      payload: { message: 'done' }
    }, '2026-03-13T00:00:00.000Z');

    expect(statement.values[2]).toBe('generic');
    expect(statement.values[5]).toBe('summary');
  });
});
