import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SqlRevealBlock } from '../SqlRevealBlock';
import { tokenizeSql } from '../sqlTokenize';

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({
    theme: 'light'
  })
}));

vi.mock('@/hooks/useProjectThemeColor', () => ({
  useProjectThemeColor: () => ({ themeColor: undefined, hue: 220, syntaxThemeId: 'static-light' })
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange
  }: {
    value: string;
    onChange?: (value: string) => void;
  }) => (
    <textarea
      data-testid="mock-monaco-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}));

const SAMPLE_SQL = 'SELECT id, name FROM users WHERE active = true;';

function buildProps(overrides: Partial<Parameters<typeof SqlRevealBlock>[0]> = {}) {
  return {
    sql: SAMPLE_SQL,
    isRevealing: false,
    visibleTokenCount: 0,
    isRevealComplete: false,
    editedSql: SAMPLE_SQL,
    onSqlChange: vi.fn(),
    originalSql: SAMPLE_SQL,
    ...overrides,
  };
}

describe('SqlRevealBlock', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  describe('tokenization + syntax highlighting', () => {
    it('classifies common SQL token types', () => {
      const tokens = tokenizeSql("SELECT COUNT(id), 'x' FROM users WHERE score >= 10;");
      expect(tokens.some((t) => t.type === 'keyword' && t.text.toUpperCase() === 'SELECT')).toBe(true);
      expect(tokens.some((t) => t.type === 'function' && t.text.toUpperCase() === 'COUNT')).toBe(true);
      expect(tokens.some((t) => t.type === 'string' && t.text === "'x'")).toBe(true);
      expect(tokens.some((t) => t.type === 'number' && t.text === '10')).toBe(true);
      expect(tokens.some((t) => t.type === 'operator' && t.text === '>=')).toBe(true);
      expect(tokens.some((t) => t.type === 'punctuation' && t.text === ';')).toBe(true);
    });

    it('applies sql-tk-* classes during revealing', () => {
      const { container } = render(
        <SqlRevealBlock
          {...buildProps({
            sql: "SELECT COUNT(id) FROM users WHERE score >= 10;",
            isRevealing: true,
            visibleTokenCount: 30,
          })}
        />
      );

      expect(container.querySelector('.sql-tk-kw')).toBeInTheDocument();
      expect(container.querySelector('.sql-tk-fn')).toBeInTheDocument();
      expect(container.querySelector('.sql-tk-num')).toBeInTheDocument();
      expect(container.querySelector('.sql-tk-op')).toBeInTheDocument();
      expect(container.querySelector('.sql-tk-punc')).toBeInTheDocument();
    });
  });

  describe('shimmer / pre-reveal placeholder', () => {
    it('shows a shimmer placeholder when nothing is set and sql is empty', () => {
      render(<SqlRevealBlock {...buildProps({ sql: '', editedSql: '', originalSql: '' })} />);
      expect(screen.getByLabelText(/generating sql/i)).toBeInTheDocument();
    });
  });

  describe('typewriter (revealing) phase', () => {
    it('uses an opaque reveal surface with no blur overlay classes', () => {
      const { container } = render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: true,
            visibleTokenCount: 6,
            isRevealComplete: false,
          })}
        />
      );
      const pre = container.querySelector('pre');
      expect(pre).toBeInTheDocument();
      expect(pre).not.toHaveClass('backdrop-blur-[1px]');
      expect(pre).not.toHaveClass('bg-background/96');
    });

    it('does not mount Monaco editor during reveal phase', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: true,
            visibleTokenCount: 3,
            isRevealComplete: false,
          })}
        />
      );
      expect(screen.queryByTestId('mock-monaco-editor')).not.toBeInTheDocument();
    });

    it('renders a <pre> element while revealing', () => {
      const { container } = render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: true,
            visibleTokenCount: 3,
            isRevealComplete: false,
          })}
        />
      );
      expect(container.querySelector('pre')).toBeInTheDocument();
    });

    it('shows tokens up to visibleTokenCount in the pre element', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: true,
            visibleTokenCount: 5,
            isRevealComplete: false,
          })}
        />
      );
      expect(screen.getByLabelText(/being typed/i)).toHaveTextContent('SELECT id,');
    });

    it('adds nl-typewriter-cursor class while revealing', () => {
      const { container } = render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: true,
            visibleTokenCount: 1,
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
            visibleTokenCount: 1,
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
    it('renders Monaco editor when reveal is complete', async () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealing: false,
            isRevealComplete: true,
            editedSql: SAMPLE_SQL,
          })}
        />
      );
      await waitFor(() => {
        expect(screen.getByTestId('mock-monaco-editor')).toBeInTheDocument();
      });
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

    it('editor shows the editedSql value', async () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealComplete: true,
            editedSql: 'SELECT * FROM orders;',
          })}
        />
      );
      await waitFor(() => {
        expect(screen.getByTestId('mock-monaco-editor')).toHaveValue('SELECT * FROM orders;');
      });
    });

    it('calls onSqlChange when the editor content changes', async () => {
      const onSqlChange = vi.fn();
      render(
        <SqlRevealBlock
          {...buildProps({ isRevealComplete: true, onSqlChange })}
        />
      );
      const editor = await screen.findByTestId('mock-monaco-editor');
      fireEvent.change(editor, { target: { value: 'SELECT 1;' } });
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

  describe('initial execution error', () => {
    it('does not show initial execution error before review phase', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealComplete: false,
            isRevealing: true,
            queryExecutionError: 'relation "usersx" does not exist',
          })}
        />
      );

      expect(screen.queryByText(/initial execution failed/i)).not.toBeInTheDocument();
    });

    it('shows initial execution error in review phase', () => {
      render(
        <SqlRevealBlock
          {...buildProps({
            isRevealComplete: true,
            queryExecutionError: 'relation "usersx" does not exist',
          })}
        />
      );

      expect(screen.getByText(/initial execution failed/i)).toBeInTheDocument();
      expect(screen.getByText(/usersx/)).toBeInTheDocument();
    });
  });
});
