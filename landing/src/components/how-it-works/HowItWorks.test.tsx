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
    const fallbackOl = container.querySelector('ol');
    expect(fallbackOl).not.toBeNull();
    // Some mocks have their own inner <ol> (plan preview, deploy stages), so
    // descendant `ol > li` over-counts. Scope to direct children of the
    // outermost fallback list only.
    const directItems = Array.from(fallbackOl?.children ?? []).filter(
      (el) => el.tagName === 'LI',
    );
    expect(directItems).toHaveLength(PHASE_SCENES.length);
  });

  it('renders one poster-backed phase preview per fallback scene (no autoplaying videos)', () => {
    const { container } = render(<HowItWorks />);
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    const posterRoots = container.querySelectorAll('[data-preview-mode="poster"]');
    expect(posterRoots).toHaveLength(PHASE_SCENES.length);
    expect(container.querySelectorAll('video')).toHaveLength(0);
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
