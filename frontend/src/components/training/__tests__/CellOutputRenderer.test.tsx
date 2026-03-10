import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { RichOutput } from '@/lib/api/execution';
import { CellOutputRenderer } from '../CellOutputRenderer';
import { buildOutputCopyText } from '../cellOutputUtils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock parseOutputRefUrl so we control the resolved URL without depending on
// client.ts / getApiBaseUrl runtime details.
vi.mock('@/lib/api/notebooks', () => ({
  parseOutputRefUrl: (ref: string) => {
    const match = ref.match(/^outputs\/([^/]+)\/(.+)$/);
    if (!match) return ref;
    const [, cellId, filename] = match;
    return `/api/cells/${cellId}/outputs/${encodeURIComponent(filename)}`;
  },
}));

// Mock PlotlyOutput since it lazy-loads react-plotly.js which is unavailable
// in the test environment.
vi.mock('@/components/notebook/PlotlyOutput', () => ({
  PlotlyOutput: ({ data }: { data: unknown }) => (
    <div data-testid="plotly-output">{JSON.stringify(data)}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOutput(overrides: Partial<RichOutput> & { type: RichOutput['type'] }): RichOutput {
  return { content: '', ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CellOutputRenderer', () => {
  // 1. Text output
  describe('text output', () => {
    it('renders a <pre> element with the text content', () => {
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'text', content: 'Hello, world!' })]}
        />
      );

      const pre = screen.getByText('Hello, world!');
      expect(pre).toBeInTheDocument();
      expect(pre.tagName).toBe('PRE');
    });

    it('preserves whitespace in text content', () => {
      const multiline = 'line one\n  indented\n    deeper';
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'text', content: multiline })]}
        />
      );

      // getByText normalizes whitespace, so use a custom matcher for exact content
      const pre = screen.getByText((_content, element) => {
        return element?.tagName === 'PRE' && element.textContent === multiline;
      });
      expect(pre).toBeInTheDocument();
    });
  });

  // 2. Error output
  describe('error output', () => {
    it('renders error content in a red <pre> element', () => {
      const traceback = 'Traceback (most recent call last):\n  File "main.py", line 1\nValueError: oops';
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'error', content: traceback })]}
        />
      );

      const pre = screen.getByText((_content, element) => {
        return element?.tagName === 'PRE' && element.textContent === traceback;
      });
      expect(pre).toBeInTheDocument();
      expect(pre.tagName).toBe('PRE');
      expect(pre.className).toContain('text-red-400');
      // No separate "Error" label — the card's left border signals error status
      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });
  });

  // 3. Multiple outputs (same type)
  describe('multiple outputs', () => {
    it('renders all outputs in order', () => {
      render(
        <CellOutputRenderer
          outputs={[
            makeOutput({ type: 'text', content: 'first line' }),
            makeOutput({ type: 'text', content: 'second line' }),
            makeOutput({ type: 'text', content: 'third line' }),
          ]}
        />
      );

      const items = screen.getAllByText(/line$/);
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent('first line');
      expect(items[1]).toHaveTextContent('second line');
      expect(items[2]).toHaveTextContent('third line');
    });
  });

  // 4. Image output with data URL
  describe('image output with data URL', () => {
    it('renders an <img> with the data URL as src', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUh...';
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'image', content: dataUrl })]}
        />
      );

      const img = screen.getByAltText('Output') as HTMLImageElement;
      expect(img).toBeInTheDocument();
      expect(img.tagName).toBe('IMG');
      expect(img).toHaveAttribute('src', dataUrl);
    });

    it('sets lazy loading and async decoding on the image', () => {
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'image', content: 'data:image/png;base64,abc' })]}
        />
      );

      const img = screen.getByAltText('Output');
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img).toHaveAttribute('decoding', 'async');
    });
  });

  // 5. Image output with ref (outputs/cellId/filename)
  describe('image output with output ref', () => {
    it('resolves the ref to an API URL via parseOutputRefUrl', () => {
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'image', content: 'outputs/cell-42/chart.png' })]}
        />
      );

      const img = screen.getByAltText('Output') as HTMLImageElement;
      expect(img).toHaveAttribute('src', '/api/cells/cell-42/outputs/chart.png');
    });

    it('encodes filenames with special characters', () => {
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'image', content: 'outputs/c1/my file (1).png' })]}
        />
      );

      const img = screen.getByAltText('Output') as HTMLImageElement;
      expect(img).toHaveAttribute('src', '/api/cells/c1/outputs/my%20file%20(1).png');
    });
  });

  // 6. HTML output (rendered via Shadow DOM)
  describe('html output', () => {
    it('renders a ShadowHtml host element for HTML content', () => {
      const { container } = render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'html', content: '<h1>Hello</h1>' })]}
        />
      );

      // ShadowHtml renders a <div> host; no iframes
      const host = container.querySelector('div > div');
      expect(host).toBeInTheDocument();
      expect(container.querySelector('iframe')).not.toBeInTheDocument();
    });
  });

  // 7. Chart output
  describe('chart output', () => {
    it('renders the PlotlyOutput component with the chart data', () => {
      const chartData = {
        data: [{ x: [1, 2, 3], y: [4, 5, 6], type: 'scatter' }],
        layout: { title: 'Test Chart' },
      };

      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'chart', content: '', data: chartData })]}
        />
      );

      const plotly = screen.getByTestId('plotly-output');
      expect(plotly).toBeInTheDocument();
      expect(plotly.textContent).toContain('"type":"scatter"');
    });
  });

  // 8. Table output
  describe('table output', () => {
    const tableOutput = makeOutput({
      type: 'table',
      content: 'DataFrame: 3 rows x 2 columns',
      data: {
        columns: ['name', 'value'],
        rows: [
          { name: 'alpha', value: 10 },
          { name: 'beta', value: 20 },
          { name: 'gamma', value: 30 },
        ],
      },
    });

    it('renders a table with column headers', () => {
      render(<CellOutputRenderer outputs={[tableOutput]} />);

      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('value')).toBeInTheDocument();
    });

    it('renders all rows with formatted values', () => {
      render(<CellOutputRenderer outputs={[tableOutput]} />);

      expect(screen.getByText('alpha')).toBeInTheDocument();
      expect(screen.getByText('beta')).toBeInTheDocument();
      expect(screen.getByText('gamma')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
    });

    it('renders the content label above the table', () => {
      render(<CellOutputRenderer outputs={[tableOutput]} />);

      expect(screen.getByText('DataFrame: 3 rows x 2 columns')).toBeInTheDocument();
    });

    it('formats float values to 4 decimal places', () => {
      render(
        <CellOutputRenderer
          outputs={[
            makeOutput({
              type: 'table',
              content: 'floats',
              data: {
                columns: ['score'],
                rows: [{ score: 3.14159265 }],
              },
            }),
          ]}
        />
      );

      expect(screen.getByText('3.1416')).toBeInTheDocument();
    });

    it('formats boolean values as True/False', () => {
      render(
        <CellOutputRenderer
          outputs={[
            makeOutput({
              type: 'table',
              content: 'bools',
              data: {
                columns: ['flag'],
                rows: [{ flag: true }, { flag: false }],
              },
            }),
          ]}
        />
      );

      expect(screen.getByText('True')).toBeInTheDocument();
      expect(screen.getByText('False')).toBeInTheDocument();
    });

    it('formats null/undefined values as "null"', () => {
      render(
        <CellOutputRenderer
          outputs={[
            makeOutput({
              type: 'table',
              content: 'nulls',
              data: {
                columns: ['a', 'b'],
                rows: [{ a: null, b: undefined }],
              },
            }),
          ]}
        />
      );

      const nullCells = screen.getAllByText('null');
      expect(nullCells).toHaveLength(2);
    });

    it('renders the correct number of <th> and <td> elements', () => {
      const { container } = render(<CellOutputRenderer outputs={[tableOutput]} />);

      const ths = container.querySelectorAll('th');
      expect(ths).toHaveLength(2); // name, value

      const tds = container.querySelectorAll('td');
      expect(tds).toHaveLength(6); // 3 rows x 2 columns
    });
  });

  // 9. Table with invalid data falls back to text
  describe('table with invalid data', () => {
    it('falls back to text display when data has non-array rows', () => {
      render(
        <CellOutputRenderer
          outputs={[
            makeOutput({
              type: 'table',
              content: 'Fallback content here',
              data: { columns: ['a'], rows: 'not-an-array' } as unknown as {
                columns: string[];
                rows: Record<string, unknown>[];
              },
            }),
          ]}
        />
      );

      expect(screen.getByText('Fallback content here')).toBeInTheDocument();
      // Should NOT render an actual <table>
      expect(document.querySelector('table')).not.toBeInTheDocument();
    });

    it('falls back when data is null/undefined', () => {
      render(
        <CellOutputRenderer
          outputs={[
            makeOutput({
              type: 'table',
              content: 'No data available',
            }),
          ]}
        />
      );

      expect(screen.getByText('No data available')).toBeInTheDocument();
      expect(document.querySelector('table')).not.toBeInTheDocument();
    });

    it('falls back when columns contain non-string values', () => {
      render(
        <CellOutputRenderer
          outputs={[
            makeOutput({
              type: 'table',
              content: 'Bad columns',
              data: { columns: [1, 2, 3], rows: [{ 1: 'a' }] } as unknown as {
                columns: string[];
                rows: Record<string, unknown>[];
              },
            }),
          ]}
        />
      );

      expect(screen.getByText('Bad columns')).toBeInTheDocument();
      expect(document.querySelector('table')).not.toBeInTheDocument();
    });
  });

  // 10. Empty outputs
  describe('empty outputs', () => {
    it('returns null when outputs array is empty', () => {
      const { container } = render(<CellOutputRenderer outputs={[]} />);

      expect(container.innerHTML).toBe('');
    });
  });

  // 11. Unknown output type
  describe('unknown output type', () => {
    it('renders a fallback <pre> for unrecognized output types', () => {
      render(
        <CellOutputRenderer
          outputs={[
            makeOutput({
              type: 'widget' as RichOutput['type'],
              content: 'unknown widget data',
            }),
          ]}
        />
      );

      const pre = screen.getByText('unknown widget data');
      expect(pre).toBeInTheDocument();
      expect(pre.tagName).toBe('PRE');
      // The fallback pre has bg-muted/50 styling to distinguish it
      expect(pre.className).toContain('bg-muted/50');
    });
  });

  // 12. Multiple mixed outputs
  describe('multiple mixed outputs', () => {
    it('renders text + image + error outputs in order', () => {
      const { container } = render(
        <CellOutputRenderer
          outputs={[
            makeOutput({ type: 'text', content: 'Step 1 complete' }),
            makeOutput({ type: 'image', content: 'data:image/png;base64,abc123' }),
            makeOutput({ type: 'error', content: 'RuntimeError: division by zero' }),
          ]}
        />
      );

      // Text output
      const textPre = screen.getByText('Step 1 complete');
      expect(textPre).toBeInTheDocument();
      expect(textPre.tagName).toBe('PRE');

      // Image output
      const img = screen.getByAltText('Output');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123');

      // Error output
      expect(screen.getByText('RuntimeError: division by zero')).toBeInTheDocument();

      // Verify order: text comes before image, image before error
      const wrapper = container.firstElementChild!;
      const children = Array.from(wrapper.children);
      expect(children).toHaveLength(3);

      // First child contains the text <pre>
      expect(children[0].tagName).toBe('PRE');
      expect(children[0].textContent).toBe('Step 1 complete');

      // Second child is the <img>
      expect(children[1].tagName).toBe('IMG');

      // Third child is the error <pre>
      expect(children[2].tagName).toBe('PRE');
      expect(children[2].textContent).toBe('RuntimeError: division by zero');
    });

    it('renders text + table + chart together', () => {
      render(
        <CellOutputRenderer
          outputs={[
            makeOutput({ type: 'text', content: 'Model results:' }),
            makeOutput({
              type: 'table',
              content: 'Metrics',
              data: {
                columns: ['metric', 'value'],
                rows: [{ metric: 'accuracy', value: 0.9543 }],
              },
            }),
            makeOutput({
              type: 'chart',
              content: '',
              data: { data: [{ x: [1], y: [2] }] },
            }),
          ]}
        />
      );

      expect(screen.getByText('Model results:')).toBeInTheDocument();
      expect(screen.getByText('accuracy')).toBeInTheDocument();
      expect(screen.getByText('0.9543')).toBeInTheDocument();
      expect(screen.getByTestId('plotly-output')).toBeInTheDocument();
    });
  });

  // Additional: className prop
  describe('className prop', () => {
    it('applies custom className to the wrapper', () => {
      const { container } = render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'text', content: 'test' })]}
          className="custom-class"
        />
      );

      expect(container.firstElementChild?.className).toContain('custom-class');
    });
  });

  // 13. Error output rendering - full integration check
  describe('error output rendering (full integration)', () => {
    it('renders error message as red pre without header label or icon', () => {
      const errorMessage = 'NameError: name "foo" is not defined';
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'error', content: errorMessage })]}
        />
      );

      const pre = screen.getByText(errorMessage);
      expect(pre.tagName).toBe('PRE');
      expect(pre.className).toContain('text-red-400');
      // Red left border on the card is the error signal — no label/icon here
      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });
  });

  // 14. HTML output rendering — Shadow DOM host
  describe('html output rendering (Shadow DOM)', () => {
    it('renders a host div instead of an iframe for HTML output', () => {
      const { container } = render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'html', content: '<div><strong>Bold</strong> text</div>' })]}
        />
      );

      // Should use Shadow DOM host, not iframe
      expect(container.querySelector('iframe')).not.toBeInTheDocument();
      // The host div is the ShadowHtml component root
      const wrapper = container.firstElementChild!;
      expect(wrapper.children.length).toBeGreaterThan(0);
    });
  });

  // 15. Chart/Plotly output rendering - additional scenarios
  describe('chart/plotly output rendering (extended)', () => {
    it('renders PlotlyOutput component with bar chart data and layout', () => {
      const plotlyData = {
        data: [{ x: [1, 2], y: [3, 4], type: 'bar' }],
        layout: { title: 'Bar Chart' },
      };

      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'chart', content: '', data: plotlyData })]}
        />
      );

      const plotlyEl = screen.getByTestId('plotly-output');
      expect(plotlyEl).toBeInTheDocument();
      expect(plotlyEl.textContent).toContain('"type":"bar"');
      expect(plotlyEl.textContent).toContain('"title":"Bar Chart"');
    });

    it('renders PlotlyOutput with undefined data gracefully', () => {
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'chart', content: '', data: undefined })]}
        />
      );

      const plotlyEl = screen.getByTestId('plotly-output');
      expect(plotlyEl).toBeInTheDocument();
    });
  });

  // 16. Image loading error
  describe('image loading error', () => {
    it('calls console.warn on image load failure via onError handler', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const imageContent = 'data:image/png;base64,INVALID';

      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'image', content: imageContent })]}
        />
      );

      const img = screen.getByAltText('Output') as HTMLImageElement;

      // Simulate image loading failure
      fireEvent.error(img);

      expect(warnSpy).toHaveBeenCalledWith(
        '[CellOutputRenderer] Failed to load image output:',
        { original: imageContent, src: imageContent }
      );

      warnSpy.mockRestore();
    });

    it('calls console.warn with resolved URL for output ref images on error', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'image', content: 'outputs/cell-99/broken.png' })]}
        />
      );

      const img = screen.getByAltText('Output') as HTMLImageElement;
      fireEvent.error(img);

      expect(warnSpy).toHaveBeenCalledWith(
        '[CellOutputRenderer] Failed to load image output:',
        {
          original: 'outputs/cell-99/broken.png',
          src: '/api/cells/cell-99/outputs/broken.png',
        }
      );

      warnSpy.mockRestore();
    });
  });

  // 17. Output ref resolution
  describe('output ref resolution', () => {
    it('resolves outputs/ prefixed content via parseOutputRefUrl for image type', () => {
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'image', content: 'outputs/abc-123/result.png' })]}
        />
      );

      const img = screen.getByAltText('Output') as HTMLImageElement;
      expect(img).toHaveAttribute('src', '/api/cells/abc-123/outputs/result.png');
    });

    it('does NOT resolve non-outputs/ prefixed content', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAA';
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'image', content: dataUrl })]}
        />
      );

      const img = screen.getByAltText('Output') as HTMLImageElement;
      // Should remain unchanged (not run through parseOutputRefUrl)
      expect(img).toHaveAttribute('src', dataUrl);
    });

    it('handles output refs with deeply nested paths', () => {
      render(
        <CellOutputRenderer
          outputs={[makeOutput({ type: 'image', content: 'outputs/cell-id/subdir/deep/file.png' })]}
        />
      );

      const img = screen.getByAltText('Output') as HTMLImageElement;
      // The mock parseOutputRefUrl splits on first two segments: outputs/<cellId>/<rest>
      // So "subdir/deep/file.png" becomes the filename
      expect(img).toHaveAttribute('src', '/api/cells/cell-id/outputs/subdir%2Fdeep%2Ffile.png');
    });
  });

  // Additional: buildOutputCopyText utility (already partially tested, expanding coverage)
  describe('buildOutputCopyText', () => {
    it('builds copy text for mixed outputs and table data', () => {
      const outputText = buildOutputCopyText([
        makeOutput({ type: 'text', content: 'header' }),
        makeOutput({
          type: 'table',
          content: 'DataFrame: 2 rows x 2 columns',
          data: {
            columns: ['name', 'score'],
            rows: [
              { name: 'alpha', score: 1.23456 },
              { name: 'beta', score: true },
            ],
          },
        }),
        makeOutput({ type: 'text', content: 'footer' }),
      ]);

      expect(outputText).toBe(
        ['header', 'name\tscore', 'alpha\t1.2346', 'beta\tTrue', 'footer'].join('\n')
      );
    });

    it('falls back to plain content for malformed table data', () => {
      const outputText = buildOutputCopyText([
        makeOutput({
          type: 'table',
          content: 'fallback table content',
          data: {
            columns: ['name'],
            rows: 'not-an-array',
          } as unknown as { columns: string[]; rows: Record<string, unknown>[] },
        }),
      ]);

      expect(outputText).toBe('fallback table content');
    });

    it('includes error content in copy text', () => {
      const outputText = buildOutputCopyText([
        makeOutput({ type: 'error', content: 'ValueError: bad input' }),
      ]);

      expect(outputText).toBe('ValueError: bad input');
    });

    it('skips empty content segments', () => {
      const outputText = buildOutputCopyText([
        makeOutput({ type: 'text', content: '' }),
        makeOutput({ type: 'text', content: 'visible' }),
      ]);

      expect(outputText).toBe('visible');
    });
  });
});
