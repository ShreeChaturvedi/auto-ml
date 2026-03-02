import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SqlRevealBlock } from '../SqlRevealBlock';

const SAMPLE_SQL = 'SELECT id, name FROM users WHERE active = true;';
const SAMPLE_RATIONALE = 'Fetches all active users with their identifiers.';

function buildProps(overrides: Partial<Parameters<typeof SqlRevealBlock>[0]> = {}) {
  return {
    sql: SAMPLE_SQL,
    rationale: undefined,
    isRevealing: false,
    visibleText: '',
    isRevealComplete: false,
    editedSql: SAMPLE_SQL,
    onSqlChange: vi.fn(),
    originalSql: SAMPLE_SQL,
    ...overrides,
  };
}

describe('SqlRevealBlock', () => {
  describe('shimmer / pre-reveal placeholder', () => {
    it('shows a shimmer placeholder when nothing is set and sql is empty', () => {
      render(<SqlRevealBlock {...buildProps({ sql: '', editedSql: '', originalSql: '' })} />);
      expect(screen.getByLabelText(/generating sql/i)).toBeInTheDocument();
    });
  });

  describe('typewriter (revealing) phase', () => {
    it('renders a <pre> element while revealing', () => {
      const { container } = render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: true,
            visibleText: 'SELECT id',
            isRevealComplete: false,
          })}
        />
      );
      expect(container.querySelector('pre')).toBeInTheDocument();
    });

    it('shows the current visibleText in the pre element', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: true,
            visibleText: 'SELECT id FROM',
            isRevealComplete: false,
          })}
        />
      );
      expect(screen.getByLabelText(/being typed/i)).toHaveTextContent('SELECT id FROM');
    });

    it('adds nl-typewriter-cursor class while revealing', () => {
      const { container } = render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: true,
            visibleText: 'SELECT',
            isRevealComplete: false,
          })}
        />
      );
      expect(container.querySelector('pre')).toHaveClass('nl-typewriter-cursor');
    });

    it('does NOT add nl-typewriter-cursor class when not actively revealing', () => {
      const { container } = render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: false,
            visibleText: 'SELECT',
            isRevealComplete: false,
          })}
        />
      );
      const pre = container.querySelector('pre');
      if (pre) {
        expect(pre).not.toHaveClass('nl-typewriter-cursor');
      }
    });
  });

  describe('review (editing) phase', () => {
    it('renders a textarea when reveal is complete', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: false,
            isRevealComplete: true,
            editedSql: SAMPLE_SQL,
          })}
        />
      );
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('does NOT render a <pre> in review phase', () => {
      const { container } = render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: false,
            isRevealComplete: true,
            editedSql: SAMPLE_SQL,
          })}
        />
      );
      expect(container.querySelector('pre')).not.toBeInTheDocument();
    });

    it('textarea shows the editedSql value', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealComplete: true,
            editedSql: 'SELECT * FROM orders;',
          })}
        />
      );
      expect(screen.getByRole('textbox')).toHaveValue('SELECT * FROM orders;');
    });

    it('calls onSqlChange when the textarea content changes', () => {
      const onSqlChange = vi.fn();
      render(
        <SqlRevealBlock
          {...buildProps({ isRevealComplete: true, onSqlChange })}
        />
      );
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'SELECT 1;' } });
      expect(onSqlChange).toHaveBeenCalledWith('SELECT 1;');
    });

    it('shows Reset button when editedSql differs from originalSql', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealComplete: true,
            editedSql: 'SELECT 1;',
            originalSql: SAMPLE_SQL,
          })}
        />
      );
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    });

    it('does NOT show Reset button when editedSql equals originalSql', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealComplete: true,
            editedSql: SAMPLE_SQL,
            originalSql: SAMPLE_SQL,
          })}
        />
      );
      expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
    });

    it('clicking Reset calls onSqlChange with the originalSql', () => {
      const onSqlChange = vi.fn();
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealComplete: true,
            editedSql: 'SELECT 1;',
            originalSql: SAMPLE_SQL,
            onSqlChange,
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /reset/i }));
      expect(onSqlChange).toHaveBeenCalledWith(SAMPLE_SQL);
    });
  });

  describe('rationale paragraph', () => {
    it('shows rationale text once reveal is complete', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealComplete: true,
            rationale: SAMPLE_RATIONALE,
          })}
        />
      );
      expect(screen.getByText(SAMPLE_RATIONALE)).toBeInTheDocument();
    });

    it('does NOT show rationale while still revealing', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: true,
            visibleText: 'SELECT',
            isRevealComplete: false,
            rationale: SAMPLE_RATIONALE,
          })}
        />
      );
      expect(screen.queryByText(SAMPLE_RATIONALE)).not.toBeInTheDocument();
    });

    it('does NOT show rationale when undefined', () => {
      const { container } = render(
        <SqlRevealBlock
          {...buildProps({ isRevealComplete: true, rationale: undefined })}
        />
      );
      expect(container.querySelector('p')).not.toBeInTheDocument();
    });
  });
});
