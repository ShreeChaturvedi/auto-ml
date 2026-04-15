import { describe, expect, it } from 'vitest';

import { findKnownMentionMatches } from '@/components/llm/mentionTokens';

describe('mentionTokens', () => {
  it('matches exact known mentions with spaces without swallowing trailing words', () => {
    const matches = findKnownMentionMatches(
      'Ask @Quarterly Report.csv now and @summary.csv later',
      new Set(['quarterly report.csv', 'summary.csv'])
    );

    expect(matches.map((match) => match.name)).toEqual([
      'Quarterly Report.csv',
      'summary.csv',
    ]);
    expect(matches.map((match) => match.raw)).toEqual([
      '@Quarterly Report.csv',
      '@summary.csv',
    ]);
  });
});
