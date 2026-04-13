import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HowItWorks from './HowItWorks';
import { PHASE_SCENES } from './scenes';

describe('HowItWorks (reduced-motion fallback)', () => {
  beforeEach(() => {
    // Force reduced motion so the component renders the accessible
    // stacked <ol><li> fallback (easier to assert on than the pinned
    // scrollytelling which depends on GSAP + ScrollTrigger).
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it('renders all 7 phase codes in the fallback list', () => {
    render(<HowItWorks />);
    expect(screen.getByText('1.0 INGEST')).toBeInTheDocument();
    expect(screen.getByText('2.0 EXPLORE')).toBeInTheDocument();
    expect(screen.getByText('3.0 PREPROCESS')).toBeInTheDocument();
    expect(screen.getByText('4.0 ENGINEER')).toBeInTheDocument();
    expect(screen.getByText('5.0 TRAIN')).toBeInTheDocument();
    expect(screen.getByText('6.0 EXPERIMENTS')).toBeInTheDocument();
    expect(screen.getByText('7.0 DEPLOY')).toBeInTheDocument();
  });

  it('renders all 7 bright headlines', () => {
    render(<HowItWorks />);
    expect(screen.getByText(/Upload your data\./)).toBeInTheDocument();
    expect(screen.getByText(/Ask in English\./)).toBeInTheDocument();
    expect(screen.getByText(/Fix your data without/)).toBeInTheDocument();
    expect(screen.getByText(/Derive features automatically\./)).toBeInTheDocument();
    expect(screen.getByText(/Train models in parallel\./)).toBeInTheDocument();
    expect(screen.getByText(/Every run, ranked and explained\./)).toBeInTheDocument();
    expect(screen.getByText(/Ship to an endpoint in one click\./)).toBeInTheDocument();
  });

  it('renders intro heading as an <h2>', () => {
    render(<HowItWorks />);
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2).toHaveTextContent(/From raw data to a deployed model/i);
    expect(h2).toHaveAttribute('id', 'how-it-works-heading');
  });

  it('renders 7 <h3> phase headlines', () => {
    render(<HowItWorks />);
    const h3s = screen.getAllByRole('heading', { level: 3 });
    expect(h3s).toHaveLength(PHASE_SCENES.length);
  });

  it('renders an ordered list with 7 list items (stacked, not pinned)', () => {
    const { container } = render(<HowItWorks />);
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    const items = container.querySelectorAll('ol > li');
    expect(items).toHaveLength(PHASE_SCENES.length);
  });

  it('does not render pinned scroll scaffolding (no progressbar, no tabs)', () => {
    render(<HowItWorks />);
    // Reduced-motion branch must not expose the pinned TOC tabs or the
    // GSAP progressbar — those only belong to the animated path.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('exposes the section with a labelled region', () => {
    const { container } = render(<HowItWorks />);
    const section = container.querySelector('section#how-it-works');
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute('aria-labelledby', 'how-it-works-heading');
  });
});
