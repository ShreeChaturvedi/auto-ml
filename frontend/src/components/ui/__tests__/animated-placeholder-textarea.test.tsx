import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedPlaceholderTextarea } from '../animated-placeholder-textarea';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    return window.setTimeout(() => callback(performance.now()), 0);
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    window.clearTimeout(id);
  });
});

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AnimatedPlaceholderTextarea', () => {
  it('renders a textarea element', () => {
    render(
      <AnimatedPlaceholderTextarea
        placeholders={['First placeholder', 'Second placeholder']}
        value=""
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows the first placeholder when value is empty', () => {
    const { container } = render(
      <AnimatedPlaceholderTextarea
        placeholders={['Type something here', 'Another placeholder']}
        value=""
        onChange={() => {}}
      />
    );

    expect(container.textContent).toContain('Type something here');
  });

  it('hides all placeholder overlays when textarea has a value', () => {
    render(
      <AnimatedPlaceholderTextarea
        placeholders={['Hidden placeholder']}
        value="user typed text"
        onChange={() => {}}
      />
    );
    // The overlay div should not be rendered when there is a value
    expect(screen.queryByText('Hidden placeholder')).not.toBeInTheDocument();
  });

  it('forwards ref to the underlying textarea element', () => {
    const ref = { current: null as HTMLTextAreaElement | null };
    render(
      <AnimatedPlaceholderTextarea
        placeholders={['placeholder']}
        value=""
        onChange={() => {}}
        ref={ref}
      />
    );
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('passes additional props down to the textarea', () => {
    render(
      <AnimatedPlaceholderTextarea
        placeholders={['placeholder']}
        value=""
        onChange={() => {}}
        aria-label="My custom textarea"
        data-testid="custom-textarea"
      />
    );
    expect(screen.getByTestId('custom-textarea')).toHaveAttribute(
      'aria-label',
      'My custom textarea'
    );
  });

  it('renders with a single placeholder without crashing', () => {
    const { container } = render(
      <AnimatedPlaceholderTextarea
        placeholders={['Only one']}
        value=""
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(container.textContent).toContain('Only one');
  });

  it('renders with an empty placeholder list without crashing', () => {
    render(
      <AnimatedPlaceholderTextarea
        placeholders={[]}
        value=""
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('applies extra className to the textarea', () => {
    render(
      <AnimatedPlaceholderTextarea
        placeholders={['p']}
        value=""
        onChange={() => {}}
        className="custom-class"
        data-testid="ta"
      />
    );
    expect(screen.getByTestId('ta')).toHaveClass('custom-class');
  });

  it('disables the textarea when disabled prop is set', () => {
    render(
      <AnimatedPlaceholderTextarea
        placeholders={['p']}
        value=""
        onChange={() => {}}
        disabled
        data-testid="ta"
      />
    );
    expect(screen.getByTestId('ta')).toBeDisabled();
  });

  it('shows an overlay caret while focused with an empty value', () => {
    render(
      <AnimatedPlaceholderTextarea
        placeholders={['Type something here', 'Another placeholder']}
        value=""
        onChange={() => {}}
      />
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.focus(textarea);

    expect(document.querySelector('[data-placeholder-cursor="true"]')).toBeInTheDocument();
    expect(textarea.style.caretColor).toBe('transparent');
  });

  it('hides the overlay caret after blur', () => {
    render(
      <AnimatedPlaceholderTextarea
        placeholders={['Type something here', 'Another placeholder']}
        value=""
        onChange={() => {}}
      />
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.focus(textarea);
    fireEvent.blur(textarea);

    expect(document.querySelector('[data-placeholder-cursor="true"]')).not.toBeInTheDocument();
    expect(textarea.style.caretColor).toBe('');
  });
});
