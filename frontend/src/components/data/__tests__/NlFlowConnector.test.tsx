import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NlFlowConnector } from '../NlFlowConnector';

describe('NlFlowConnector', () => {
  it('renders an SVG element', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders six path elements (3 branches × base + particle each)', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(6);
  });

  it('renders a linearGradient for the particle', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    const gradient = container.querySelector('linearGradient');
    expect(gradient).toBeInTheDocument();
  });

  it('injects UID-scoped keyframes via a style tag', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    const style = container.querySelector('style');
    expect(style).toBeInTheDocument();
    expect(style?.textContent).toMatch(/@keyframes nl-particle-/);
  });

  it('all particle paths are visible (opacity 1) in active state', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    const paths = container.querySelectorAll('path');
    // Particle paths are at indices 1, 3, 5 (second in each <g>)
    for (const idx of [1, 3, 5]) {
      const particle = paths[idx] as SVGPathElement;
      expect(particle.style.opacity).toBe('1');
    }
  });

  it('all particle paths are hidden (opacity 0) in settled state', () => {
    const { container } = render(<NlFlowConnector state="settled" />);
    const paths = container.querySelectorAll('path');
    for (const idx of [1, 3, 5]) {
      const particle = paths[idx] as SVGPathElement;
      expect(particle.style.opacity).toBe('0');
    }
  });

  it('base paths have reduced opacity in settled state', () => {
    const { container } = render(<NlFlowConnector state="settled" />);
    const paths = container.querySelectorAll('path');
    // Base paths are at indices 0, 2, 4
    for (const idx of [0, 2, 4]) {
      const base = paths[idx] as SVGPathElement;
      // settled state dims the base to 0.4
      expect(base.style.opacity).toBe('0.4');
    }
  });

  it('base paths have full opacity in active state', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    const paths = container.querySelectorAll('path');
    for (const idx of [0, 2, 4]) {
      const base = paths[idx] as SVGPathElement;
      expect(base.style.opacity).toBe('1');
    }
  });

  it('applies custom className to the wrapper div', () => {
    const { container } = render(
      <NlFlowConnector state="active" className="extra-class" />
    );
    expect(container.firstChild).toHaveClass('extra-class');
  });

  it('marks the SVG as aria-hidden', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders unique gradient IDs across two instances', () => {
    const { container: c1 } = render(<NlFlowConnector state="active" />);
    const { container: c2 } = render(<NlFlowConnector state="active" />);
    const id1 = c1.querySelector('linearGradient')?.id;
    const id2 = c2.querySelector('linearGradient')?.id;
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('each branch particle has a staggered animation delay', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    const paths = container.querySelectorAll('path');
    const delays = [1, 3, 5].map(
      (idx) => (paths[idx] as HTMLElement).style.animationDelay
    );
    // Each branch should have a distinct delay
    expect(new Set(delays).size).toBe(3);
  });
});
