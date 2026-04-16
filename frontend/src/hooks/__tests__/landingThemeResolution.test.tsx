import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { usePythonEditor } from '@/hooks/usePythonEditor';
import { useProjectStore } from '@/stores/projectStore';

const monacoMock = vi.hoisted(() => ({
  setTheme: vi.fn(),
  defineTheme: vi.fn(),
}));

vi.mock('@/lib/monaco/preloader', async () => {
  const actual = await vi.importActual<typeof import('@/lib/monaco/preloader')>(
    '@/lib/monaco/preloader',
  );
  return {
    ...actual,
    getMonacoIfReady: () => ({ editor: monacoMock }),
    registerAdaptiveTheme: vi.fn((_m, _p, isDark: boolean) => {
      monacoMock.defineTheme(isDark ? 'adaptive-dark' : 'adaptive-light', {});
    }),
    initMonaco: vi.fn().mockResolvedValue({ editor: monacoMock }),
  };
});

describe('landing theme resolution without ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.className = 'dark';
    monacoMock.setTheme.mockClear();
    monacoMock.defineTheme.mockClear();

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

describe('Monaco re-theming when ThemeProvider toggles', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = 'dark';
    monacoMock.setTheme.mockClear();
    monacoMock.defineTheme.mockClear();

    useProjectStore.setState({
      activeProjectId: 'demo-project',
      projects: [
        {
          id: 'demo-project',
          title: 'Demo',
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

  it('calls monaco.editor.setTheme with the new adaptive theme when the user toggles modes', () => {
    // jsdom rejects `storageArea: localStorage` in StorageEventInit, so stub
    // StorageEvent with a lenient constructor for the cross-provider ping.
    // The re-theme here is driven by React state, not the storage event.
    const OriginalStorageEvent = window.StorageEvent;
    class StubStorageEvent extends Event {
      key: string | null;
      newValue: string | null;
      oldValue: string | null;
      url: string;
      storageArea: Storage | null;
      constructor(type: string, init?: StorageEventInit) {
        super(type, init);
        this.key = init?.key ?? null;
        this.newValue = init?.newValue ?? null;
        this.oldValue = init?.oldValue ?? null;
        this.url = init?.url ?? '';
        this.storageArea = init?.storageArea ?? null;
      }
    }
    (window as unknown as { StorageEvent: typeof StorageEvent }).StorageEvent =
      StubStorageEvent as unknown as typeof StorageEvent;

    try {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider defaultTheme="dark" storageKey="automl-ui-theme">
          {children}
        </ThemeProvider>
      );

      const { result } = renderHook(
        () => {
          const theme = useTheme();
          const project = useProjectThemeColor();
          return { theme, project };
        },
        { wrapper },
      );

      expect(result.current.project.syntaxThemeId).toBe('adaptive-dark');
      expect(monacoMock.setTheme.mock.calls.length).toBeGreaterThan(0);
      expect(monacoMock.setTheme).toHaveBeenLastCalledWith('adaptive-dark');

      act(() => {
        result.current.theme.setTheme('light');
      });

      expect(result.current.project.syntaxThemeId).toBe('adaptive-light');
      expect(monacoMock.setTheme).toHaveBeenLastCalledWith('adaptive-light');
    } finally {
      (window as unknown as { StorageEvent: typeof StorageEvent }).StorageEvent =
        OriginalStorageEvent;
    }
  });
});
