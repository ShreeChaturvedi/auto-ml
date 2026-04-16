import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EvaluationResult } from '@/types/experiments';

import { PlotsTab } from '../tabs/PlotsTab';

describe('PlotsTab', () => {
  it('renders clustering summaries when clustering evaluation data is available', () => {
    const evaluation: EvaluationResult = {
      taskType: 'clustering',
      timestamp: '2026-04-16T00:00:00.000Z',
      computeMs: 321,
      clustering_metrics: {
        n_clusters: 3,
        silhouette: 0.412,
        davies_bouldin: 0.88,
        calinski_harabasz: 211.4,
        cluster_sizes: {
          '0': 12,
          '1': 18,
          '2': 9,
        },
      },
    };

    render(<PlotsTab evaluation={evaluation} />);

    expect(screen.getByText('Cluster Summary')).toBeInTheDocument();
    expect(screen.getByText('Cluster Sizes')).toBeInTheDocument();
    expect(screen.getByText('Silhouette')).toBeInTheDocument();
    expect(screen.getByText('0.412')).toBeInTheDocument();
    expect(screen.getByText('Cluster 1')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });
});
