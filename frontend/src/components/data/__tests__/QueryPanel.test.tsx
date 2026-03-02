import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  });

  it('uses light theme immediately and after remount in light mode', async () => {
    const onExecute = vi.fn();

    const firstRender = render(<QueryPanel onExecute={onExecute} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-monaco-editor')).toHaveAttribute('data-theme', 'custom-light');
    });
    expect(mockState.renderedThemes[0]).toBe('custom-light');
    expect(mockState.renderedThemes).not.toContain('custom-dark');
    expect(screen.getByTestId('mock-monaco-editor')).toHaveAttribute('data-language', 'sql');
    expect(mockState.renderedQuickSuggestions.at(-1)).toBe(true);
    expect(mockState.renderedTriggerSuggestions.at(-1)).toBe(true);
    expect(mockState.renderedFixedOverflowWidgets.at(-1)).toBe(false);

    firstRender.unmount();

    render(<QueryPanel onExecute={onExecute} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-monaco-editor')).toHaveAttribute('data-theme', 'custom-light');
    });
    expect(mockState.renderedThemes).not.toContain('custom-dark');
  });
});
