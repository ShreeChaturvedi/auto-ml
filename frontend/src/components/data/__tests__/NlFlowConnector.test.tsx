import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NlFlowConnector } from '../NlFlowConnector';

describe('NlFlowConnector', () => {
  it('renders an SVG element', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders two path elements (base + particle)', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);
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

  it('particle path is visible (opacity 1) in active state', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    const paths = container.querySelectorAll('path');
    // Second path is the particle
    const particle = paths[1] as SVGPathElement;
    expect(particle.style.opacity).toBe('1');
  });

  it('particle path is hidden (opacity 0) in settled state', () => {
    const { container } = render(<NlFlowConnector state="settled" />);
    const paths = container.querySelectorAll('path');
    const particle = paths[1] as SVGPathElement;
    expect(particle.style.opacity).toBe('0');
  });

  it('base path has reduced opacity in settled state', () => {
    const { container } = render(<NlFlowConnector state="settled" />);
    const paths = container.querySelectorAll('path');
    const base = paths[0] as SVGPathElement;
    // settled state dims the base to 0.4
    expect(base.style.opacity).toBe('0.4');
  });

  it('base path has full opacity in active state', () => {
    const { container } = render(<NlFlowConnector state="active" />);
    const paths = container.querySelectorAll('path');
    const base = paths[0] as SVGPathElement;
    expect(base.style.opacity).toBe('1');
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
});
