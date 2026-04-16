import { describe, expect, it } from 'vitest';

import { pipInstallIndexArgs } from './pipHelpers.js';

describe('pipHelpers.pipInstallIndexArgs', () => {
  it('adds the PyTorch CPU index for torch-family requirements', () => {
    expect(pipInstallIndexArgs(['pytorch-tabular'])).toEqual([
      '--extra-index-url',
      'https://download.pytorch.org/whl/cpu',
    ]);
    expect(pipInstallIndexArgs(['torch'])).toEqual([
      '--extra-index-url',
      'https://download.pytorch.org/whl/cpu',
    ]);
  });

  it('leaves non-torch packages on the default index path', () => {
    expect(pipInstallIndexArgs(['catboost'])).toEqual([]);
  });
});
