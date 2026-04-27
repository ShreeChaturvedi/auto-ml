import { describe, expect, it } from 'vitest';

import { fileTypeFromFilename } from '../fileUtils';

describe('fileTypeFromFilename', () => {
  it('classifies .tsv as csv', () => {
    expect(fileTypeFromFilename('orders.tsv')).toBe('csv');
  });

  it('classifies .jsonl as json', () => {
    expect(fileTypeFromFilename('events.jsonl')).toBe('json');
  });

  it('classifies .ndjson as json', () => {
    expect(fileTypeFromFilename('events.ndjson')).toBe('json');
  });
});
