import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const initMonacoMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      editor: {
        setTheme: vi.fn(),
        defineTheme: vi.fn(),
      },
    }),
  ),
);

vi.mock('@/lib/monaco/preloader', async () => {
  const actual = await vi.importActual<typeof import('@/lib/monaco/preloader')>(
    '@/lib/monaco/preloader',
  );
  return {
    ...actual,
    initMonaco: initMonacoMock,
  };
});

import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { useProjectStore } from '@/stores/projectStore';

describe('landing preview performance', () => {
  beforeEach(() => {
    initMonacoMock.mockClear();
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

  it('does not eagerly initialize Monaco just to resolve landing theme colors', () => {
    renderHook(() => useProjectThemeColor());

    expect(initMonacoMock).not.toHaveBeenCalled();
  });
});
