import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryPanel } from '../QueryPanel';

const mockState = vi.hoisted(() => ({
  appTheme: 'light' as 'light' | 'dark' | 'system',
  renderedThemes: [] as string[]
}));

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({
    theme: mockState.appTheme
  })
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({ theme }: { theme: string }) => {
    mockState.renderedThemes.push(theme);
    return <div data-testid="mock-monaco-editor" data-theme={theme} />;
  }
}));

describe('QueryPanel theme handling', () => {
  beforeEach(() => {
    mockState.appTheme = 'light';
    mockState.renderedThemes = [];
  });

  it('uses light theme immediately and after remount in light mode', async () => {
    const onExecute = vi.fn();

    const firstRender = render(<QueryPanel onExecute={onExecute} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-monaco-editor')).toHaveAttribute('data-theme', 'custom-light');
    });
    expect(mockState.renderedThemes[0]).toBe('custom-light');
    expect(mockState.renderedThemes).not.toContain('custom-dark');

    firstRender.unmount();

    render(<QueryPanel onExecute={onExecute} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-monaco-editor')).toHaveAttribute('data-theme', 'custom-light');
    });
    expect(mockState.renderedThemes).not.toContain('custom-dark');
  });
});
