import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ComputeAnimationSvg } from '../ComputeAnimationSvg';
import type { ProcessingResult } from '@/types/processing';

const files = [
  { name: 'orders.csv', type: 'csv' },
  { name: 'events.json', type: 'json' },
  { name: 'summary.pdf', type: 'pdf' },
  { name: 'inventory.xlsx', type: 'xlsx' },
  { name: 'users.csv', type: 'csv' },
  { name: 'metrics.json', type: 'json' },
  { name: 'ignored.parquet', type: 'parquet' },
];

const results: ProcessingResult[] = [
  {
    type: 'dataset_stats',
    icon: 'A1',
    label: '2,847 rows x 14 columns',
    detail: 'Ready for analysis',
  },
];

describe('ComputeAnimationSvg', () => {
  it('caps rendered file cards at six and keeps reduced-motion styles scoped by uid', () => {
    const { container } = render(
      <ComputeAnimationSvg
        uid="test-uid"
        files={files}
        results={results}
        isComplete={false}
        visibleFiles={6}
        visibleResults={1}
      />
    );

    expect(screen.getByText('orders.csv')).toBeInTheDocument();
    expect(screen.getByText('metrics.json')).toBeInTheDocument();
    expect(screen.queryByText('ignored.parquet')).not.toBeInTheDocument();
    expect(screen.getByText('Analyzing your data…')).toBeInTheDocument();

    const styleElement = container.querySelector('style');
    expect(styleElement?.textContent).toContain('.ca-anim-test-uid *');
    expect(styleElement?.textContent).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styleElement?.textContent).toContain('animation-duration: 0.01ms !important;');
  });

  it('renders the settled completion state and preserves short text result icons', () => {
    const { container } = render(
      <ComputeAnimationSvg
        uid="done-uid"
        files={files.slice(0, 1)}
        results={results}
        isComplete
        visibleFiles={1}
        visibleResults={1}
      />
    );

    expect(screen.getByText('Analysis complete')).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('Ready for analysis')).toBeInTheDocument();
    expect(container.querySelector('.ca-core-done-uid.settled')).not.toBeNull();
  });
});
