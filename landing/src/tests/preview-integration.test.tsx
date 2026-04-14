import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppPreviewFrame from '@/components/AppPreviewFrame';

describe('AppPreviewFrame integration', () => {
  it('renders the preview frame wrapper with aria-label', () => {
    const { container } = render(<AppPreviewFrame />);
    const frame = container.querySelector('[aria-label^="Interactive Agentic AutoML"]');
    expect(frame).toBeInTheDocument();
  });

  it('shows a client-side loading shell before the demo workspace resolves', () => {
    render(<AppPreviewFrame />);
    expect(screen.getByTestId('landing-demo-loading')).toBeInTheDocument();
  });
});
