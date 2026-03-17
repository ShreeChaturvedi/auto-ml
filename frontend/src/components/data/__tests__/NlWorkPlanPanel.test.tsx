import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/llm/ProgressiveMessageText', async () => {
  const React = await import('react');

  return {
    ProgressiveMessageText({
      text,
      className,
      onVisibleTextChange
    }: {
      text: string;
      className?: string;
      onVisibleTextChange?: (visibleText: string) => void;
    }) {
      React.useLayoutEffect(() => {
        onVisibleTextChange?.(text);
      }, [onVisibleTextChange, text]);

      return <div className={className}>{text}</div>;
    }
  };
});

import { NlWorkPlanPanel } from '../NlWorkPlanPanel';
import type { NlProviderInfo, NlQueryExplanation } from '@/lib/api/query';
import type { NlModelWorkBlockState, NlWorkPhaseState } from '@/types/nlQuery';

const OPENAI_PROVIDER: NlProviderInfo = {
  id: 'openai',
  label: 'OpenAI',
  model: 'gpt-5.4'
};

const MODEL_EXPLANATION: NlQueryExplanation = {
  intentSummary: 'Rank students by average chapter score.',
  selectedTables: ['checkpoints_pulse'],
  joinPlan: [],
  filters: [],
  aggregations: ['AVG(response)'],
  assumptions: ['response is numeric.'],
  validationNotes: ['SQL passed read-only validation checks.'],
  confidence: 0.91,
  warningLevel: 'low',
  confidenceMode: 'model',
  reliabilityTier: 'high'
};

const FALLBACK_EXPLANATION: NlQueryExplanation = {
  intentSummary: 'Plan for ranking students.',
  selectedTables: ['checkpoints_pulse'],
  joinPlan: [],
  filters: [],
  aggregations: [],
  assumptions: ['Compact SQL generation recovered after the rich response failed validation.'],
  validationNotes: [
    'Compact SQL generation produced the final SQL after rich output validation failed.',
    'debug: provider fallback detail: quota exceeded'
  ],
  confidence: 0.48,
  warningLevel: 'high',
  confidenceMode: 'model',
  reliabilityTier: 'low'
};

const PHASES: NlWorkPhaseState[] = [
  {
    phaseId: 'schema_context',
    label: 'Schema context',
    status: 'completed',
    lastSummary: 'Schema loaded',
    events: []
  },
  {
    phaseId: 'planning',
    label: 'Planning',
    status: 'active',
    lastSummary: 'Planning SQL strategy',
    events: [
      {
        type: 'phase_started',
        phaseId: 'planning',
        summary: 'Planning started',
        timestamp: new Date().toISOString()
      },
      {
        type: 'phase_progress',
        phaseId: 'planning',
        summary: 'Choosing candidate tables',
        timestamp: new Date().toISOString()
      }
    ]
  },
  {
    phaseId: 'sql_generation',
    label: 'SQL generation',
    status: 'pending',
    events: []
  },
  {
    phaseId: 'validation',
    label: 'Validation',
    status: 'pending',
    events: []
  },
  {
    phaseId: 'initial_execution',
    label: 'Initial execution',
    status: 'pending',
    events: []
  },
  {
    phaseId: 'repair',
    label: 'Repair',
    status: 'pending',
    events: []
  },
  {
    phaseId: 'done',
    label: 'Done',
    status: 'pending',
    events: []
  }
];

const MODEL_WORK_BLOCKS: NlModelWorkBlockState[] = [
  {
    blockId: 'plan-1',
    kind: 'plan',
    title: 'Query planning',
    phaseId: 'planning',
    status: 'streaming',
    content: 'Selecting candidate tables and grouping strategy.',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    blockId: 'thinking-1',
    kind: 'thinking',
    title: 'Query planning thinking',
    phaseId: 'planning',
    status: 'completed',
    content: 'Reasoning through join ambiguity and metric definitions.',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

describe('NlWorkPlanPanel', () => {
  it('renders active phase stream details during submitting with provider icon only', () => {
    render(
      <NlWorkPlanPanel
        phase="submitting"
        provider={OPENAI_PROVIDER}
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.getByText(/planning • in progress/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/openai provider/i)).toBeInTheDocument();
    expect(screen.queryByText(/model work/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('nl-model-work-block-plan-1')).toBeInTheDocument();
  });

  it('calls toggle callback when collapse control is clicked', () => {
    const onToggle = vi.fn();
    render(
      <NlWorkPlanPanel
        phase="submitting"
        provider={OPENAI_PROVIDER}
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={onToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /collapse model work panel/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('hides body when collapsed', () => {
    render(
      <NlWorkPlanPanel
        phase="submitting"
        provider={OPENAI_PROVIDER}
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming
        isExpanded={false}
        autoCollapsed
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.queryByText(/streaming model output will appear here/i)).not.toBeInTheDocument();
  });

  it('renders review without confidence or fallback path chrome', () => {
    render(
      <NlWorkPlanPanel
        phase="reviewing"
        explanation={MODEL_EXPLANATION}
        provider={OPENAI_PROVIDER}
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming={false}
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.getByText(/^review$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/openai provider/i)).toBeInTheDocument();
    expect(screen.queryByText(/91% confidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/model path/i)).not.toBeInTheDocument();
  });

  it('shows Done phase label when the pipeline is completed outside review mode', () => {
    const completedPhases: NlWorkPhaseState[] = PHASES.map((phase) => ({
      ...phase,
      status: phase.phaseId === 'done' ? 'completed' as const : 'pending' as const,
      lastSummary: phase.phaseId === 'done' ? 'NL query pipeline finished.' : phase.lastSummary
    }));

    render(
      <NlWorkPlanPanel
        phase="revealing"
        provider={OPENAI_PROVIDER}
        workPhases={completedPhases}
        modelWorkBlocks={[]}
        isStreaming={false}
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.getByText(/nl query pipeline finished/i)).toBeInTheDocument();
  });

  it('does not show legacy path or reliability copy in review mode', () => {
    render(
      <NlWorkPlanPanel
        phase="reviewing"
        explanation={FALLBACK_EXPLANATION}
        provider={OPENAI_PROVIDER}
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming={false}
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.queryByText(/compact fallback path/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^reliability$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/debug details/i)).toBeInTheDocument();
  });

  it('shows streamed model work blocks during review with validation details', () => {
    render(
      <NlWorkPlanPanel
        phase="reviewing"
        explanation={FALLBACK_EXPLANATION}
        provider={OPENAI_PROVIDER}
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming={false}
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /show transcript/i }));
    expect(screen.getAllByText(/query planning/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^validation$/i)).toBeInTheDocument();
  });

  it('keeps the live transcript viewport pinned to the bottom as content grows', () => {
    const OriginalResizeObserver = globalThis.ResizeObserver;
    class ResizeObserverMock {
      static instances: ResizeObserverMock[] = [];
      callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        ResizeObserverMock.instances.push(this);
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    try {
      render(
        <NlWorkPlanPanel
          phase="submitting"
          provider={OPENAI_PROVIDER}
          workPhases={PHASES}
          modelWorkBlocks={MODEL_WORK_BLOCKS}
          isStreaming
          isExpanded
          autoCollapsed={false}
          onToggleExpanded={vi.fn()}
        />
      );

      const viewport = screen.getByTestId('nl-model-work-viewport') as HTMLDivElement;
      let scrollHeight = 320;

      Object.defineProperty(viewport, 'clientHeight', {
        configurable: true,
        value: 120
      });
      Object.defineProperty(viewport, 'scrollHeight', {
        configurable: true,
        get: () => scrollHeight
      });

      viewport.scrollTop = 0;

      act(() => {
        ResizeObserverMock.instances.forEach((instance) => {
          instance.callback([], instance as unknown as ResizeObserver);
        });
      });

      expect(viewport.scrollTop).toBe(320);

      scrollHeight = 540;
      act(() => {
        ResizeObserverMock.instances.forEach((instance) => {
          instance.callback([], instance as unknown as ResizeObserver);
        });
      });

      expect(viewport.scrollTop).toBe(540);
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver;
    }
  });

  it('uses smooth scrolling when a new transcript block arrives', () => {
    const nextBlocks: NlModelWorkBlockState[] = [
      ...MODEL_WORK_BLOCKS.map((block) => ({ ...block, status: 'completed' as const })),
      {
        blockId: 'sql-1',
        kind: 'sql',
        title: 'SQL generation',
        phaseId: 'sql_generation',
        status: 'streaming',
        content: 'SELECT * FROM checkpoints_pulse;',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const { rerender } = render(
      <NlWorkPlanPanel
        phase="submitting"
        provider={OPENAI_PROVIDER}
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    const viewport = screen.getByTestId('nl-model-work-viewport') as HTMLDivElement & {
      scrollTo?: (options: ScrollToOptions) => void;
    };
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      viewport.scrollTop = options.top ?? 0;
    });

    Object.defineProperty(viewport, 'clientHeight', {
      configurable: true,
      value: 120
    });
    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      value: 480
    });

    viewport.scrollTop = 480;
    viewport.scrollTo = scrollTo;
    scrollTo.mockClear();

    rerender(
      <NlWorkPlanPanel
        phase="submitting"
        provider={OPENAI_PROVIDER}
        workPhases={PHASES}
        modelWorkBlocks={nextBlocks}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(
      scrollTo.mock.calls.some(([options]) => (
        options?.top === 480
        && options?.behavior === 'smooth'
      ))
    ).toBe(true);
  });

  it('keeps the live transcript block body pinned to the bottom as streamed content grows', () => {
    const OriginalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;

    try {
      const { rerender } = render(
        <NlWorkPlanPanel
          phase="submitting"
          provider={OPENAI_PROVIDER}
          workPhases={PHASES}
          modelWorkBlocks={MODEL_WORK_BLOCKS}
          isStreaming
          isExpanded
          autoCollapsed={false}
          onToggleExpanded={vi.fn()}
        />
      );

      const body = screen.getByTestId('nl-model-work-block-body-plan-1') as HTMLDivElement;
      let scrollHeight = 180;

      Object.defineProperty(body, 'clientHeight', {
        configurable: true,
        value: 80
      });
      Object.defineProperty(body, 'scrollHeight', {
        configurable: true,
        get: () => scrollHeight
      });

      body.scrollTop = 0;

      rerender(
        <NlWorkPlanPanel
          phase="submitting"
          provider={OPENAI_PROVIDER}
          workPhases={PHASES}
          modelWorkBlocks={MODEL_WORK_BLOCKS}
          isStreaming
          isExpanded
          autoCollapsed={false}
          onToggleExpanded={vi.fn()}
        />
      );

      expect(body.scrollTop).toBe(180);

      scrollHeight = 260;
      rerender(
        <NlWorkPlanPanel
          phase="submitting"
          provider={OPENAI_PROVIDER}
          workPhases={PHASES}
          modelWorkBlocks={[
            {
              ...MODEL_WORK_BLOCKS[0],
              content: `${MODEL_WORK_BLOCKS[0].content} Adding another streamed sentence for the transcript body.`
            },
            MODEL_WORK_BLOCKS[1]
          ]}
          isStreaming
          isExpanded
          autoCollapsed={false}
          onToggleExpanded={vi.fn()}
        />
      );

      expect(body.scrollTop).toBe(260);
    } finally {
      globalThis.requestAnimationFrame = OriginalRequestAnimationFrame;
    }
  });
});
