import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NlWorkPlanPanel } from '../NlWorkPlanPanel';
import type { NlQueryExplanation } from '@/lib/api/query';
import type { NlModelWorkBlockState, NlWorkPhaseState } from '@/types/nlQuery';

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
  intentSummary: 'Fallback plan for ranking students.',
  selectedTables: ['checkpoints_pulse'],
  joinPlan: [],
  filters: [],
  aggregations: [],
  assumptions: ['Model generation timed out; deterministic fallback SQL was generated.'],
  validationNotes: [
    'Model timeout triggered deterministic fallback SQL.',
    'debug: provider fallback detail: quota exceeded'
  ],
  confidence: 0.48,
  warningLevel: 'high',
  confidenceMode: 'deterministic_fallback',
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
  it('renders active phase stream details during submitting', () => {
    render(
        <NlWorkPlanPanel
        phase="submitting"
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.getAllByText(/planning sql strategy/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('nl-model-work-block-plan-1')).toBeInTheDocument();
  });

  it('calls toggle callback when collapse control is clicked', () => {
    const onToggle = vi.fn();
    render(
      <NlWorkPlanPanel
        phase="submitting"
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
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming
        isExpanded={false}
        autoCollapsed
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.queryByText(/streaming status will appear here/i)).not.toBeInTheDocument();
  });

  it('shows confidence percentage only in model mode', () => {
    render(
      <NlWorkPlanPanel
        phase="reviewing"
        explanation={MODEL_EXPLANATION}
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming={false}
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.getByText(/model review/i)).toBeInTheDocument();
    expect(screen.getByText(/confidence 91%/i)).toBeInTheDocument();
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
        workPhases={completedPhases}
        modelWorkBlocks={[]}
        isStreaming={false}
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.getAllByText(/^done$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/nl query pipeline finished/i).length).toBeGreaterThan(0);
  });

  it('does not show percentage in deterministic fallback mode and keeps debug collapsed', () => {
    render(
      <NlWorkPlanPanel
        phase="reviewing"
        explanation={FALLBACK_EXPLANATION}
        workPhases={PHASES}
        modelWorkBlocks={MODEL_WORK_BLOCKS}
        isStreaming={false}
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.queryByText(/confidence\s+\d+%/i)).not.toBeInTheDocument();
    expect(screen.getByText(/fallback review/i)).toBeInTheDocument();
    expect(screen.getByText(/debug details/i)).toBeInTheDocument();
  });

  it('shows streamed model work blocks during review alongside reliability factors', () => {
    render(
      <NlWorkPlanPanel
        phase="reviewing"
        explanation={FALLBACK_EXPLANATION}
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
    expect(screen.getByText(/reliability factors/i)).toBeInTheDocument();
  });
});
