/**
 * OK/Fail response envelope builders for preprocessing tool results
 */

import type { ReasonCode, ToolEnvelope } from './types.js';

export function ok(runId: string, data: Omit<ToolEnvelope, 'runId' | 'isError' | 'reasonCode'>): {
  output: ToolEnvelope;
  error?: string;
} {
  return {
    output: {
      runId,
      isError: false,
      reasonCode: null,
      ...data
    }
  };
}

export function fail(
  runId: string,
  reasonCode: ReasonCode,
  message: string,
  data: Omit<ToolEnvelope, 'runId' | 'isError' | 'reasonCode'> = {}
): {
  output: ToolEnvelope;
  error: string;
} {
  return {
    output: {
      runId,
      isError: true,
      reasonCode,
      ...data
    },
    error: message
  };
}
