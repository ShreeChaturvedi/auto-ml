import { describe, expect, it } from 'vitest';

import {
  applyNlWorkPhaseEvent,
  completeNlWorkDonePhase,
  createInitialNlWorkPhases
} from '../nlQuery';

describe('nlQuery work phase helpers', () => {
  it('does not mark earlier pending phases completed when done fails first', () => {
    const initial = createInitialNlWorkPhases();
    const updated = applyNlWorkPhaseEvent(initial, {
      type: 'phase_failed',
      phaseId: 'done',
      summary: 'stream parse failed',
      timestamp: new Date().toISOString()
    });

    const schemaPhase = updated.find((entry) => entry.phaseId === 'schema_context');
    const planningPhase = updated.find((entry) => entry.phaseId === 'planning');
    const donePhase = updated.find((entry) => entry.phaseId === 'done');

    expect(schemaPhase?.status).toBe('pending');
    expect(planningPhase?.status).toBe('pending');
    expect(donePhase?.status).toBe('failed');
  });

  it('marks prior pending phases completed when a forward active phase starts', () => {
    const initial = createInitialNlWorkPhases();
    const updated = applyNlWorkPhaseEvent(initial, {
      type: 'phase_started',
      phaseId: 'planning',
      summary: 'planning started',
      timestamp: new Date().toISOString()
    });

    const schemaPhase = updated.find((entry) => entry.phaseId === 'schema_context');
    const planningPhase = updated.find((entry) => entry.phaseId === 'planning');
    expect(schemaPhase?.status).toBe('completed');
    expect(planningPhase?.status).toBe('active');
  });

  it('completes done phase when terminal done event arrives', () => {
    const initial = createInitialNlWorkPhases();
    const completed = completeNlWorkDonePhase(initial);
    const donePhase = completed.find((entry) => entry.phaseId === 'done');
    expect(donePhase?.status).toBe('completed');
  });
});

