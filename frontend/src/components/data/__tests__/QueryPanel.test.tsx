import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectStore } from '@/stores/projectStore';
import { useNlSuggestionStore } from '@/stores/nlSuggestionStore';
import { QueryPanel } from '../QueryPanel';

const mockState = vi.hoisted(() => ({
  appTheme: 'light' as 'light' | 'dark' | 'system',
  renderedThemes: [] as string[],
  renderedLanguages: [] as Array<string | undefined>,
  renderedQuickSuggestions: [] as unknown[],
  renderedTriggerSuggestions: [] as unknown[],
  renderedFixedOverflowWidgets: [] as unknown[]
}));

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({
    theme: mockState.appTheme
  })
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({
    theme,
    language,
    options
  }: {
    theme: string;
    language?: string;
    options?: {
      quickSuggestions?: unknown;
      suggestOnTriggerCharacters?: unknown;
      fixedOverflowWidgets?: unknown;
    };
  }) => {
    mockState.renderedThemes.push(theme);
    mockState.renderedLanguages.push(language);
    mockState.renderedQuickSuggestions.push(options?.quickSuggestions);
    mockState.renderedTriggerSuggestions.push(options?.suggestOnTriggerCharacters);
    mockState.renderedFixedOverflowWidgets.push(options?.fixedOverflowWidgets);
    return <div data-testid="mock-monaco-editor" data-theme={theme} data-language={language} />;
  }
}));

describe('QueryPanel theme handling', () => {
  beforeEach(() => {
    mockState.appTheme = 'light';
    mockState.renderedThemes = [];
    mockState.renderedLanguages = [];
    mockState.renderedQuickSuggestions = [];
    mockState.renderedTriggerSuggestions = [];
    mockState.renderedFixedOverflowWidgets = [];
    useNlSuggestionStore.getState().reset();
    useProjectStore.setState({
      projects: [
        {
          id: 'route-project',
          title: 'Route Project',
          description: '',
          icon: 'Folder',
          color: 'blue',
          createdAt: new Date(),
          updatedAt: new Date(),
          currentPhase: 'upload',
          unlockedPhases: ['upload'],
          completedPhases: [],
          metadata: {}
        },
        {
          id: 'stale-project',
          title: 'Stale Project',
          description: '',
          icon: 'Folder',
          color: 'green',
          createdAt: new Date(),
          updatedAt: new Date(),
          currentPhase: 'upload',
          unlockedPhases: ['upload'],
          completedPhases: [],
          metadata: {}
        }
      ],
      activeProjectId: 'stale-project'
    });
  });

  it('uses light theme immediately and after remount in light mode', async () => {
    const onExecute = vi.fn();

    const firstRender = render(<QueryPanel onExecute={onExecute} />);
    expect(await screen.findByTestId('mock-monaco-editor')).toHaveAttribute('data-theme', 'adaptive-light');
    expect(mockState.renderedThemes[0]).toBe('adaptive-light');
    expect(mockState.renderedThemes).not.toContain('adaptive-dark');
    expect(screen.getByTestId('mock-monaco-editor')).toHaveAttribute('data-language', 'sql');
    expect(mockState.renderedQuickSuggestions.at(-1)).toBe(true);
    expect(mockState.renderedTriggerSuggestions.at(-1)).toBe(true);
    expect(mockState.renderedFixedOverflowWidgets.at(-1)).toBe(true);

    firstRender.unmount();

    render(<QueryPanel onExecute={onExecute} />);
    expect(await screen.findByTestId('mock-monaco-editor')).toHaveAttribute('data-theme', 'adaptive-light');
    expect(mockState.renderedThemes).not.toContain('adaptive-dark');
  });

  it('expands from collapsed overlay click', () => {
    const onCollapsedChange = vi.fn();
    render(<QueryPanel onExecute={vi.fn()} collapsed onCollapsedChange={onCollapsedChange} />);

    const collapsedOverlay = screen.getByText(/query builder/i).closest('[role="button"]');
    expect(collapsedOverlay).not.toBeNull();

    fireEvent.click(collapsedOverlay!);
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it('expands from collapsed overlay keyboard interactions', () => {
    const onCollapsedChange = vi.fn();
    render(<QueryPanel onExecute={vi.fn()} collapsed onCollapsedChange={onCollapsedChange} />);

    const collapsedOverlay = screen.getByText(/query builder/i).closest('[role="button"]');
    expect(collapsedOverlay).not.toBeNull();

    fireEvent.keyDown(collapsedOverlay!, { key: 'Enter' });
    fireEvent.keyDown(collapsedOverlay!, { key: ' ' });
    expect(onCollapsedChange).toHaveBeenNthCalledWith(1, false);
    expect(onCollapsedChange).toHaveBeenNthCalledWith(2, false);
  });

  it('uses the route project suggestion entry when english mode opens', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useNlSuggestionStore.setState({
      byProject: {
        'route-project': {
          suggestions: [
            {
              id: 'route-suggestion',
              prompt: 'Compare weekly revenue and average order value over the last 8 weeks.',
              label: 'Weekly revenue trends',
              category: 'trend',
              tables: ['orders'],
              rationale: 'Uses time and revenue metrics.'
            }
          ],
          schemaFingerprint: 'schema-1'
        },
        'stale-project': {
          suggestions: [
            {
              id: 'stale-suggestion',
              prompt: 'This stale project suggestion should never appear.',
              label: 'Stale suggestion',
              category: 'summary',
              tables: ['customers'],
              rationale: 'Wrong project.'
            }
          ],
          schemaFingerprint: 'schema-2'
        }
      }
    });

    render(<QueryPanel projectId="route-project" onExecute={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/natural language mode/i));

    expect(await screen.findAllByText(/compare weekly revenue and average order value/i)).not.toHaveLength(0);
    expect(screen.queryByText(/this stale project suggestion should never appear/i)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('keeps english placeholders visible across sql mode toggles', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useNlSuggestionStore.setState({
      byProject: {
        'route-project': {
          suggestions: [
            {
              id: 'route-suggestion',
              prompt: 'Compare weekly revenue and average order value over the last 8 weeks.',
              label: 'Weekly revenue trends',
              category: 'trend',
              tables: ['orders'],
              rationale: 'Uses time and revenue metrics.'
            }
          ],
          schemaFingerprint: 'schema-1'
        }
      }
    });

    const { container } = render(<QueryPanel projectId="route-project" onExecute={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/natural language mode/i));
    expect(container.textContent).toContain(
      'Compare weekly revenue and average order value over the last 8 weeks.'
    );

    fireEvent.click(screen.getByLabelText(/sql mode/i));
    fireEvent.click(screen.getByLabelText(/natural language mode/i));

    expect(container.textContent).toContain(
      'Compare weekly revenue and average order value over the last 8 weeks.'
    );
    vi.useRealTimers();
  });
});
