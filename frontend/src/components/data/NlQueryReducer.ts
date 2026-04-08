/**
 * NlQueryReducer
 *
 * State machine (reducer + types) for the NL -> SQL generation workflow.
 * Extracted from NlQueryWorkflow to isolate state logic.
 */

import type { NlGenerationResult } from '@/types/nlQuery';

export type ApproveThemeClasses = {
  hoverText: string;
  hoverBorder: string;
  hoverBg: string;
};

export type NlPhase =
  | 'idle'
  | 'submitting'
  | 'revealing'
  | 'reviewing'
  | 'error';

export interface NlState {
  phase: NlPhase;
  result: NlGenerationResult | null;
  editedSql: string;
  errorMessage: string | null;
}

export type NlAction =
  | { type: 'GENERATE' }
  | { type: 'RESULT'; payload: NlGenerationResult }
  | { type: 'REVEAL_COMPLETE' }
  | { type: 'SQL_EDIT'; payload: string }
  | { type: 'REJECT' }
  | { type: 'ERROR'; payload: string }
  | { type: 'DISMISS_ERROR' };

export function nlReducer(state: NlState, action: NlAction): NlState {
  switch (action.type) {
    case 'GENERATE':
      return { ...state, phase: 'submitting', result: null, editedSql: '', errorMessage: null };
    case 'RESULT':
      return {
        ...state,
        phase: 'revealing',
        result: action.payload,
        editedSql: action.payload.sql,
      };
    case 'REVEAL_COMPLETE':
      if (state.phase !== 'revealing') return state;
      return { ...state, phase: 'reviewing' };
    case 'SQL_EDIT':
      return { ...state, editedSql: action.payload };
    case 'REJECT':
      return { ...state, phase: 'idle', result: null, editedSql: '', errorMessage: null };
    case 'ERROR':
      return { ...state, phase: 'error', errorMessage: action.payload };
    case 'DISMISS_ERROR':
      return { ...state, phase: 'idle', errorMessage: null };
    default:
      return state;
  }
}

export const initialNlState: NlState = {
  phase: 'idle',
  result: null,
  editedSql: '',
  errorMessage: null,
};
