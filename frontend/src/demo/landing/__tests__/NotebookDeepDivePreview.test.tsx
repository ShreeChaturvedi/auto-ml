import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { NotebookDeepDivePreview } from '../NotebookDeepDivePreview';

describe('NotebookDeepDivePreview', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
  });

  it('scopes the app blue syntax palette to the preview while keeping plain identifiers readable', () => {
    const { container } = render(<NotebookDeepDivePreview />);
    const root = container.firstElementChild as HTMLDivElement;

    expect(root.style.getPropertyValue('--syn-keyword')).not.toBe('');
    expect(root.style.getPropertyValue('--syn-string')).not.toBe('');

    expect(screen.getByText('import').getAttribute('style')).toContain('color: hsl(var(--syn-keyword))');
    expect(screen.getByText('read_csv').getAttribute('style')).toContain('color: hsl(var(--syn-function))');

    expect(screen.getByText('pandas').getAttribute('style')).toBeNull();
    expect(screen.getAllByText('summary')[0].getAttribute('style')).toBeNull();
  });

  it('shows a more polished exploratory python snippet in the demo cell', () => {
    render(<NotebookDeepDivePreview />);

    expect(
      screen.getByText((_, element) => (
        element?.textContent === 'metrics = ["mrr_usd", "avg_session_minutes", "api_calls"]'
      )),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => (
        element?.textContent === 'summary = df[metrics].describe().rename_axis("stat").reset_index()'
      )),
    ).toBeInTheDocument();
  });
});
