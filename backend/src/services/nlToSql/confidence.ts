import { z } from 'zod';

import { env } from '../../config.js';

import { clampConfidence } from './schemaContext.js';
import type {
  NlConfidenceMode,
  NlExplanation,
  WarningLevel
} from './types.js';
import {
  PASS1_SCHEMA as PASS1_SCHEMA_VAL,
  PASS2_SCHEMA as PASS2_SCHEMA_VAL
} from './types.js';

export function deriveWarningLevel(
  confidence: number,
  assumptions: string[],
  joinPlan: NlExplanation['joinPlan'],
  warnThreshold: number
): WarningLevel {
  const ambiguousJoinCount = joinPlan.filter((join) => join.confidence < 0.6).length;
  const riskyAssumptionCount = assumptions.filter((entry) => {
    const normalized = entry.toLowerCase();
    return (
      normalized.includes('assum')
      || normalized.includes('infer')
      || normalized.includes('best guess')
      || normalized.includes('may ')
      || normalized.includes('might ')
      || normalized.includes('likely')
      || normalized.includes('unclear')
      || normalized.includes('unknown')
      || normalized.includes('approx')
      || normalized.includes('estimate')
    );
  }).length;

  if (confidence < 0.45 || ambiguousJoinCount >= 2 || riskyAssumptionCount >= 3) {
    return 'high';
  }

  if (confidence < warnThreshold || ambiguousJoinCount >= 1 || riskyAssumptionCount >= 2) {
    return 'medium';
  }

  if (confidence >= 0.9 && ambiguousJoinCount === 0 && riskyAssumptionCount <= 1) {
    return 'none';
  }

  if (confidence < 0.85 || riskyAssumptionCount >= 1) {
    return 'low';
  }

  return 'none';
}

export function deriveReliabilityTier(
  confidenceMode: NlConfidenceMode,
  warningLevel: WarningLevel
): NlExplanation['reliabilityTier'] {
  if (confidenceMode === 'repair') {
    if (warningLevel === 'high' || warningLevel === 'medium') {
      return 'low';
    }
    return 'medium';
  }

  if (warningLevel === 'none') {
    return 'high';
  }
  if (warningLevel === 'low') {
    return 'medium';
  }
  return 'low';
}

export function resolveWarnConfidenceThreshold(): number {
  return Number.isFinite(env.nl2sqlWarnConfidenceThreshold)
    ? env.nl2sqlWarnConfidenceThreshold
    : 0.72;
}

export function mergeExplanation(
  planning: z.infer<typeof PASS1_SCHEMA_VAL>,
  execution: z.infer<typeof PASS2_SCHEMA_VAL>,
  validateNotes: string[],
  confidenceMode: NlConfidenceMode
): NlExplanation {
  const selectedTables = Array.from(new Set([
    ...planning.selectedTables,
    ...execution.selectedTables
  ])).filter(Boolean);

  const joinPlan = (execution.joinPlan.length > 0 ? execution.joinPlan : planning.joinPlan)
    .map((join) => ({
      leftTable: join.leftTable,
      leftColumn: join.leftColumn,
      rightTable: join.rightTable,
      rightColumn: join.rightColumn,
      joinType: join.joinType,
      confidence: clampConfidence(join.confidence),
      reason: join.reason
    }));

  const assumptions = Array.from(new Set([
    ...planning.assumptions,
    ...execution.assumptions
  ])).filter(Boolean);

  const validationNotes = Array.from(new Set([
    ...execution.validationNotes,
    ...validateNotes
  ])).filter(Boolean);

  const confidence = clampConfidence(execution.confidence ?? planning.confidence);
  const warningLevel = deriveWarningLevel(
    confidence,
    assumptions,
    joinPlan,
    resolveWarnConfidenceThreshold()
  );
  const reliabilityTier = deriveReliabilityTier(confidenceMode, warningLevel);

  return {
    intentSummary: execution.intentSummary ?? planning.intentSummary,
    selectedTables,
    joinPlan,
    filters: execution.filters.length > 0 ? execution.filters : planning.filters,
    aggregations: execution.aggregations.length > 0 ? execution.aggregations : planning.aggregations,
    assumptions,
    validationNotes,
    confidence,
    warningLevel,
    confidenceMode,
    reliabilityTier
  };
}
