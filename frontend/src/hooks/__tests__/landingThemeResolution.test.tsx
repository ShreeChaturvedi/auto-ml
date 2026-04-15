import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { usePythonEditor } from '@/hooks/usePythonEditor';
import { useProjectStore } from '@/stores/projectStore';

describe('landing theme resolution without ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.className = 'dark';

    useProjectStore.setState({
      activeProjectId: 'landing-demo-project',
      projects: [
        {
          id: 'landing-demo-project',
          title: 'Landing Demo',
          icon: 'Rocket',
          color: 'cyan',
          createdAt: new Date('2026-04-14T00:00:00.000Z'),
          updatedAt: new Date('2026-04-14T00:00:00.000Z'),
          unlockedPhases: ['upload'],
          currentPhase: 'upload',
          completedPhases: [],
          metadata: {},
        },
      ],
    });
  });

  it('keeps Monaco on a dark syntax theme when the landing document is dark', () => {
    const { result } = renderHook(() => useProjectThemeColor());

    expect(result.current.syntaxThemeId).toBe('adaptive-dark');
  });

  it('keeps Python editor fallbacks dark when the landing document is dark', () => {
    const { result } = renderHook(() =>
      usePythonEditor({
        content: 'print("hello")',
        onContentChange: vi.fn(),
        onRun: vi.fn(),
        preloadMonaco: false,
      }),
    );

    expect(result.current.resolvedTheme).toBe('dark');
  });
});
