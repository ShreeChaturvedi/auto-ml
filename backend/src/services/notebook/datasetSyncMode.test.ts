import { describe, expect, it } from 'vitest';

import {
  parseDatasetSyncMode,
  resolveDatasetSyncMode,
  shouldOverwriteDatasetWorkspace
} from './datasetSyncMode.js';

describe('datasetSyncMode', () => {
  it('parses continue mode from preprocessing metadata', () => {
    const mode = parseDatasetSyncMode({
      preprocessing: {
        datasetContinuityMode: 'continue'
      }
    });

    expect(mode).toBe('continue');
  });

  it('parses restart mode from preprocessing metadata', () => {
    const mode = parseDatasetSyncMode({
      preprocessing: {
        datasetContinuityMode: 'restart_from_original'
      }
    });

    expect(mode).toBe('restart_from_original');
  });

  it('defaults to continue when metadata mode is absent', () => {
    const mode = resolveDatasetSyncMode(undefined, {});
    expect(mode).toBe('continue');
  });

  it('prefers explicit options mode over metadata', () => {
    const mode = resolveDatasetSyncMode('restart_from_original', {
      preprocessing: {
        datasetContinuityMode: 'continue'
      }
    });
    expect(mode).toBe('restart_from_original');
  });

  it('overwrites workspace datasets only in restart mode', () => {
    expect(shouldOverwriteDatasetWorkspace('continue')).toBe(false);
    expect(shouldOverwriteDatasetWorkspace('restart_from_original')).toBe(true);
  });
});

