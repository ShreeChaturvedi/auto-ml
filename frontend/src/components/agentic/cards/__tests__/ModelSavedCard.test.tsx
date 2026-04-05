import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ModelSavedCard } from '../ModelSavedCard';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderCard(props: Partial<React.ComponentProps<typeof ModelSavedCard>> = {}) {
  const fullProps: React.ComponentProps<typeof ModelSavedCard> = {
    projectId: 'project-1',
    modelId: 'model-abc',
    modelName: 'Ridge Baseline',
    modelType: 'ridge',
    taskType: 'regression',
    metrics: { rmse: 0.4321, mae: 0.1234, r2: 0.8765 },
    artifactSize: 2048,
    ...props
  };

  return render(
    <MemoryRouter initialEntries={['/project/project-1/training']}>
      <Routes>
        <Route
          path="/project/:projectId/*"
          element={
            <>
              <ModelSavedCard {...fullProps} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ModelSavedCard', () => {
  it('renders model name, type, task-type badge, and metric badges', () => {
    renderCard();

    expect(screen.getByText(/Ridge Baseline/)).toBeInTheDocument();
    expect(screen.getByText('regression')).toBeInTheDocument();
    expect(screen.getByText('ridge')).toBeInTheDocument();
    expect(screen.getByText(/rmse: 0\.4321/)).toBeInTheDocument();
    expect(screen.getByText(/r2: 0\.8765/)).toBeInTheDocument();
  });

  it('formats artifact size in the most readable unit', () => {
    const { rerender } = renderCard({ artifactSize: 512 });
    expect(screen.getByText('512 B')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ModelSavedCard
          projectId="p"
          modelId="m"
          modelName="x"
          modelType="ridge"
          taskType="regression"
          metrics={undefined}
          artifactSize={2.5 * 1024 * 1024}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('2.5 MB')).toBeInTheDocument();
  });

  it('orders regression metrics with RMSE → MAE → R² first', () => {
    renderCard({
      metrics: { some_obscure_metric: 0.1, r2: 0.9, rmse: 0.3, mae: 0.2 }
    });

    const badges = screen.getAllByText(/^(rmse|mae|r2|some_obscure_metric):/);
    expect(badges.map((b) => b.textContent)).toEqual([
      expect.stringContaining('rmse'),
      expect.stringContaining('mae'),
      expect.stringContaining('r2'),
      expect.stringContaining('some_obscure_metric')
    ]);
  });

  it('orders classification metrics with accuracy → f1 → precision → recall first', () => {
    renderCard({
      taskType: 'classification',
      modelType: 'random_forest',
      metrics: { custom_metric: 0.5, recall: 0.9, f1: 0.85, precision: 0.87, accuracy: 0.92 }
    });

    const badges = screen.getAllByText(/^(accuracy|f1|precision|recall|custom_metric):/);
    expect(badges[0].textContent).toContain('accuracy');
    expect(badges[1].textContent).toContain('f1');
    expect(badges[2].textContent).toContain('precision');
    expect(badges[3].textContent).toContain('recall');
  });

  it('navigates to /project/:id/experiments?model={modelId} when Open in Experiments is clicked', async () => {
    const user = userEvent.setup();
    renderCard();

    const button = screen.getByRole('button', { name: /Open in Experiments/i });
    expect(button).toBeEnabled();
    await user.click(button);

    expect(screen.getByTestId('location').textContent).toBe('/project/project-1/experiments?model=model-abc');
  });

  it('disables the Open in Experiments button for clustering task type', () => {
    renderCard({
      taskType: 'clustering',
      modelType: 'kmeans',
      metrics: { silhouette: 0.42 }
    });

    const button = screen.getByRole('button', { name: /Open in Experiments/i });
    expect(button).toBeDisabled();
  });

  it('disables the button when modelId is undefined (defensive)', () => {
    renderCard({ modelId: undefined });

    const button = screen.getByRole('button', { name: /Open in Experiments/i });
    expect(button).toBeDisabled();
  });

  it('does not navigate when disabled button is clicked', async () => {
    const user = userEvent.setup();
    renderCard({ taskType: 'clustering', modelId: 'm-cluster' });

    const button = screen.getByRole('button', { name: /Open in Experiments/i });
    // Disabled buttons shouldn't fire onClick, but the component also guards
    // in its handler. Verify both.
    await user.click(button).catch(() => undefined);

    expect(screen.getByTestId('location').textContent).toBe('/project/project-1/training');
  });

  it('skips metric rendering when metrics dict is empty or undefined', () => {
    renderCard({ metrics: undefined });
    // The modelType and taskType badges should still be there, but no metric pills.
    expect(screen.getByText('ridge')).toBeInTheDocument();
    expect(screen.queryByText(/rmse:/)).not.toBeInTheDocument();
  });

  it('skips non-finite metric values (NaN, Infinity) to avoid "NaN" pills', () => {
    renderCard({
      metrics: { rmse: 0.4, mae: Number.NaN, r2: Number.POSITIVE_INFINITY, mape: 12.5 }
    });

    expect(screen.getByText(/rmse: 0\.4000/)).toBeInTheDocument();
    expect(screen.getByText(/mape:/)).toBeInTheDocument();
    expect(screen.queryByText(/mae:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/r2:/)).not.toBeInTheDocument();
  });
});
