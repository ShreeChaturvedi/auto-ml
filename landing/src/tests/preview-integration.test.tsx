import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppPreviewFrame from '@/components/AppPreviewFrame';

describe('AppPreviewFrame integration', () => {
  it('renders the preview frame with landing-grain + cursor-outline classes', () => {
    const { container } = render(<AppPreviewFrame />);
    const frame = container.querySelector('[aria-label^="Interactive Agentic AutoML"]');
    expect(frame).toBeInTheDocument();
    expect(frame?.className).toMatch(/cursor-outline/);
  });

  it('shows a client-side loading shell before the demo workspace resolves', () => {
    render(<AppPreviewFrame />);
    expect(screen.getByTestId('landing-demo-loading')).toBeInTheDocument();
  });
});
