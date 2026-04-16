import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { WorkspaceDiorama } from './WorkspaceDiorama';

describe('WorkspaceDiorama', () => {
  it('renders the ingest preview loop for the upload phase without an iframe', () => {
    const { container, getByTestId } = render(
      <WorkspaceDiorama label="1.0 INGEST — real workspace preview" phase="upload" />,
    );

    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    expect(getByTestId('ingest-preview-loop')).toHaveAttribute(
      'data-preview-id',
      'ingest',
    );
  });

  it('swaps to the matching preview loop when the phase prop changes', () => {
    const { container, getByTestId, queryByTestId, rerender } = render(
      <WorkspaceDiorama label="1.0 INGEST — real workspace preview" phase="upload" />,
    );

    expect(getByTestId('ingest-preview-loop')).toBeInTheDocument();

    rerender(
      <WorkspaceDiorama
        label="6.0 EXPERIMENTS — real leaderboard workspace"
        phase="experiments"
      />,
    );

    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    expect(queryByTestId('ingest-preview-loop')).toBeNull();
    expect(getByTestId('experiments-preview-loop')).toHaveAttribute(
      'data-preview-id',
      'experiments',
    );
  });

  it('renders a preview loop for every workflow phase', () => {
    const cases: Array<[
      'upload' | 'data-viewer' | 'preprocessing' | 'feature-engineering' | 'training' | 'experiments' | 'deployment',
      string,
    ]> = [
      ['upload',              'ingest-preview-loop'],
      ['data-viewer',         'explore-preview-loop'],
      ['preprocessing',       'preprocess-preview-loop'],
      ['feature-engineering', 'engineer-preview-loop'],
      ['training',            'train-preview-loop'],
      ['experiments',         'experiments-preview-loop'],
      ['deployment',          'deploy-preview-loop'],
    ];

    for (const [phase, testId] of cases) {
      const { getByTestId, unmount } = render(
        <WorkspaceDiorama label={`${phase} scene`} phase={phase} />,
      );
      expect(getByTestId(testId)).toBeInTheDocument();
      unmount();
    }
  });
});
