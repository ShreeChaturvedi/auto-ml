import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EvalTabContent } from '../EvalTabContent';
import type { EvaluationResult } from '@/types/experiments';

const EVALUATION: EvaluationResult = {
  taskType: 'regression',
  timestamp: '2026-04-15T00:00:00.000Z',
  computeMs: 123,
  residuals: {
    y_true: [1, 2],
    y_pred: [1.1, 1.9],
    residuals: [-0.1, 0.1],
  },
  residual_histogram: {
    bin_edges: [0, 1],
    counts: [2],
  },
};

describe('EvalTabContent', () => {
  it('shows an explicit loading message while evaluation is still computing', () => {
    render(
      <EvalTabContent
        isComputing
        isFailed={false}
        evaluation={undefined}
        failedLabel="failed"
      >
        {() => <div>ready</div>}
      </EvalTabContent>,
    );

    expect(screen.getByText('Evaluation is still being prepared')).toBeInTheDocument();
    expect(
      screen.getByText('This model was just trained. Experiments is generating plots and analysis now.'),
    ).toBeInTheDocument();
  });

  it('renders evaluation children when data is available', () => {
    render(
      <EvalTabContent
        isComputing={false}
        isFailed={false}
        evaluation={EVALUATION}
        failedLabel="failed"
      >
        {(evaluation) => <div>{evaluation.taskType}</div>}
      </EvalTabContent>,
    );

    expect(screen.getByText('regression')).toBeInTheDocument();
  });
});
