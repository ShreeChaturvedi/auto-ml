import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppPreviewFrame from '@/components/AppPreviewFrame';
import { usePreviewStore } from '@/preview/previewStore';

describe('AppPreviewFrame integration', () => {
  beforeEach(() => {
    usePreviewStore.setState(usePreviewStore.getInitialState());
  });

  it('renders the preview frame with landing-grain + cursor-outline classes', () => {
    const { container } = render(<AppPreviewFrame />);
    const frame = container.querySelector('[aria-label^="Interactive Agentic AutoML"]');
    expect(frame).toBeInTheDocument();
    expect(frame?.className).toMatch(/cursor-outline/);
  });

  it('displays the default Data Viewer tab content', () => {
    render(<AppPreviewFrame />);
    expect(screen.getByText(/which customers churned in Q2/i)).toBeInTheDocument();
  });

  it('tab switching works via sidebar click', () => {
    render(<AppPreviewFrame />);
    fireEvent.click(screen.getByRole('tab', { name: /experiments/i }));
    expect(screen.getByText(/4 MODELS · SORTED BY F1/i)).toBeInTheDocument();
  });
});
