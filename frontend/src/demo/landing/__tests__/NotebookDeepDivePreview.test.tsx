import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useProjectStore } from '@/stores/projectStore';

import { NotebookDeepDivePreview } from '../NotebookDeepDivePreview';

describe('NotebookDeepDivePreview', () => {
  beforeEach(() => {
    useProjectStore.setState((state) => ({
      ...state,
      projects: [],
      activeProjectId: null,
      isInitialized: false,
      isLoading: false,
      error: undefined,
    }));
  });

  it('keeps plain identifiers on editor foreground while preserving syntax accents', () => {
    render(<NotebookDeepDivePreview />);

    expect(screen.getByText('import').getAttribute('style')).toContain('color: hsl(var(--syn-keyword))');
    expect(screen.getByText('read_csv').getAttribute('style')).toContain('color: hsl(var(--syn-function))');

    expect(screen.getByText('pandas').getAttribute('style')).toBeNull();
    expect(screen.getAllByText('summary')[0].getAttribute('style')).toBeNull();
  });
});
